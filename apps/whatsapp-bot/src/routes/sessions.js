import { Router } from 'express';
import QRCode from 'qrcode';

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

    if (!session) {
        return res.json({ exists: false, isConnected: false, qr: null });
    }

    res.json({
        exists: true,
        isConnected: session.isConnected,
        phoneNumber: session.phoneNumber,
        pushname: session.pushname || null,
        platform: session.platform || 'Web',
        qr: session.lastQr ? true : false, // Don't send raw QR string
    });
});

// GET /api/sessions/:mechanicId/qr
router.get('/:mechanicId/qr', async (req, res) => {
    const sessionManager = req.app.get('sessionManager');
    const session = sessionManager.getSession(req.params.mechanicId);

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
    const stopped = await sessionManager.stopSession(req.params.mechanicId);
    res.json({ success: stopped });
});

export default router;
