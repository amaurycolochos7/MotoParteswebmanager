import { Router } from 'express';

const router = Router();

// POST /api/send-message
// Body: { mechanicId, phone, message }
router.post('/send-message', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { mechanicId, phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'phone y message son requeridos' });
    }

    // Find session for this mechanic
    let session = null;
    if (mechanicId) {
        session = sessionManager.getSession(mechanicId);
    }

    if (!session || !session.isConnected) {
        return res.status(503).json({
            error: 'Sesión de WhatsApp no disponible',
            fallback: true
        });
    }

    try {
        const result = await session.sendMessage(phone, message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message, fallback: true });
    }
});

// POST /api/send-media
// Body: { mechanicId, phone, message, mediaUrl }
router.post('/send-media', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { mechanicId, phone, message, mediaUrl } = req.body;

    if (!phone || !mediaUrl) {
        return res.status(400).json({ error: 'phone y mediaUrl son requeridos' });
    }

    let session = null;
    if (mechanicId) {
        session = sessionManager.getSession(mechanicId);
    }

    if (!session || !session.isConnected) {
        return res.status(503).json({
            error: 'Sesión de WhatsApp no disponible',
            fallback: true
        });
    }

    try {
        const result = await session.sendMedia(phone, message || '', mediaUrl);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message, fallback: true });
    }
});

// POST /api/send-for-order
// Automatic: finds the correct session for an order (master or approved_by)
// Body: { orderId, phone, message }
router.post('/send-for-order', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { orderId, phone, message } = req.body;

    if (!orderId || !phone || !message) {
        return res.status(400).json({ error: 'orderId, phone y message son requeridos' });
    }

    const session = await sessionManager.findSessionForOrder(orderId);
    if (!session) {
        return res.status(503).json({
            error: 'No hay sesión de WhatsApp activa para esta orden',
            fallback: true
        });
    }

    try {
        const result = await session.sendMessage(phone, message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message, fallback: true });
    }
});

export default router;
