import { Router } from 'express';

export default function messagesRouter(sessionManager) {
    const router = Router();

    // Enviar mensaje directo
    router.post('/send-message', async (req, res) => {
        try {
            const { sessionId, phone, message } = req.body;
            if (!sessionId || !phone || !message) {
                return res.status(400).json({ error: 'sessionId, phone, and message are required' });
            }
            const result = await sessionManager.sendMessage(sessionId, phone, message);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
