import { EventEmitter } from 'events';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

class WhatsAppSession extends EventEmitter {
    constructor(mechanicId, prisma) {
        super();
        this.mechanicId = mechanicId;
        this.prisma = prisma;
        this.client = null;
        this.isConnected = false;
        this.lastQr = null;
        this.phoneNumber = null;
        this._heartbeatInterval = null;
    }

    async initialize() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: `session-${this.mechanicId}`,
                dataPath: './.wwebjs_auth'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--disable-gpu',
                    '--single-process'
                ],
                executablePath: process.env.CHROME_PATH || undefined,
            },
        });

        // QR Event
        this.client.on('qr', (qr) => {
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
            this.isConnected = false;
            this._stopHeartbeat();
            this.emit('disconnected', reason);
        });

        // Auth failure
        this.client.on('auth_failure', (msg) => {
            this.isConnected = false;
            console.error(`❌ Auth failure for mechanic ${this.mechanicId}:`, msg);
            this.emit('disconnected', 'auth_failure');
        });

        try {
            await this.client.initialize();
        } catch (err) {
            console.error(`Error initializing client for ${this.mechanicId}:`, err.message);
            this.isConnected = false;
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

        const { MessageMedia } = pkg;
        const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
        const formatted = this._formatPhone(phone);
        const result = await this.client.sendMessage(formatted, media, { caption: message || '' });
        return { success: true, messageId: result.id._serialized };
    }

    async destroy() {
        this._stopHeartbeat();
        try {
            if (this.client) {
                await this.client.destroy();
            }
        } catch (err) {
            console.error(`Error destroying client ${this.mechanicId}:`, err.message);
        }
        this.isConnected = false;
        this.client = null;
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
