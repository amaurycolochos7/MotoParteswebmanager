/**
 * Proxy hacia el bot de WhatsApp: /api/whatsapp-bot/* → http://whatsapp-bot:3002/*
 *
 * V2 — SESIÓN ÚNICA: sea cual sea el `mechanicId` / `:mechanicId` que mande el cliente, TODAS estas rutas se
 * resuelven a la sesión del taller (Workspace.whatsapp_session_profile_id). Los envíos de texto pasan por
 * lib/wa-send.js (bandeja + cola de reintentos). Administrar la sesión (QR/iniciar/cerrar) es solo owner/admin.
 *
 * El frontend (estático) llama a /api/whatsapp-bot/... y esta ruta reenvía al
 * contenedor del bot agregando la API key del bot, que NUNCA sale al navegador.
 *
 * SEGURIDAD — antes era un comodín sin autenticación: cualquiera en internet
 * podía listar sesiones y enviar mensajes desde el WhatsApp del taller. Ahora:
 *   1. Solo existen las rutas listadas abajo (lista blanca). Todo lo demás es 404
 *      (incluidos /debug y /send-document, que la API usa directo en el servidor).
 *   2. Todas exigen JWT, salvo GET /health.
 *   3. Aislamiento por taller (workspace): solo se puede usar la sesión de
 *      WhatsApp de alguien que comparta workspace contigo.
 *        - Usar (status, enviar):        miembro del mismo workspace, o la propia.
 *        - Administrar (qr, start, logout): la propia sesión, o rol owner/admin
 *          del workspace compartido. Un mecánico no puede desconectar al dueño.
 *      Los super admins (is_super_admin) pueden todo.
 *   4. GET /sessions solo devuelve las sesiones de tu(s) workspace(s).
 *   5. Límite de peticiones (por IP; trustProxy está activo) en cada ruta.
 */

import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { loadActor } from '../lib/permissions.js';
import { resolveSessionId, startWorkspaceSession, clearSessionCache } from '../lib/wa-session.js';
import { sendToClient, logOutbound } from '../lib/wa-send.js';

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_MEMBERSHIP_ROLES = new Set(['owner', 'admin']);

// Las consultas de membresía/orden se hacen SIN el auto-scope de workspace:
// justamente queremos comparar workspaces entre dos usuarios.
const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);

const isSuper = (request) => request.user?.is_super_admin === true;

/**
 * ¿Puede request.user operar la sesión de WhatsApp de `targetId`?
 * manage=true exige además ser el dueño de la sesión o owner/admin compartido.
 */
async function canOperateSession(request, targetId, { manage = false } = {}) {
    if (!UUID_RE.test(String(targetId || ''))) return false;
    if (isSuper(request)) return true;

    const callerId = request.user.id;
    if (callerId === targetId) return true;

    const callerMemberships = await unscoped(() =>
        prisma.membership.findMany({
            where: { profile_id: callerId },
            select: { workspace_id: true, role: true },
        })
    );
    if (callerMemberships.length === 0) return false;

    const shared = await unscoped(() =>
        prisma.membership.findMany({
            where: {
                profile_id: targetId,
                workspace_id: { in: callerMemberships.map((m) => m.workspace_id) },
            },
            select: { workspace_id: true },
        })
    );
    if (shared.length === 0) return false;
    if (!manage) return true;

    const sharedIds = new Set(shared.map((m) => m.workspace_id));
    return callerMemberships.some(
        (m) => sharedIds.has(m.workspace_id) && ADMIN_MEMBERSHIP_ROLES.has(m.role)
    );
}

function deny(reply, status = 403, error = 'No tienes acceso a esta sesión de WhatsApp.') {
    return reply.code(status).send({ error });
}

