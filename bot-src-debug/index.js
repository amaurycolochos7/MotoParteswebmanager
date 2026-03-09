import 'dotenv/config';

// Prevent wwebjs ProtocolError from crashing the process
// (Network.getResponseBody fails during web version caching)
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason?.message || reason);
});
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import SessionManager from './SessionManager.js';
import sessionsRouter from './routes/sessions.js';
import messagesRouter from './routes/messages.js';
import autoresponderRouter from './routes/autoresponder.js';
import customersRouter from './routes/customers.js';
import ordersRouter from './routes/orders.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3002;
const API_KEY = process.env.API_KEY || 'wabot-secret-key-2026';

// --- Middleware ---
app.use(cors());
app.use(express.json());

// Auth middleware — skip health/debug/patch-check
app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/debug' || req.path === '/patch-check') return next();

    const key = req.headers['x-api-key'];
    if (key && key === API_KEY) return next();

    // Allow internal Docker network
    const host = req.hostname || '';
    if (host === 'localhost' || host === 'whatsapp-bot' || host === '127.0.0.1') return next();

    return res.status(401).json({ error: 'API key requerida' });
});

// --- Session Manager ---
const sessionManager = new SessionManager(prisma);

// --- Routes ---
app.use('/sessions', sessionsRouter(sessionManager, prisma));
app.use('/', messagesRouter(sessionManager));
app.use('/', autoresponderRouter(sessionManager, prisma));
app.use('/customers', customersRouter(prisma));
app.use('/orders', ordersRouter(prisma));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        sessions: sessionManager.listSessions().length,
    });
});

// Debug endpoint
app.get('/debug', (req, res) => {
    res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sessions: sessionManager.listSessions(),
        env: {
            NODE_ENV: process.env.NODE_ENV,
            PORT,
            PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || 'default',
            WWEBJS_DATA_PATH: process.env.WWEBJS_DATA_PATH || 'default',
        },
    });
});

// Patch verification endpoint — dumps Client.js analysis
app.get('/patch-check', (req, res) => {
    try {
        const clientPath = path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js', 'src', 'Client.js');
        if (!fs.existsSync(clientPath)) {
            return res.json({ error: 'Client.js not found', path: clientPath });
        }
        const code = fs.readFileSync(clientPath, 'utf-8');

        // Find ALL evaluateOnNewDocument blocks
        const evalBlocks = [];
        let searchIdx = 0;
        while (true) {
            const idx = code.indexOf('evaluateOnNewDocument', searchIdx);
            if (idx === -1) break;
            evalBlocks.push(code.substring(Math.max(0, idx - 30), Math.min(code.length, idx + 250)));
            searchIdx = idx + 1;
        }

        // Search for Error-related patterns
        const patterns = ['OriginalError', 'window.Error', 'OldError', 'NativeError', 'ErrorConstructor', 'Error.constructor', 'const OError', 'const OrigError'];
        const found = {};
        for (const p of patterns) {
            const idx = code.indexOf(p);
            if (idx !== -1) found[p] = code.substring(Math.max(0, idx - 30), Math.min(code.length, idx + 150));
        }

        return res.json({
            clientJsSize: code.length,
            hasOcVersion: code.includes('ocVersion'),
            hasPatched: code.includes('PATCHED'),
            evalBlockCount: evalBlocks.length,
            evalBlocks,
            errorPatterns: found,
        });
    } catch (err) {
        return res.json({ error: err.message });
    }
});

// --- Startup ---
async function start() {
    try {
        await prisma.$connect();
        console.log('Database connected');

        // Restore sessions that were connected before restart
        await sessionManager.restoreFromDB();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`WhatsApp Bot API running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start:', err);
        process.exit(1);
    }
}

// --- Graceful Shutdown ---
async function shutdown(code = 0) {
    console.log('Shutting down gracefully...');
    // keepDbState = true: mantener is_connected para restaurar al reiniciar
    await sessionManager.destroyAll(true);
    await prisma.$disconnect();
    process.exit(code);
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

start();
