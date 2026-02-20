import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

        // Session data is preserved for persistence across deploys.
        // The Docker named volume (whatsapp_data) survives container rebuilds.
        // Cleanup only happens on explicit auth_failure events (see below).
        const sessionDir = path.join(dataPath, `session-${this.mechanicId}`);
        if (fs.existsSync(sessionDir)) {
            console.log(`📂 Found existing session data at: ${sessionDir} — reusing for persistence`);
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

                // Disable version caching — let WhatsApp Web serve its current version directly.
                // The patch-wwebjs.cjs disables the broken ocVersion Error override that
                // prevents modern WA Web from loading. With the patch applied, 'none' cache
                // type is the most reliable approach.
                webVersionCache: {
                    type: 'none',
                },

                // Give WhatsApp Web more time to load in Docker (default 30s is too short)
                authTimeoutMs: 120000,
                qrMaxRetries: 5, // Limit QR regeneration attempts
                // Bypass CSP to allow script injection
                bypassCSP: true,
                // CRITICAL: Override the outdated Chrome/101 default user agent.
                // WhatsApp Web refuses to serve its JS app to old Chrome versions (serves 1365-byte empty shell instead).
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

                puppeteer: {
                    headless: 'new', // CRITICAL: 'new' mode is undetectable; old 'true' mode is blocked by WhatsApp
                    ...(chromePath ? { executablePath: chromePath } : {}),
                    timeout: 120000, // 120 seconds to launch
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-extensions',
                        '--disable-software-rasterizer',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                    ],
                },
            });
            console.log(`✅ Step 1 done: Client created`);

            // Sanity check
            if (!this.client || typeof this.client.on !== 'function') {
                throw new Error('Client instance is broken (missing .on)');
            }

            // QR Event - track regeneration count
            this.client.on('qr', (qr) => {
                this._qrCount++;
                console.log(`📱 QR generated for mechanic ${this.mechanicId} (attempt ${this._qrCount})`);
                this.lastQr = qr;
                this.isConnected = false;
                this.emit('qr', qr);

                // If too many QR regenerations, something is wrong
                if (this._qrCount >= 10) {
                    console.error(`❌ Too many QR regenerations (${this._qrCount}) for ${this.mechanicId} - possible version mismatch`);
                    this.lastError = 'Demasiados intentos de QR. El código QR se está regenerando muy rápido. Intenta cerrar sesión y volver a conectar.';
                }
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
                this.lastQr = null;
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
                console.log(`🔴 Disconnected: mechanic ${this.mechanicId} - ${reason}`);
                this.isConnected = false;
                this._stopHeartbeat();
                this.emit('disconnected', reason);
            });

            // Auth failure - log detailed info and clean up stale session data
            this.client.on('auth_failure', async (msg) => {
                this.isConnected = false;
                this.lastError = `Error de autenticación: ${msg}. Intenta cerrar sesión y vincular de nuevo.`;
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

            // Initialize with a 120-second timeout that actually cancels the hung call
            await Promise.race([
                this.client.initialize(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('client.initialize() timed out after 120s')), 120000)
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
            this.lastError = errMsg;

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
        const result = await this.client.sendMessage(formatted, message);
        return { success: true, messageId: result.id._serialized };
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

    /**
     * Destruye el cliente de forma segura con timeout.
     * Si client.destroy() se queda colgado (init parcial, Chrome zombie),
     * el timeout de 15s lo fuerza a continuar.
     * SIEMPRE limpia referencias en finally.
     */
    async destroy() {
        this._stopHeartbeat();
        try {
            this.isConnected = false;
            if (this.client) {
                await withTimeout(
                    this.client.destroy(),
                    15000,
                    `client.destroy(${this.mechanicId})`
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
}

export default WhatsAppSession;
