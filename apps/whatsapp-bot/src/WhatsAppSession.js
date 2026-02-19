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

        // Verify Chromium binary exists
        const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
        console.log(`🔍 Chrome path: ${chromePath}`);
        try {
            fs.accessSync(chromePath, fs.constants.X_OK);
            console.log(`✅ Chrome binary exists and is executable`);
        } catch (e) {
            // Try alternative paths
            const alternatives = ['/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/chromium'];
            let found = false;
            for (const alt of alternatives) {
                try {
                    fs.accessSync(alt, fs.constants.X_OK);
                    console.log(`✅ Found Chrome at: ${alt}`);
                    process.env.PUPPETEER_EXECUTABLE_PATH = alt;
                    found = true;
                    break;
                } catch (e2) { /* skip */ }
            }
            if (!found) {
                this.lastError = `Chrome binary not found at ${chromePath} or alternatives`;
                console.error(`❌ ${this.lastError}`);
                this.initializing = false;
                return;
            }
        }

        const dataPath = sessionsPath();
        console.log(`📂 Session data path: ${dataPath}`);

        try {
            console.log(`📱 Step 1: Creating Client instance...`);
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: String(this.mechanicId),
                    dataPath: dataPath,
                }),

                puppeteer: {
                    headless: true,
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || chromePath,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-extensions',
                        '--disable-software-rasterizer',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process',
                    ],
                },
            });
            console.log(`✅ Step 1 done: Client created`);

            // Sanity check
            if (!this.client || typeof this.client.on !== 'function') {
                throw new Error('Client instance is broken (missing .on)');
            }

            // QR Event
            this.client.on('qr', (qr) => {
                console.log(`📱 QR generated for mechanic ${this.mechanicId}`);
                this.lastQr = qr;
                this.isConnected = false;
                this.emit('qr', qr);
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

            // Auth failure
            this.client.on('auth_failure', (msg) => {
                this.isConnected = false;
                this.lastError = `Auth failure: ${msg}`;
                console.error(`❌ Auth failure for mechanic ${this.mechanicId}:`, msg);
                this.emit('disconnected', 'auth_failure');
            });

            console.log(`🚀 Step 2: Launching Puppeteer for mechanic ${this.mechanicId}...`);

            // Add 60 second timeout for initialization
            const initTimeout = setTimeout(() => {
                if (this.initializing && !this.isConnected && !this.lastQr) {
                    this.lastError = 'Initialization timed out after 60s (no QR, no connection)';
                    console.error(`❌ ${this.lastError}`);
                    this.initializing = false;
                }
            }, 60000);

            await this.client.initialize();
            clearTimeout(initTimeout);
            console.log(`✅ Step 2 done: Client initialized for mechanic ${this.mechanicId}`);

        } catch (err) {
            console.error(`❌ Error initializing client for ${this.mechanicId}:`, err.message);
            console.error(err.stack);
            this.isConnected = false;
            this.lastError = err.message;

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
