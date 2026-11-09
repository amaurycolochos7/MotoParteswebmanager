import { Router } from 'express';
import { convertToOggOpus } from '../wa-media.js';

const router = Router();

// POST /api/send-message
// Body: { mechanicId, phone, message }
router.post('/send-message', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { mechanicId, phone, message, chatId } = req.body;

    // `chatId` (p. ej. 1234@lid) permite responder a un chat sin teléfono conocido.
    if ((!phone && !chatId) || !message) {
        return res.status(400).json({ error: 'phone (o chatId) y message son requeridos' });
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
        const result = await session.sendMessage(phone, message, { chatId });
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

// POST /api/send-document
// Body: { mechanicId, phone, message, base64, filename, mimetype }
router.post('/send-document', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { mechanicId, phone, message, base64, filename, mimetype } = req.body;

    if (!phone || !base64) {
        return res.status(400).json({ error: 'phone y base64 son requeridos' });
    }

    let session = null;
    if (mechanicId) {
        session = sessionManager.getSession(mechanicId);
    }

    if (!session || !session.isConnected) {
        return res.status(503).json({
            error: 'Sesion de WhatsApp no disponible',
            fallback: true
        });
    }

    try {
        const result = await session.sendDocument(phone, message || '', base64, filename || 'document.pdf', mimetype || 'application/pdf');
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message, fallback: true });
    }
});

// POST /api/send-voice — nota de voz desde el panel.
// Body: { mechanicId, chatId, base64, mimetype }. El audio se convierte a ogg/opus (formato de WhatsApp) con ffmpeg.
router.post('/send-voice', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const { mechanicId, chatId, base64 } = req.body || {};
    if (!chatId || !base64) return res.status(400).json({ error: 'chatId y base64 son requeridos' });
    const session = mechanicId ? sessionManager.getSession(mechanicId) : null;
    if (!session || !session.isConnected) return res.status(503).json({ error: 'Sesión de WhatsApp no disponible', fallback: true });
    try {
        const ogg = await convertToOggOpus(Buffer.from(String(base64), 'base64'));
        const result = await session.sendVoice(chatId, ogg.toString('base64'));
        res.json({ ...result, converted: true });
    } catch (err) {
        console.warn('⚠️ send-voice:', err.message);
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