export default async function whatsappBotProxy(fastify) {
    // Cuerpo crudo (string): se valida y se reenvía tal cual al bot.
    fastify.removeAllContentTypeParsers();
    fastify.addContentTypeParser('*', function (request, payload, done) {
        let data = '';
        payload.on('data', (chunk) => { data += chunk; });
        payload.on('end', () => { done(null, data); });
    });

    const parseJsonBody = (request) => {
        if (!request.body) return {};
        if (typeof request.body === 'object') return request.body;
        try {
            const parsed = JSON.parse(request.body);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    };

    async function forward(reply, method, path, bodyObj) {
        const targetUrl = `${BOT_URL}${path}`;
        fastify.log.info(`[WA-Proxy] ${method} ${path}`);
        try {
            const options = {
                method,
                headers: { 'content-type': 'application/json', 'x-api-key': BOT_KEY },
            };
            if (bodyObj && method !== 'GET') options.body = JSON.stringify(bodyObj);

            const response = await fetch(targetUrl, options);
            const contentType = response.headers.get('content-type') || 'application/json';
            const data = await response.text();
            if (!response.ok) {
                fastify.log.error(`[WA-Proxy] Bot returned ${response.status}: ${data.substring(0, 300)}`);
            }
            return reply.code(response.status).header('content-type', contentType).send(data);
        } catch (err) {
            fastify.log.error(`[WA-Proxy] Fetch error: ${err.message}`);
            return reply
                .code(502)
                .send(JSON.stringify({ error: 'WhatsApp Bot service unavailable', details: err.message }));
        }
    }

    const rl = (max) => ({ rateLimit: { max, timeWindow: '1 minute' } });

    // ---- Público: salud del bot (no expone datos de sesiones) ----------------
    fastify.get('/health', { config: rl(120) }, (request, reply) =>
        forward(reply, 'GET', '/health')
    );

    // V2: todas las rutas necesitan el taller activo para resolver la sesion unica.
    const pre = [authenticate, resolveWorkspace];
    const noSession = (reply) => reply.code(200).header('content-type', 'application/json')
        .send(JSON.stringify({ exists: false, isConnected: false, qr: null, notConfigured: true }));
    const canManage = async (request) => (await loadActor(request)).can_manage_whatsapp === true;
    const canSend = async (request) => (await loadActor(request)).can_send_messages === true;

    // ---- Listado: solo la sesion del taller ------------------------------
    fastify.get('/sessions', { config: rl(120), preHandler: pre }, async (request, reply) => {
        const sessionId = await resolveSessionId(request.workspace.id);
        const response = await fetch(`${BOT_URL}/sessions`, { headers: { 'x-api-key': BOT_KEY } }).catch(() => null);
        if (!response || !response.ok) {
            return reply.code(502).send({ error: 'WhatsApp Bot service unavailable' });
        }
        const sessions = await response.json().catch(() => []);
        if (!Array.isArray(sessions) || !sessionId) return reply.send([]);
        return reply.send(sessions.filter((s) => s.mechanicId === sessionId));
    });

    // ---- Estado de la sesion (cualquier integrante del taller) -------------
    fastify.get('/sessions/:mechanicId/status', { config: rl(240), preHandler: pre }, async (request, reply) => {
        const sessionId = await resolveSessionId(request.workspace.id);
        if (!sessionId) return noSession(reply);
        return forward(reply, 'GET', `/sessions/${sessionId}/status`);
    });

    // ---- Administrar la sesion (QR / iniciar / cerrar): solo owner/admin ---
    fastify.get('/sessions/:mechanicId/qr', { config: rl(240), preHandler: pre }, async (request, reply) => {
        if (!(await canManage(request))) return deny(reply);
        const sessionId = await resolveSessionId(request.workspace.id);
        if (!sessionId) return reply.send({ qr: null, isConnected: false });
        return forward(reply, 'GET', `/sessions/${sessionId}/qr`);
    });

    fastify.post('/sessions/:mechanicId/start', { config: rl(30), preHandler: pre }, async (request, reply) => {
        if (!(await canManage(request))) return deny(reply);
        const actor = await loadActor(request);
        const r = await startWorkspaceSession(request.workspace.id, actor.id);
        if (!r.ok) return reply.code(502).send({ error: r.error || 'No se pudo iniciar WhatsApp.' });
        return reply.send({ success: true, message: 'Session starting...' });
    });

    fastify.post('/sessions/:mechanicId/logout', { config: rl(30), preHandler: pre }, async (request, reply) => {
        if (!(await canManage(request))) return deny(reply);
        const sessionId = await resolveSessionId(request.workspace.id);
        if (!sessionId) return reply.send({ success: true });
        clearSessionCache(request.workspace.id);
        return forward(reply, 'POST', `/sessions/${sessionId}/logout`);
    });

    // ---- Envio de mensajes -------------------------------------------------
    // Texto: por lib/wa-send.js (queda en la bandeja y, si el bot esta reconectando, en la cola de reintentos).
    fastify.post('/send-message', { config: rl(60), preHandler: pre }, async (request, reply) => {
        const body = parseJsonBody(request);
        if (!body) return reply.code(400).send({ error: 'JSON invalido' });
        if (!(await canSend(request))) return deny(reply, 403, 'No tienes permiso para enviar mensajes.');
        if (!body.phone || !body.message) return reply.code(400).send({ error: 'phone y message son requeridos' });
        const r = await sendToClient(request.workspace.id, body.phone, String(body.message), { origin: 'panel', sentBy: request.user.id });
        if (r.sent) return reply.send({ success: true, messageId: r.messageId || null });
        if (r.queued) return reply.send({ success: true, queued: true });
        return reply.code(r.reason === 'whatsapp_desconectado' ? 503 : 500).send({ error: r.error || r.reason || 'No se pudo enviar', fallback: true });
    });

    // Multimedia: directo al bot con la sesion del taller (y constancia en la bandeja).
    fastify.post('/send-media', { config: rl(60), preHandler: pre }, async (request, reply) => {
        const body = parseJsonBody(request);
        if (!body) return reply.code(400).send({ error: 'JSON invalido' });
        if (!(await canSend(request))) return deny(reply, 403, 'No tienes permiso para enviar mensajes.');
        const sessionId = await resolveSessionId(request.workspace.id);
        if (!sessionId) return reply.code(503).send({ error: 'WhatsApp del taller no esta configurado', fallback: true });
        const out = await fetch(`${BOT_URL}/send-media`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': BOT_KEY },
            body: JSON.stringify({ ...body, mechanicId: sessionId }),
            signal: AbortSignal.timeout(30000),
        }).catch((e) => ({ ok: false, status: 502, text: async () => JSON.stringify({ error: e.message }) }));
        const text = await out.text();
        if (out.ok && body.phone) {
            let parsed = {}; try { parsed = JSON.parse(text); } catch { /* ignore */ }
            await logOutbound(request.workspace.id, body.phone, `[Imagen]${body.message ? ` ${body.message}` : ''}`, {
                origin: 'panel', sentBy: request.user.id, waMessageId: parsed.messageId || null,
            });
        }
        return reply.code(out.status).header('content-type', 'application/json').send(text);
    });

    // send-for-order: ahora es un envio de texto normal por la sesion del taller (valida que la orden sea del taller).
    fastify.post('/send-for-order', { config: rl(60), preHandler: pre }, async (request, reply) => {
        const body = parseJsonBody(request);
        if (!body) return reply.code(400).send({ error: 'JSON invalido' });
        if (!UUID_RE.test(String(body.orderId || ''))) {
            return reply.code(400).send({ error: 'orderId invalido' });
        }
        if (!(await canSend(request))) return deny(reply, 403, 'No tienes permiso para enviar mensajes.');
        const order = await unscoped(() =>
            prisma.order.findUnique({ where: { id: body.orderId }, select: { workspace_id: true } })
        );
        if (!order || order.workspace_id !== request.workspace.id) return deny(reply, 404, 'Orden no encontrada.');
        if (!body.phone || !body.message) return reply.code(400).send({ error: 'phone y message son requeridos' });
        const r = await sendToClient(request.workspace.id, body.phone, String(body.message), {
            origin: 'panel', sentBy: request.user.id, context: { order_id: body.orderId },
        });
        if (r.sent) return reply.send({ success: true, messageId: r.messageId || null });
        if (r.queued) return reply.send({ success: true, queued: true });
        return reply.code(r.reason === 'whatsapp_desconectado' ? 503 : 500).send({ error: r.error || r.reason || 'No se pudo enviar', fallback: true });
    });
}
