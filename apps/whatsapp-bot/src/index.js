import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import SessionManager from './SessionManager.js';
import sessionsRouter from './routes/sessions.js';
import messagesRouter from './routes/messages.js';

// ─── In-memory log buffer for diagnostics ──────────────────────
const LOG_BUFFER_SIZE = 200;
const logBuffer = [];
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

function captureLog(level, args) {
    const msg = args.map(a => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack}`;
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
    logBuffer.push({ t: new Date().toISOString(), l: level, m: msg });
    if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}

console.log = (...args) => { captureLog('LOG', args); origLog.apply(console, args); };
console.error = (...args) => { captureLog('ERR', args); origError.apply(console, args); };
console.warn = (...args) => { captureLog('WRN', args); origWarn.apply(console, args); };

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Initialize SessionManager
const sessionManager = new SessionManager(prisma);

// ─── Graceful Shutdown ─────────────────────────────────────────
let isShuttingDown = false;

async function shutdown(code = 0) {
    if (isShuttingDown) return; // evitar doble shutdown
    isShuttingDown = true;
    console.log('\n🛑 Shutting down, destroying all WhatsApp sessions...');
    try {
        await sessionManager.destroyAll(true);
    } catch (e) {
        console.error('Error during session cleanup:', e);
    }
    try {
        await prisma.$disconnect();
    } catch (e) { /* ignore */ }
    console.log('👋 Bye.');
    process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', async (err) => {
    console.error('💥 Uncaught Exception:', err);
    // Only shutdown on truly fatal errors, not Puppeteer protocol errors
    if (err.message && (err.message.includes('EADDRINUSE') || err.message.includes('out of memory'))) {
        await shutdown(1);
    }
    // Otherwise log and continue — the bot should be resilient
});
process.on('unhandledRejection', (reason, p) => {
    // DO NOT crash — Puppeteer/Chrome protocol errors are common and recoverable
    console.error('⚠️ Unhandled Rejection (non-fatal):', reason);
});

// ─── Express Setup ─────────────────────────────────────────────
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

// API Key middleware.
// Accept either API_KEY (historical, still set in Dokploy) or WHATSAPP_API_KEY
// (same name as the API uses). Fallback logs a warning — rotate by setting
// WHATSAPP_API_KEY in Dokploy.
const API_KEY_FALLBACK = 'motopartes-whatsapp-key';
const API_KEY = process.env.WHATSAPP_API_KEY || process.env.API_KEY || API_KEY_FALLBACK;
if (API_KEY === API_KEY_FALLBACK) {
    console.warn('[BOT] ⚠️ No WHATSAPP_API_KEY or API_KEY env var — using the legacy default.');
}
app.use((req, res, next) => {
    // Skip auth for health check and debug
    if (req.path === '/health' || req.path === '/debug') return next();
    const key = req.headers['x-api-key'];
    if (key && key === API_KEY) return next();
    // Also allow if coming from internal network (docker)
    const host = req.hostname;
    if (host === 'localhost' || host === 'whatsapp-bot' || host === '127.0.0.1') return next();
    return res.status(401).json({ error: 'API key requerida' });
});

// Make sessionManager available to routes
app.set('sessionManager', sessionManager);
app.set('prisma', prisma);

// Routes
// Traefik strips /api/whatsapp-bot prefix, so routes are at root level
app.use('/sessions', sessionsRouter);
app.use('/', messagesRouter);

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

// Debug endpoint - exposes captured logs
app.get('/debug', (req, res) => {
    const sessions = sessionManager.getAllSessions();
    res.json({
        uptime: process.uptime(),
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        nodeVersion: process.version,
        env: {
            PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || 'not set',
            WWEBJS_DATA_PATH: process.env.WWEBJS_DATA_PATH || 'not set',
            NODE_ENV: process.env.NODE_ENV || 'not set',
            PORT: process.env.PORT || 'not set',
        },
        sessions,
        logs: logBuffer.slice(-50),
    });
});

// Start
const server = app.listen(PORT, '0.0.0.0', async () => {
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

server.on('error', (err) => {
    console.error('Server error:', err);
});

// ─── SELF-HEAL SWEEP ─────────────────────────────────────────────────
// Every 2 minutes, look for sessions that SHOULD be connected (they have
// session data on disk and the DB says is_connected=true) but whose in-memory
// state shows isConnected=false for >5 min. Re-initialize them with a small
// backoff so we don't hammer Chromium. This covers "container restarted but
// nobody reopened the admin UI" scenarios.
const HEALTH_CHECK_MS = 2 * 60 * 1000;
const DEAD_THRESHOLD_MS = 5 * 60 * 1000;
setInterval(async () => {
    try {
        const sessions = sessionManager.getAllSessions();
        for (const s of sessions) {
            if (s.isConnected) continue;
            const last = s.lastReadyAt ? new Date(s.lastReadyAt).getTime() : 0;
            // If the session has been "not connected" for longer than the
            // dead threshold and isn't currently initializing, kick it.
            if (Date.now() - last > DEAD_THRESHOLD_MS && !s.initializing) {
                console.log(`[self-heal] session ${s.mechanicId} looks dead; reinitializing…`);
                sessionManager.startSession(s.mechanicId).catch((e) =>
                    console.warn(`[self-heal] start failed for ${s.mechanicId}: ${e.message}`)
                );
            }
        }
    } catch (e) {
        console.warn('[self-heal] sweep error:', e.message);
    }
}, HEALTH_CHECK_MS);

// ─── MEMORY WATCHDOG ─────────────────────────────────────────────────
// If RSS stays above 1.5 GB for 5 straight checks (i.e. 5+ minutes), trigger
// a graceful shutdown. Docker/Swarm will restart us, sessions re-hydrate
// from disk. Prevents Chromium memory leaks from spiraling forever.
const MEMORY_LIMIT_BYTES = 1.5 * 1024 * 1024 * 1024;
let overCount = 0;
setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > MEMORY_LIMIT_BYTES) {
        overCount += 1;
        console.warn(`[watchdog] RSS ${Math.round(rss / 1024 / 1024)}MB over limit (strike ${overCount}/5)`);
        if (overCount >= 5) {
            console.error('[watchdog] RSS over limit for 5 checks — graceful restart');
            shutdown(0);
        }
    } else if (overCount > 0) {
        overCount = Math.max(0, overCount - 1);
    }
}, 60 * 1000);
