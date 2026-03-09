import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import QRCode from 'qrcode';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resuelve la ruta para almacenar sesiones de WhatsApp.
 * Docker: usa WWEBJS_DATA_PATH | Local: ./. wwebjs_auth
 */
function sessionsPath() {
    return process.env.WWEBJS_DATA_PATH || path.resolve(__dirname, '..', '.wwebjs_auth');
}

/** Timeout helper */
function withTimeout(promise, ms, label = 'Operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
    ]);
}

class WhatsAppSession extends EventEmitter {
    constructor(sessionId, prisma) {
        super();
        this.sessionId = sessionId;
        this.prisma = prisma;
        this.client = null;
        this.initializing = false;
        this.isConnected = false;
        this.lastQr = null;
        this.phoneNumber = null;
        this.pushname = null;
        this._heartbeatInterval = null;
        this._qrCount = 0;
        this.lastError = null;
    }

    async initialize() {
        if (this.initializing) {
            console.log(`[${this.sessionId}] Already initializing, skipping.`);
            return;
        }
        if (this.client && this.isConnected) {
            console.log(`[${this.sessionId}] Already connected, skipping.`);
            return;
        }

        this.initializing = true;
        this.lastError = null;
        this._qrCount = 0;
        console.log(`[${this.sessionId}] Initializing WhatsApp client...`);

        // Detect Chrome binary
        let chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || null;
        if (chromePath) {
            try {
                fs.accessSync(chromePath, fs.constants.X_OK);
                console.log(`[${this.sessionId}] Chrome found at env path: ${chromePath}`);
            } catch {
                console.warn(`[${this.sessionId}] Env Chrome path ${chromePath} not found, trying fallbacks`);
                chromePath = null;
            }
        }
        if (!chromePath) {
            for (const sp of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
                try { fs.accessSync(sp, fs.constants.X_OK); chromePath = sp; console.log(`[${this.sessionId}] Chrome found at: ${sp}`); break; } catch { }
            }
        }
        if (!chromePath) {
            console.error(`[${this.sessionId}] NO Chrome binary found! Sessions will fail.`);
        }

        const dataPath = sessionsPath();
        const sessionDir = path.join(dataPath, `session-${this.sessionId}`);

        // Clean ALL stale Chromium lock files recursively from previous container runs
        const lockNames = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
        function cleanLocksRecursive(dir) {
            if (!fs.existsSync(dir)) return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (lockNames.includes(entry.name)) {
                        try { fs.unlinkSync(fullPath); console.log(`[cleanup] Removed lock: ${fullPath}`); } catch { }
                    } else if (entry.isDirectory()) {
                        cleanLocksRecursive(fullPath);
                    }
                }
            } catch { }
        }
        cleanLocksRecursive(dataPath);

        try {
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: String(this.sessionId),
                    dataPath: dataPath,
                }),
                authTimeoutMs: 180000,
                qrMaxRetries: 0,
                bypassCSP: true,
                webVersionCache: {
                    type: 'remote',
                    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1033759004-alpha.html',
                },
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                puppeteer: {
                    headless: 'new',
                    ...(chromePath ? { executablePath: chromePath } : {}),
                    timeout: 120000,
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

            // --- Events ---

            this.client.on('loading_screen', (percent, message) => {
                console.log(`[${this.sessionId}] Loading screen: ${percent}% — ${message}`);
            });

            this.client.on('qr', async (qr) => {
                this._qrCount++;
                console.log(`[${this.sessionId}] QR generated (attempt ${this._qrCount})`);
                try {
                    this.lastQr = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
                } catch {
                    this.lastQr = qr; // fallback to raw string
                }
                this.isConnected = false;
                this.emit('qr', this.lastQr);

                if (this._qrCount >= 10) {
                    this.lastError = 'Demasiados intentos de QR. Intenta cerrar sesion y volver a conectar.';
                }
            });

            this.client.on('authenticated', () => {
                console.log(`[${this.sessionId}] Authenticated`);
                this.lastQr = null;
            });

            this.client.on('ready', () => {
                console.log(`[${this.sessionId}] Ready`);
                this.isConnected = true;
                this.lastQr = null;
                this.phoneNumber = this.client.info?.wid?.user || null;
                this.pushname = this.client.info?.pushname || null;
                this.emit('ready');
                this._startHeartbeat();
            });

            // Incoming messages — emit to SessionManager/AutoResponder
            this.client.on('message', (msg) => {
                this.emit('message', msg);
            });

            this.client.on('disconnected', (reason) => {
                console.log(`[${this.sessionId}] Disconnected: ${reason}`);
                this.isConnected = false;
                this._stopHeartbeat();
                this.emit('disconnected', reason);

                if (reason === 'Max qrcode retries reached') {
                    this.emit('qr_timeout');
                }
            });

            this.client.on('auth_failure', async (msg) => {
                this.isConnected = false;
                this.lastError = `Error de autenticacion: ${msg}`;
                console.error(`[${this.sessionId}] Auth failure:`, msg);
                try {
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }
                } catch { }
                this.emit('disconnected', 'auth_failure');
            });

            // Initialize with timeout (180s to allow slow WA Web load)
            console.log(`[${this.sessionId}] Starting client.initialize()...`);
            await Promise.race([
                this.client.initialize(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('client.initialize() timed out after 180s')), 180000)
                ),
            ]);

        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err || 'Unknown error');
            console.error(`[${this.sessionId}] Init error:`, errMsg);
            this.isConnected = false;
            this.lastError = errMsg;
        } finally {
            this.initializing = false;
        }
    }

    async sendMessage(phone, message) {
        if (!this.isConnected || !this.client) {
            throw new Error(`Session ${this.sessionId} not connected`);
        }

        const formatted = this._formatPhone(phone);
        try {
            const numberId = await this.client.getNumberId(formatted.replace('@c.us', ''));
            if (numberId) {
                const result = await this.client.sendMessage(numberId._serialized, message);
                return { success: true, messageId: result.id._serialized };
            } else {
                throw new Error(`El numero ${phone} no esta registrado en WhatsApp`);
            }
        } catch (err) {
            if (err.message?.includes('no esta registrado')) throw err;
            // Fallback: direct send
            try {
                const result = await this.client.sendMessage(formatted, message);
                return { success: true, messageId: result.id._serialized };
            } catch (directErr) {
                throw directErr;
            }
        }
    }

    async sendMedia(phone, message, mediaUrl) {
        if (!this.isConnected || !this.client) {
            throw new Error(`Session ${this.sessionId} not connected`);
        }
        const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
        const formatted = this._formatPhone(phone);
        const result = await this.client.sendMessage(formatted, media, { caption: message || '' });
        return { success: true, messageId: result.id._serialized };
    }

    async logout() {
        this._stopHeartbeat();
        try {
            this.isConnected = false;
            if (this.client) {
                await withTimeout(this.client.logout(), 15000, `logout(${this.sessionId})`);
            }
        } catch (err) {
            console.error(`[${this.sessionId}] Logout error:`, err.message);
        } finally {
            try {
                if (this.client) {
                    await withTimeout(this.client.destroy(), 10000, `destroy after logout(${this.sessionId})`);
                }
            } catch { }
            this.client = null;
            this.initializing = false;
        }
    }

    async destroy() {
        this._stopHeartbeat();
        try {
            this.isConnected = false;
            if (this.client) {
                await withTimeout(this.client.destroy(), 15000, `destroy(${this.sessionId})`);
            }
        } catch (err) {
            console.error(`[${this.sessionId}] Destroy error:`, err.message);
        } finally {
            this.client = null;
            this.initializing = false;
        }
    }

    _formatPhone(phone) {
        let digits = phone.replace(/\D/g, '');
        if (digits.startsWith('0')) digits = digits.substring(1);
        if (!digits.startsWith('52') && digits.length === 10) {
            digits = '52' + digits;
        }
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
                        where: { id: this.sessionId },
                        data: { last_heartbeat: new Date() }
                    });
                } catch { }
            }
        }, 60000);
    }

    _stopHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    }
}

export default WhatsAppSession;
