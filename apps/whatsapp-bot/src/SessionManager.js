import WhatsAppSession from './WhatsAppSession.js';

class SessionManager {
    constructor(prisma) {
        this.prisma = prisma;
        this.sessions = new Map();      // mechanicId → WhatsAppSession
        this._initPromises = new Map(); // mechanicId → Promise (lock por sesión)
        this._lastErrors = new Map();   // mechanicId → last error message
    }

    /**
     * Inicia o retorna una sesión existente con lock real por mechanicId.
     * Patrón: si ya hay un Promise de init en curso, retorna ese mismo Promise
     * para que N requests concurrentes obtengan la misma sesión.
     */
    async startSession(mechanicId) {
        // Si ya hay una sesión conectada, retornar directo
        if (this.sessions.has(mechanicId)) {
            const existing = this.sessions.get(mechanicId);
            if (existing.isConnected) {
                console.log(`ℹ️ Session ${mechanicId} already connected, reusing.`);
                return existing;
            }
            // Session exists but is dead (not connected, not initializing) — restart it
            if (!existing.isConnected && !existing.initializing) {
                console.log(`♻️ Session ${mechanicId} is dead, will restart...`);
                // Fall through to create a new session
            } else if (existing.initializing) {
                // Still initializing, wait for it
                if (this._initPromises.has(mechanicId)) {
                    console.log(`ℹ️ Session ${mechanicId} still initializing, waiting...`);
                    return this._initPromises.get(mechanicId);
                }
            }
        }

        // Si ya hay un init en curso para este mechanicId, esperar ese mismo Promise
        if (this._initPromises.has(mechanicId)) {
            console.log(`ℹ️ Session ${mechanicId} already initializing, waiting for existing init...`);
            return this._initPromises.get(mechanicId);
        }

        // Crear el Promise de init y guardarlo ANTES de await (lock real)
        const initPromise = this._doStartSession(mechanicId);
        this._initPromises.set(mechanicId, initPromise);

        try {
            return await initPromise;
        } finally {
            this._initPromises.delete(mechanicId);
        }
    }

