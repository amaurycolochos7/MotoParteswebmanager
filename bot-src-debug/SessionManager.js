/**
 * SessionManager — Gestiona múltiples sesiones de WhatsApp
 * 
 * Multi-tenant: cada sesión es independiente (diferente negocio/licencia).
 * Maneja concurrencia con locks por sesión para evitar dobles inicializaciones.
 */

import WhatsAppSession from './WhatsAppSession.js';
import AutoResponder from './AutoResponder.js';

class SessionManager {
    constructor(prisma) {
        this.prisma = prisma;
        this.sessions = new Map();          // sessionId → WhatsAppSession
        this._initPromises = new Map();     // Lock: sessionId → Promise
        this.autoResponder = new AutoResponder(prisma);
    }

    /**
     * Inicia una sesión. Si ya hay un init en curso, retorna el MISMO Promise.
     */
    async startSession(sessionId) {
        // Si ya hay un init en curso, reusar
        if (this._initPromises.has(sessionId)) {
            return this._initPromises.get(sessionId);
        }

        const initPromise = this._doStartSession(sessionId);
        this._initPromises.set(sessionId, initPromise);

        try {
            return await initPromise;
        } finally {
            this._initPromises.delete(sessionId);
        }
    }

    async _doStartSession(sessionId) {
        // Si ya existe y está conectada, retornar
        if (this.sessions.has(sessionId)) {
            const existing = this.sessions.get(sessionId);
            if (existing.isConnected) {
                return { status: 'already_connected' };
            }
            // Si existe pero no conectada, destruirla primero
            await existing.destroy();
            this.sessions.delete(sessionId);
        }

        // Asegurar que existe en DB
        await this.prisma.whatsappSession.upsert({
            where: { id: sessionId },
            update: {},
            create: { id: sessionId },
        });

        const session = new WhatsAppSession(sessionId, this.prisma);

        // --- Session Events ---

        session.on('ready', async () => {
            try {
                await this.prisma.whatsappSession.update({
                    where: { id: sessionId },
                    data: {
                        is_connected: true,
                        phone_number: session.phoneNumber,
                        connected_at: new Date(),
                        disconnected_at: null,
                        last_heartbeat: new Date(),
                    },
                });
            } catch (err) {
                console.error(`[SessionManager] DB update on ready failed:`, err.message);
            }
        });

        session.on('disconnected', async (reason) => {
            try {
                await this.prisma.whatsappSession.update({
                    where: { id: sessionId },
                    data: {
                        is_connected: false,
                        disconnected_at: new Date(),
                    },
                });
            } catch (err) {
                console.error(`[SessionManager] DB update on disconnect failed:`, err.message);
            }
            this.sessions.delete(sessionId);
        });

        session.on('qr_timeout', async () => {
            // Cooldown antes de reiniciar
            await new Promise(resolve => setTimeout(resolve, 10000));
            this.startSession(sessionId).catch(() => { });
        });

        // Incoming messages → AutoResponder
        session.on('message', (message) => {
            this.autoResponder.handleIncomingMessage(session, sessionId, message).catch(err => {
                console.error(`[SessionManager] AutoResponder error:`, err.message);
            });
        });

        this.sessions.set(sessionId, session);
        session.initialize().catch(err => {
            console.error(`[SessionManager] Init error for ${sessionId}:`, err.message);
        });

        return { status: 'initializing' };
    }

    /**
     * Obtener estado de una sesión.
     */
    getSessionStatus(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { exists: false, isConnected: false };
        }
        return {
            exists: true,
            isConnected: session.isConnected,
            phoneNumber: session.phoneNumber,
            pushname: session.pushname,
            initializing: session.initializing,
            hasQr: !!session.lastQr,
            lastError: session.lastError,
        };
    }

    /**
     * Obtener QR de una sesión.
     */
    getQR(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return { qr: null };
        return { qr: session.lastQr };
    }

    /**
     * Cerrar sesión de WhatsApp (desvincula dispositivo).
     */
    async logoutSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { success: false, error: 'Session not found' };
        }

        await session.logout();
        this.sessions.delete(sessionId);

        await this.prisma.whatsappSession.update({
            where: { id: sessionId },
            data: {
                is_connected: false,
                disconnected_at: new Date(),
            },
        });

        return { success: true };
    }

    /**
     * Enviar mensaje usando una sesión específica.
     */
    async sendMessage(sessionId, phone, message) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.isConnected) {
            throw new Error('Session not connected');
        }
        return session.sendMessage(phone, message);
    }

    /**
     * Listar todas las sesiones con su estado.
     */
    listSessions() {
        const list = [];
        for (const [id, session] of this.sessions) {
            list.push({
                sessionId: id,
                isConnected: session.isConnected,
                phoneNumber: session.phoneNumber,
                pushname: session.pushname,
                initializing: session.initializing,
            });
        }
        return list;
    }

    /**
     * Restaurar sesiones desde DB al iniciar el servidor.
     */
    async restoreFromDB() {
        const dbSessions = await this.prisma.whatsappSession.findMany({
            where: { is_connected: true },
        });

        console.log(`[SessionManager] Restoring ${dbSessions.length} session(s) from DB...`);

        for (const s of dbSessions) {
            try {
                await this.startSession(s.id);
                console.log(`[SessionManager] Restored session ${s.id}`);
            } catch (err) {
                console.error(`[SessionManager] Failed to restore ${s.id}:`, err.message);
            }
        }
    }

    /**
     * Graceful shutdown — destruir todas las sesiones.
     * @param {boolean} keepDbState - true = no actualizar DB (para restart)
     */
    async destroyAll(keepDbState = false) {
        this.autoResponder.destroy();

        for (const [id, session] of this.sessions) {
            if (keepDbState) {
                session.removeAllListeners('disconnected');
            }
            try {
                await session.destroy();
            } catch (err) {
                console.error(`[SessionManager] Error destroying ${id}:`, err.message);
            }
        }
        this.sessions.clear();
    }
}

export default SessionManager;
