import WhatsAppSession from './WhatsAppSession.js';

class SessionManager {
    constructor(prisma) {
        this.prisma = prisma;
        this.sessions = new Map();      // mechanicId → WhatsAppSession
        this._initPromises = new Map(); // mechanicId → Promise (lock por sesión)
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

        // Initialize WhatsApp client
        await session.initialize();
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
     * Destruye TODAS las sesiones activas.
     * Se usa en shutdown limpio (SIGINT/SIGTERM).
     */
    async destroyAll() {
        console.log(`🛑 Destroying all ${this.sessions.size} session(s)...`);
        const promises = [];
        for (const [id, session] of this.sessions) {
            console.log(`  🗑️ Destroying session ${id}...`);
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