    /**
     * Lógica interna de inicio de sesión (solo se ejecuta una vez por mechanicId).
     */
    async _doStartSession(mechanicId) {
        // Destruir sesión muerta si existe
        if (this.sessions.has(mechanicId)) {
            const existing = this.sessions.get(mechanicId);
            if (!existing.isConnected) {
                console.log(`♻️ Destroying stale session for ${mechanicId} before recreating...`);
                await existing.destroy();
                // Wait for Chrome to fully close and release lock
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        // Clear previous error
        this._lastErrors.delete(mechanicId);

        const session = new WhatsAppSession(mechanicId, this.prisma);
        // CRITICAL: set en el Map ANTES de initialize() para que otros requests lo vean
        this.sessions.set(mechanicId, session);

        // Setup event handlers
        session.on('qr', (qr) => {
            console.log(`📱 QR generated for mechanic ${mechanicId}`);
        });

        session.on('ready', async () => {
            console.log(`✅ Session ready for mechanic ${mechanicId}`);
            await this.updateDbSession(mechanicId, {
                is_connected: true,
                connected_at: new Date(),
                last_heartbeat: new Date(),
            });
        });

        session.on('disconnected', async (reason) => {
            console.log(`🔴 Session disconnected for mechanic ${mechanicId}: ${reason}`);
            await this.updateDbSession(mechanicId, {
                is_connected: false,
                disconnected_at: new Date(),
            });
        });

        // Auto-restart when QR scan times out (user took too long)
        session.on('qr_timeout', async () => {
            console.log(`🔄 Auto-restarting session for ${mechanicId} after QR timeout (10s cooldown)...`);
            // Small delay to let Chrome fully close
            await new Promise(resolve => setTimeout(resolve, 10000));
            try {
                await this.startSession(mechanicId);
            } catch (err) {
                console.error(`❌ Auto-restart failed for ${mechanicId}:`, err.message);
            }
        });

        // Initialize WhatsApp client
        try {
            await session.initialize();
        } catch (err) {
            console.error(`❌ Session init failed for ${mechanicId}:`, err.message);
            this._lastErrors.set(mechanicId, err.message);
        }
        return session;
    }

    async stopSession(mechanicId) {
        const session = this.sessions.get(mechanicId);
        if (!session) return false;

        await session.destroy();
        this.sessions.delete(mechanicId);

        await this.updateDbSession(mechanicId, {
            is_connected: false,
            disconnected_at: new Date(),
        });

        return true;
    }

    /**
     * Cierra sesión de WhatsApp de forma REAL:
     * - Envía señal de logout a los servidores de WhatsApp (desvincula el dispositivo)
     * - Borra auth local para que no se reconecte  
     * - Destruye el cliente de Puppeteer
     */
    async logoutSession(mechanicId) {
        const session = this.sessions.get(mechanicId);
        if (!session) return false;

        console.log(`🔓 logoutSession called for ${mechanicId}`);
        await session.logout();
        this.sessions.delete(mechanicId);

        await this.updateDbSession(mechanicId, {
            is_connected: false,
            disconnected_at: new Date(),
        });

        console.log(`✅ logoutSession complete for ${mechanicId}`);
        return true;
    }

    /**
     * Destruye TODAS las sesiones activas.
     * Se usa en shutdown limpio (SIGINT/SIGTERM).
     * @param {boolean} keepDbState - Si true, NO marcar como desconectado en DB (para que se restauren al reiniciar)
     */
    async destroyAll(keepDbState = false) {
        console.log(`🛑 Destroying all ${this.sessions.size} session(s)... (keepDbState=${keepDbState})`);
        const promises = [];
        for (const [id, session] of this.sessions) {
            console.log(`  🗑️ Destroying session ${id}...`);
            // Prevent 'disconnected' event from updating DB if we want to preserve state
            if (keepDbState) {
                session.removeAllListeners('disconnected');
            }
            promises.push(
                session.destroy().catch(err => {
                    console.error(`  ❌ Error destroying session ${id}:`, err.message);
                })
            );
        }
        await Promise.allSettled(promises);
        this.sessions.clear();
        this._initPromises.clear();
        console.log('✅ All sessions destroyed.');
    }

    getSession(mechanicId) {
        return this.sessions.get(mechanicId) || null;
    }

    getAllSessions() {
        const result = [];
        for (const [mechanicId, session] of this.sessions) {
            result.push({
                mechanicId,
                isConnected: session.isConnected,
                initializing: session.initializing,
                qr: session.lastQr,
                phoneNumber: session.phoneNumber,
                lastReadyAt: session.lastReadyAt || null,
                lastError: session.lastError || this._lastErrors.get(mechanicId) || null,
            });
        }
        return result;
    }

    /**
     * Find the session to use for sending a message.
     * Logic: order.mechanic → if master, use their session. If auxiliary, use approved_by's session.
     */
    async findSessionForOrder(orderId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                mechanic: { select: { id: true, is_master_mechanic: true } }
            }
        });

        if (!order) return null;

        let targetMechanicId = null;

        if (order.mechanic?.is_master_mechanic) {
            targetMechanicId = order.mechanic.id;
        } else if (order.approved_by) {
            // Auxiliary → use the master who approved
            targetMechanicId = order.approved_by;
        } else if (order.mechanic_id) {
            // Fallback: try the mechanic directly
            targetMechanicId = order.mechanic_id;
        }

        if (!targetMechanicId) return null;

        const session = this.sessions.get(targetMechanicId);
        if (session && session.isConnected) return session;
        return null;
    }

    async updateDbSession(mechanicId, data) {
        try {
            await this.prisma.whatsappSession.upsert({
                where: { mechanic_id: mechanicId },
                update: data,
                create: { mechanic_id: mechanicId, ...data }
            });
        } catch (err) {
            console.error(`Error updating DB session for ${mechanicId}:`, err.message);
        }
    }
}

export default SessionManager;
