import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import SessionManager from './SessionManager.js';
import sessionsRouter from './routes/sessions.js';
import messagesRouter from './routes/messages.js';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// API Key middleware
const API_KEY = process.env.API_KEY || 'motopartes-whatsapp-key';
app.use('/api', (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key && key === API_KEY) return next();
    // Also allow if coming from internal network (docker)
    const host = req.hostname;
    if (host === 'localhost' || host === 'whatsapp-bot' || host === '127.0.0.1') return next();
    return res.status(401).json({ error: 'API key requerida' });
});

// Initialize SessionManager
const sessionManager = new SessionManager(prisma);

// Make sessionManager available to routes
app.set('sessionManager', sessionManager);
app.set('prisma', prisma);

// Routes
app.use('/api/sessions', sessionsRouter);
app.use('/api', messagesRouter);

// Health check
app.get('/health', (req, res) => {
    const sessions = sessionManager.getAllSessions();
    res.json({
        status: 'ok',
        service: 'motopartes-whatsapp-bot',
        activeSessions: sessions.filter(s => s.isConnected).length,
        totalSessions: sessions.length
    });
});

// Start
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`📱 WhatsApp Bot running on port ${PORT}`);
    // Restore persisted sessions on boot
    try {
        const dbSessions = await prisma.whatsappSession.findMany({
            where: { is_connected: true }
        });
        for (const s of dbSessions) {
            if (s.mechanic_id) {
                console.log(`  🔄 Restoring session for mechanic ${s.mechanic_id}...`);
                await sessionManager.startSession(s.mechanic_id);
            }
        }
    } catch (err) {
        console.error('Error restoring sessions:', err.message);
    }
});
