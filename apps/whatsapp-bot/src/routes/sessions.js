import { Router } from 'express';
import QRCode from 'qrcode';
import { importHistory } from '../inbox-events.js';

const router = Router();

// GET /api/sessions - List all sessions
router.get('/', (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    res.json(sessionManager.getAllSessions());
});

// GET /api/sessions/:mechanicId/status
router.get('/:mechanicId/status', (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const session = sessionManager.getSession(req.params.mechanicId);
    if (session) session.touch(); // la pantalla está abierta: mantener vivo el QR

    if (!session) {
        // ponytail: also check if a restart is scheduled or init is in-flight
        const restartScheduled = sessionManager._restartTimers.has(req.params.mechanicId);
        const initializing = sessionManager._initPromises.has(req.params.mechanicId);
        return res.json({ exists: false, isConnected: false, qr: null, restartScheduled, initializing });
    }

    res.json({
        exists: true,
        isConnected: session.isConnected,
        initializing: session.initializing || sessionManager._initPromises.has(req.params.mechanicId),
        phoneNumber: session.phoneNumber,
        pushname: session.pushname || null,
        platform: session.platform || 'Web',
        qr: session.lastQr ? true : false,
        lastError: session.lastError || null,
        idleReason: session.idleReason || null,
        restartScheduled: sessionManager._restartTimers.has(req.params.mechanicId),
    });
});

// GET /sessions/:mechanicId/messages?phone=9631911772&limit=8
// DIAGNÓSTICO INTERNO (no está en la lista blanca del proxy de la API, así que no
// es accesible desde internet): últimos mensajes del chat con su ack de entrega.
router.get('/:mechanicId/messages', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const session = sessionManager.getSession(req.params.mechanicId);
    if (!session || !session.isConnected) {
        return res.status(503).json({ error: 'Sesión de WhatsApp no disponible' });
    }
    if (!req.query.phone) return res.status(400).json({ error: 'phone requerido' });
    try {
        res.json(await session.recentMessages(req.query.phone, req.query.limit));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sessions/:mechanicId/qr
router.get('/:mechanicId/qr', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const session = sessionManager.getSession(req.params.mechanicId);
    if (session) session.touch(); // la pantalla está abierta: mantener vivo el QR

    if (!session || !session.lastQr) {
        return res.json({ qr: null, isConnected: session?.isConnected || false });
    }

    // Convert QR to base64 image
    try {
        const qrImage = await QRCode.toDataURL(session.lastQr, { width: 300, margin: 2 });
        res.json({ qr: qrImage, isConnected: false });
    } catch (err) {
        res.status(500).json({ error: 'Error generating QR' });
    }
});

// POST /api/sessions/:mechanicId/sync-history — vuelve a importar el historial de chats a la bandeja (corre en segundo plano).
router.post('/:mechanicId/sync-history', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const session = sessionManager.getSession(req.params.mechanicId);
    if (!session || !session.isConnected || !session.client) {
        return res.status(503).json({ error: 'Sesión de WhatsApp no disponible' });
    }
    importHistory(session.client, req.params.mechanicId).catch((err) => console.warn('⚠️ [inbox] sync-history:', err.message));
    res.json({ started: true });
});

// POST /api/sessions/:mechanicId/start
router.post('/:mechanicId/start', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    try {
        // Fire-and-forget: start initialization in background, respond immediately
        sessionManager.startSession(req.params.mechanicId).catch(err => {
            console.error(`❌ Background session start failed for ${req.params.mechanicId}:`, err.message);
        });
        res.json({ success: true, message: 'Session starting...' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sessions/:mechanicId/logout
router.post('/:mechanicId/logout', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    try {
        const loggedOut = await sessionManager.logoutSession(req.params.mechanicId);
        res.json({ success: loggedOut });
    } catch (err) {
        console.error(`❌ Logout failed for ${req.params.mechanicId}:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
