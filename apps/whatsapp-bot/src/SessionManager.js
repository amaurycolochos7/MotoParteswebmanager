import WhatsAppSession from './WhatsAppSession.js';

class SessionManager {
    constructor(prisma) {
        this.prisma = prisma;
        this.sessions = new Map(); // mechanicId → WhatsAppSession
    }

    async startSession(mechanicId) {
        // If session already exists & connected, return
        if (this.sessions.has(mechanicId)) {
            const existing = this.sessions.get(mechanicId);
            if (existing.isConnected) return existing;
            // Destroy and recreate
            await existing.destroy();
        }

        const session = new WhatsAppSession(mechanicId, this.prisma);
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

    getSession(mechanicId) {
        return this.sessions.get(mechanicId) || null;
    }

    getAllSessions() {
        const result = [];
        for (const [mechanicId, session] of this.sessions) {
            result.push({
                mechanicId,
                isConnected: session.isConnected,
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
