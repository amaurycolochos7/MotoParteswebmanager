import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_WEB_VERSION = '2.3000.1040081378-alpha';
const DEFAULT_VERSION_MANIFEST_URL = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/versions.json';
const DEFAULT_VERSION_HTML_BASE_URL = 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html';
const WEB_VERSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cachedWebVersion = null;
let cachedWebVersionAt = 0;

/**
 * Resuelve la ruta absoluta para almacenar sesiones de WhatsApp.
 * - En Docker: usa WWEBJS_DATA_PATH (ej. /app/.wwebjs_auth)
 * - Local: resuelve a apps/whatsapp-bot/.wwebjs_auth
 */
function sessionsPath() {
    return process.env.WWEBJS_DATA_PATH
        ? process.env.WWEBJS_DATA_PATH
        : path.resolve(__dirname, '..', '.wwebjs_auth');
}

/** Timeout helper: rechaza después de ms milisegundos */
function withTimeout(promise, ms, label = 'Operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
    ]);
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchJson(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'user-agent': 'motopartes-whatsapp-bot' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

async function versionHtmlExists(version, baseUrl, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${baseUrl}/${version}.html`, {
            method: 'HEAD',
            signal: controller.signal,
            headers: { 'user-agent': 'motopartes-whatsapp-bot' },
        });
        return res.ok;
    } finally {
        clearTimeout(timeout);
    }
}

async function resolveWebVersionOptions() {
    const mode = (process.env.WWEBJS_WEB_VERSION || 'auto').trim();
    const cacheType = (process.env.WWEBJS_WEB_VERSION_CACHE || 'remote').trim();

    if (cacheType === 'none' || mode === 'latest' || mode === 'none') {
        console.log('[WA Web] Using live WhatsApp Web (web version cache disabled).');
        return { webVersionCache: { type: 'none' } };
    }

    const baseUrl = (process.env.WWEBJS_VERSION_HTML_BASE_URL || DEFAULT_VERSION_HTML_BASE_URL).replace(/\/$/, '');
    const now = Date.now();

    let version = null;
    let usedCachedVersion = false;
    if (mode !== 'auto') {
        version = mode;
    } else if (cachedWebVersion && now - cachedWebVersionAt < WEB_VERSION_CACHE_TTL_MS) {
        version = cachedWebVersion;
        usedCachedVersion = true;
    } else {
        try {
            const manifestUrl = process.env.WWEBJS_VERSION_MANIFEST_URL || DEFAULT_VERSION_MANIFEST_URL;
            const manifest = await fetchJson(manifestUrl);
            const candidates = [
                manifest?.currentVersion,
                ...(Array.isArray(manifest?.versions)
                    ? manifest.versions.map(v => v?.version).reverse()
                    : []),
            ].filter(Boolean);

            for (const candidate of candidates) {
                if (await versionHtmlExists(candidate, baseUrl)) {
                    version = candidate;
                    break;
                }
            }
        } catch (err) {
            console.warn(`[WA Web] Could not resolve current archived version: ${err.message}`);
        }

        version ||= DEFAULT_WEB_VERSION;
        cachedWebVersion = version;
        cachedWebVersionAt = now;
    }

    if (!(await versionHtmlExists(version, baseUrl).catch(() => false))) {
        if (mode === 'auto' && usedCachedVersion) {
            cachedWebVersion = null;
            cachedWebVersionAt = 0;
            return resolveWebVersionOptions();
        }
        console.warn(`[WA Web] Archived version ${version} is unavailable. Falling back to live WhatsApp Web.`);
        return { webVersionCache: { type: 'none' } };
    }

    console.log(`[WA Web] Using archived WhatsApp Web version ${version}`);
    return {
        webVersion: version,
        webVersionCache: {
            type: 'remote',
            remotePath: `${baseUrl}/{version}.html`,
            strict: false,
        },
    };
}

class WhatsAppSession extends EventEmitter {
    constructor(mechanicId, prisma) {
        super();
        this.mechanicId = mechanicId;
        this.prisma = prisma;
        this.client = null;
        this.initializing = false; // mutex para evitar doble init
        this.isConnected = false;
        this.lastQr = null;
        this.phoneNumber = null;
        this._heartbeatInterval = null;
        this._terminalReasonEmitted = false;
    }

    async initialize() {
        // Mutex: si ya está inicializando o ya conectado, no hacer nada
        if (this.initializing) {
            console.log(`⚠️ Session ${this.mechanicId} already initializing, skipping.`);
            return;
        }
        if (this.client && this.isConnected) {
            console.log(`⚠️ Session ${this.mechanicId} already connected, skipping.`);
            return;
        }

        this.initializing = true;
        this.lastError = null;
        this._terminalReasonEmitted = false;
        console.log(`🔧 Initializing WhatsApp client for mechanic ${this.mechanicId}...`);

        // Detect Chrome binary
        let chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || null;

        if (chromePath) {
            console.log(`🔍 Using env Chrome path: ${chromePath}`);
            try {
                fs.accessSync(chromePath, fs.constants.X_OK);
                console.log(`✅ Chrome binary exists and is executable`);
            } catch (e) {
                console.warn(`⚠️ Env Chrome path not found: ${chromePath}, letting Puppeteer use its default`);
                chromePath = null;
            }
        }

        if (!chromePath) {
            // Check system paths as fallback
            const systemPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
            for (const sp of systemPaths) {
                try {
                    fs.accessSync(sp, fs.constants.X_OK);
                    console.log(`✅ Found system Chrome at: ${sp}`);
                    chromePath = sp;
                    break;
                } catch { /* skip */ }
            }
            if (!chromePath) {
                console.log(`📦 No system Chrome found, Puppeteer will use its bundled Chrome`);
            }
        }

        const dataPath = sessionsPath();
        console.log(`📂 Session data path: ${dataPath}`);

        this._qrCount = 0; // Track QR regeneration attempts
        const qrMaxRetries = parsePositiveInt(process.env.WWEBJS_QR_MAX_RETRIES, 6);
        const authTimeoutMs = parsePositiveInt(process.env.WWEBJS_AUTH_TIMEOUT_MS, 180000);
        const initTimeoutMs = parsePositiveInt(process.env.WWEBJS_INIT_TIMEOUT_MS, authTimeoutMs + 30000);
        const webVersionOptions = await resolveWebVersionOptions();

        // Session data is preserved for persistence across deploys.
        // The Docker named volume (whatsapp_data) survives container rebuilds.
        // Cleanup only happens on explicit auth_failure events (see below).
        const sessionDir = path.join(dataPath, `session-${this.mechanicId}`);
        if (fs.existsSync(sessionDir)) {
            console.log(`📂 Found existing session data at: ${sessionDir} — reusing for persistence`);
            // Clean up stale Chromium lock files from previous container runs.
            // These prevent Puppeteer from launching after container restarts.
            // NOTE: SingletonLock is a symlink whose target is "hostname-pid"; when the
            // previous container dies the target becomes unreachable and fs.existsSync()
            // returns false for the broken symlink. We use fs.lstatSync (which does NOT
            // follow symlinks) + unconditional unlink to cover both cases.
            const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
            for (const lockFile of lockFiles) {
                const lockPath = path.join(sessionDir, lockFile);
                try {
                    fs.lstatSync(lockPath); // throws if file/symlink is absent
                    fs.unlinkSync(lockPath);
                    console.log(`🔓 Removed stale Chrome lock: ${lockFile}`);
                } catch (e) {
                    if (e.code !== 'ENOENT') {
                        console.warn(`⚠️ Could not remove lock file ${lockFile}: ${e.message}`);
                    }
                }
            }
        } else {
            console.log(`📂 No existing session data — will need QR scan`);
        }

        try {
            console.log(`📱 Step 1: Creating Client instance...`);
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: String(this.mechanicId),
                    dataPath: dataPath,
                }),

                // Use an archived WhatsApp Web build when available. This avoids
                // WhatsApp's live A/B rollout breaking whatsapp-web.js mid-month,
                // while still auto-updating when archived builds rotate.
                ...webVersionOptions,

                // Give WhatsApp Web more time to load in Docker (default 30s is too short)
                authTimeoutMs,
                qrMaxRetries,
                // Bypass CSP to allow script injection
                bypassCSP: true,
                // CRITICAL: Override the outdated Chrome/101 default user agent.
                // WhatsApp Web refuses to serve its JS app to old Chrome versions (serves 1365-byte empty shell instead).
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

                puppeteer: {
                    headless: 'new', // CRITICAL: 'new' mode is undetectable; old 'true' mode is blocked by WhatsApp
                    ...(chromePath ? { executablePath: chromePath } : {}),
                    timeout: authTimeoutMs,
                    protocolTimeout: initTimeoutMs,
                    defaultViewport: null,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-extensions',
                        '--disable-software-rasterizer',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-features=Translate,BackForwardCache,MediaRouter,OptimizationHints',
                        '--window-size=1280,720',
                    ],
                },
            });
            console.log(`✅ Step 1 done: Client created`);

            // Sanity check
            if (!this.client || typeof this.client.on !== 'function') {
                throw new Error('Client instance is broken (missing .on)');
            }

            // QR Event - track regeneration count, bail out after N unscanned QRs.
            this.client.on('qr', (qr) => {
                this._qrCount++;
                console.log(`📱 QR generated for mechanic ${this.mechanicId} (attempt ${this._qrCount})`);
                this.lastQr = qr;
                this.isConnected = false;
                this.emit('qr', qr);

                if (this._qrCount >= qrMaxRetries) {
                    console.error(`❌ Too many QR regenerations (${this._qrCount}) for ${this.mechanicId} — stopping to prevent runaway loop`);
                    this.lastError = 'El código QR expiró. Reintentando con sesión limpia…';
                    this.lastQr = null;
                    // Wipe the on-disk session folder. After several unscanned QRs the
                    // local LocalAuth state is invariably stale (auth tokens that
                    // no longer pair with anything on the WhatsApp side), and
                    // reusing it makes the next attempt regenerate QRs that the
                    // phone shows as "expired/invalid" without ever reaching the
                    // real pairing flow. Wiping forces a clean cold start.
                    void this._stopForRelink('qr_exhausted', true);
                }
            });

            this.client.on('loading_screen', (percent, message) => {
                console.log(`⏳ Loading WhatsApp Web ${percent}%: ${message || ''}`);
            });

            // Authenticated
            this.client.on('authenticated', () => {
                console.log(`🔑 Authenticated: mechanic ${this.mechanicId}`);
                this.lastQr = null;
            });

            // Ready
            this.client.on('ready', () => {
                console.log(`✅ Ready: mechanic ${this.mechanicId}`);
                this.isConnected = true;
                this._terminalReasonEmitted = false;
                this.lastReadyAt = new Date();
                this.lastQr = null;
                this.lastError = null;
                const info = this.client.info;
                this.phoneNumber = info?.wid?.user || null;
                this.pushname = info?.pushname || null;
                this.platform = info?.platform || 'Web';
                console.log(`📱 Connected as: ${this.pushname} (${this.phoneNumber}) on ${this.platform}`);
                this.emit('ready');

                // Start heartbeat
                this._startHeartbeat();
            });

            // Disconnected
            this.client.on('disconnected', (reason) => {
                if (this._terminalReasonEmitted) return;
                this._terminalReasonEmitted = true;
                console.log(`🔴 Disconnected: mechanic ${this.mechanicId} - ${reason}`);
                this.isConnected = false;
                this.lastQr = null;
                this._stopHeartbeat();

                // ponytail: wipe session dir on disconnect so next QR starts clean.
                // Stale tokens cause "intente más tarde" error on the phone.
                // Upgrade path: selective wipe only on token-related reasons.
                if (reason !== 'LOGOUT' && reason !== 'NAVIGATION') {
                    this._wipeSessionDir();
                }

                this.emit('disconnected', reason);

                // Auto-restart if disconnected due to QR timeout
                if (reason === 'Max qrcode retries reached') {
                    console.log(`🔄 QR timeout for ${this.mechanicId}, emitting qr_timeout for auto-restart...`);
                    this.emit('qr_timeout');
                }
            });

            // Auth failure - log detailed info and clean up stale session data
            this.client.on('auth_failure', async (msg) => {
                this.isConnected = false;
                this.lastError = `Error de autenticación: ${msg}. Intenta cerrar sesión y vincular de nuevo.`;
                this.lastQr = null;
                console.error(`❌ Auth failure for mechanic ${this.mechanicId}:`, msg);
                console.error(`   QR attempts before failure: ${this._qrCount}`);

                // Clean up stale session data to allow fresh pairing
                try {
                    const sessionDir = path.join(dataPath, `session-${this.mechanicId}`);
                    if (fs.existsSync(sessionDir)) {
                        console.log(`🗑️ Cleaning stale session data: ${sessionDir}`);
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }
                } catch (cleanErr) {
                    console.error(`⚠️ Could not clean session data:`, cleanErr.message);
                }

                this.emit('disconnected', 'auth_failure');
            });

            console.log(`🚀 Step 2: Launching Puppeteer for mechanic ${this.mechanicId}...`);

            // Initialize with a hard timeout. If WhatsApp Web hangs, destroy the
            // browser and let SessionManager recreate the session cleanly.
            await Promise.race([
                this.client.initialize(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`client.initialize() timed out after ${initTimeoutMs}ms`)), initTimeoutMs)
                ),
            ]);
            console.log(`✅ Step 2 done: Client initialized for mechanic ${this.mechanicId}`);

        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err || 'Unknown error');
            const errStack = err instanceof Error ? err.stack : new Error().stack;
            console.error(`❌ Error initializing client for ${this.mechanicId}:`, errMsg);
            console.error('Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err || {}), 2));
            console.error(errStack);
            this.isConnected = false;
            this.lastQr = null;
            this.lastError = errMsg;
            this._stopHeartbeat();
            await this._destroyClientOnly(`initialize failed for ${this.mechanicId}`);
            this._cleanupSessionLocks();
            throw err;

        } finally {
            this.initializing = false; // siempre liberar el mutex
        }
    }

    async sendMessage(phone, message) {
        if (!this.isConnected || !this.client) {
            throw new Error(`Session ${this.mechanicId} not connected`);
        }

        // Format phone: ensure it has country code and @c.us
        const formatted = this._formatPhone(phone);
        console.log(`📤 Sending message to ${formatted}...`);

        try {
            // Use getNumberId to resolve the WhatsApp ID properly (fixes "No LID" error)
            const numberId = await this.client.getNumberId(formatted.replace('@c.us', ''));
            if (numberId) {
                console.log(`✅ Number resolved: ${numberId._serialized}`);
                const result = await this.client.sendMessage(numberId._serialized, message);
                return { success: true, messageId: result.id._serialized };
            } else {
                console.warn(`⚠️ Number ${formatted} is not registered on WhatsApp`);
                throw new Error(`El número ${phone} no está registrado en WhatsApp`);
            }
        } catch (err) {
            // If getNumberId fails, try direct send as fallback
            if (err.message && err.message.includes('no está registrado')) {
                throw err;
            }
            console.warn(`⚠️ getNumberId failed, trying direct send: ${err.message}`);
            try {
                const result = await this.client.sendMessage(formatted, message);
                return { success: true, messageId: result.id._serialized };
            } catch (directErr) {
                console.error(`❌ Direct send also failed: ${directErr.message}`);
                throw directErr;
            }
        }
    }

    async sendMedia(phone, message, mediaUrl) {
        if (!this.isConnected || !this.client) {
            throw new Error(`Session ${this.mechanicId} not connected`);
        }

        const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
        const formatted = this._formatPhone(phone);
        const result = await this.client.sendMessage(formatted, media, { caption: message || '' });
        return { success: true, messageId: result.id._serialized };
    }

    async sendDocument(phone, message, base64Data, filename, mimetype) {
        if (!this.isConnected || !this.client) {
            throw new Error(`Session ${this.mechanicId} not connected`);
        }

        const media = new MessageMedia(
            mimetype || 'application/pdf',
            base64Data,
            filename || 'document.pdf'
        );
        const formatted = this._formatPhone(phone);
        console.log(`Sending document "${filename}" to ${formatted}...`);

        try {
            const numberId = await this.client.getNumberId(formatted.replace('@c.us', ''));
            const chatId = numberId ? numberId._serialized : formatted;
            const result = await this.client.sendMessage(chatId, media, {
                caption: message || '',
                sendMediaAsDocument: true,
            });
            return { success: true, messageId: result.id._serialized };
        } catch (err) {
            console.error(`Failed to send document: ${err.message}`);
            throw err;
        }
    }

    /**
     * Cierra sesión de WhatsApp de forma real: envía señal de logout
     * al servidor de WA (desvincula el dispositivo) y luego destruye el cliente.
     * Esto borra la autenticación local para que no se reconecte automáticamente.
     */
    async logout() {
        this._stopHeartbeat();
        try {
            this.isConnected = false;
            if (this.client) {
                // client.logout() sends actual logout to WhatsApp servers
                // and clears local auth data so session can't auto-restore
                console.log(`🔓 Logging out WhatsApp session for ${this.mechanicId}...`);
                await withTimeout(
                    this.client.logout(),
                    15000,
                    `client.logout(${this.mechanicId})`
                );
                console.log(`✅ WhatsApp session logged out for ${this.mechanicId}`);
            }
        } catch (err) {
            console.error(`Error logging out client ${this.mechanicId}:`, err.message);
        } finally {
            // After logout, destroy the browser instance
            try {
                if (this.client) {
                    await withTimeout(
                        this.client.destroy(),
                        10000,
                        `client.destroy(${this.mechanicId}) after logout`
                    );
                }
            } catch (destroyErr) {
                console.error(`Error destroying after logout ${this.mechanicId}:`, destroyErr.message);
            }
            this.client = null;
            this.initializing = false;
            // Wipe the on-disk session folder. client.logout() promises to clear
            // local auth, but in practice it leaves a half-cleaned Default/ profile
            // whose stale tokens the WA server rejects on the next QR pairing —
            // the phone shows "no es posible conectarse" until 10 QRs expire and
            // the qr_exhausted handler wipes manually. Doing it here makes the
            // very next initialize() start from a guaranteed-clean state.
            this._wipeSessionDir();
        }
    }

    /**
     * Destruye el cliente de forma segura con timeout.
     * Si client.destroy() se queda colgado (init parcial, Chrome zombie),
     * el timeout de 15s lo fuerza a continuar.
     * SIEMPRE limpia referencias en finally.
     */
    async destroy() {
        this._stopHeartbeat();
        await this._destroyClientOnly(`client.destroy(${this.mechanicId})`);
    }

    async _destroyClientOnly(label = 'client.destroy') {
        try {
            this.isConnected = false;
            if (this.client) {
                await withTimeout(
                    this.client.destroy(),
                    15000,
                    label
                );
            }
        } catch (err) {
            console.error(`Error destroying client ${this.mechanicId}:`, err.message);
        } finally {
            // SIEMPRE limpiar aunque destroy() falle o haga timeout
            this.client = null;
            this.initializing = false;
        }
    }

    async _stopForRelink(reason, wipeSessionDir = false) {
        if (this._terminalReasonEmitted) return;
        this._terminalReasonEmitted = true;
        this.isConnected = false;
        this.lastQr = null;
        this._stopHeartbeat();
        await this._destroyClientOnly(`client.destroy(${this.mechanicId}) after ${reason}`);
        if (wipeSessionDir) this._wipeSessionDir();
        this.emit('disconnected', reason);
    }

    _formatPhone(phone) {
        // Remove all non-digits
        let digits = phone.replace(/\D/g, '');

        // Remove leading 0
        if (digits.startsWith('0')) digits = digits.substring(1);

        // Add Mexico country code (52) if not present
        if (!digits.startsWith('52') && digits.length === 10) {
            digits = '52' + digits;
        }

        // Remove extra 1 after 52 (52-1-xxx → 52-xxx)
        if (digits.startsWith('521') && digits.length === 13) {
            digits = '52' + digits.substring(3);
        }

        return digits + '@c.us';
    }

    _startHeartbeat() {
        this._stopHeartbeat();
        this._heartbeatInterval = setInterval(async () => {
            if (this.isConnected) {
                try {
                    await this.prisma.whatsappSession.update({
                        where: { mechanic_id: this.mechanicId },
                        data: { last_heartbeat: new Date() }
                    });
                } catch (err) {
                    // ignore
                }
            }
        }, 60000); // every minute
    }

    _stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    }

    _cleanupSessionLocks() {
        const dir = path.join(sessionsPath(), `session-${this.mechanicId}`);
        const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
        for (const lockFile of lockFiles) {
            const lockPath = path.join(dir, lockFile);
            try {
                fs.lstatSync(lockPath);
                fs.unlinkSync(lockPath);
                console.log(`🔓 Removed Chrome lock after failure: ${lockFile}`);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.warn(`⚠️ Could not remove Chrome lock ${lockFile}: ${err.message}`);
                }
            }
        }
    }

    /**
     * Recursively delete the LocalAuth folder for this mechanicId. Used when
     * we know the on-disk session is unrecoverable (qr_exhausted, auth_failure,
     * explicit logout). Safe to call when the folder is missing.
     */
    _wipeSessionDir() {
        try {
            const dir = path.join(sessionsPath(), `session-${this.mechanicId}`);
            if (fs.existsSync(dir)) {
                fs.rmSync(dir, { recursive: true, force: true });
                console.log(`🗑️ Wiped session dir: ${dir}`);
            }
        } catch (err) {
            console.warn(`⚠️ Could not wipe session dir for ${this.mechanicId}: ${err.message}`);
        }
    }
}

export default WhatsAppSession;
