import { Router } from 'express';
import QRCode from 'qrcode';

export default function sessionsRouter(sessionManager, prisma) {
    const router = Router();

    // Listar todas las sesiones activas en memoria + DB
    router.get('/', async (req, res) => {
        try {
            const dbSessions = await prisma.whatsappSession.findMany({
                orderBy: { created_at: 'desc' },
            });

            const result = dbSessions.map(s => {
                const memStatus = sessionManager.getSessionStatus(s.id);
                return {
                    ...s,
                    isConnected: memStatus.isConnected || s.is_connected,
                    initializing: memStatus.initializing || false,
                    hasQr: memStatus.hasQr || false,
                    lastError: memStatus.lastError || null,
                };
            });

            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Estado de una sesión específica
    router.get('/:id/status', (req, res) => {
        const status = sessionManager.getSessionStatus(req.params.id);
        res.json(status);
    });

    // Obtener QR como imagen base64 (PNG data URL)
    router.get('/:id/qr', async (req, res) => {
        const { qr } = sessionManager.getQR(req.params.id);
        if (!qr) {
            return res.json({ qr: null, message: 'No QR available' });
        }
        try {
            const qrImage = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
            res.json({ qr: qrImage });
        } catch {
            res.json({ qr: null });
        }
    });

    // Iniciar sesión (fire-and-forget)
    router.post('/:id/start', async (req, res) => {
        try {
            const result = await sessionManager.startSession(req.params.id);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Cerrar sesión (desvincula dispositivo)
    router.post('/:id/logout', async (req, res) => {
        try {
            const result = await sessionManager.logoutSession(req.params.id);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Toggle auto-reply
    router.patch('/:id/auto-reply', async (req, res) => {
        try {
            const { auto_reply } = req.body;
            const session = await prisma.whatsappSession.update({
                where: { id: req.params.id },
                data: { auto_reply: !!auto_reply },
            });
            res.json(session);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Actualizar configuración de sesión (nombre, admin_phone, etc.)
    router.patch('/:id/config', async (req, res) => {
        try {
            const { session_name, admin_phone, greeting_name, business_type } = req.body;
            const data = {};
            if (session_name !== undefined) data.session_name = session_name;
            if (admin_phone !== undefined) data.admin_phone = admin_phone;
            if (greeting_name !== undefined) data.greeting_name = greeting_name;
            if (business_type !== undefined) data.business_type = business_type;

            const session = await prisma.whatsappSession.update({
                where: { id: req.params.id },
                data,
            });
            res.json(session);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Crear nueva sesión (para multi-tenant)
    router.post('/', async (req, res) => {
        try {
            const { session_name, admin_phone, greeting_name } = req.body;
            const session = await prisma.whatsappSession.create({
                data: {
                    session_name: session_name || null,
                    admin_phone: admin_phone || null,
                    greeting_name: greeting_name || null,
                },
            });
            res.json(session);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Eliminar sesión
    router.delete('/:id', async (req, res) => {
        try {
            // Logout first if connected
            try { await sessionManager.logoutSession(req.params.id); } catch { }
            await prisma.whatsappSession.delete({ where: { id: req.params.id } });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
