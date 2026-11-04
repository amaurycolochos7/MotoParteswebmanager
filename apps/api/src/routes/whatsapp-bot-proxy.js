/**
 * Proxy hacia el bot de WhatsApp: /api/whatsapp-bot/* → http://whatsapp-bot:3002/*
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

    // ---- Listado: solo sesiones de tu(s) workspace(s) ------------------------
    fastify.get('/sessions', { config: rl(120), preHandler: [authenticate] }, async (request, reply) => {
        const response = await fetch(`${BOT_URL}/sessions`, { headers: { 'x-api-key': BOT_KEY } }).catch(() => null);
        if (!response || !response.ok) {
            return reply.code(502).send({ error: 'WhatsApp Bot service unavailable' });
        }
        const sessions = await response.json().catch(() => []);
        if (!Array.isArray(sessions)) return reply.send([]);
        if (isSuper(request)) return reply.send(sessions);

        const callerMemberships = await unscoped(() =>
            prisma.membership.findMany({
                where: { profile_id: request.user.id },
                select: { workspace_id: true },
            })
        );
        const ids = sessions.map((s) => s.mechanicId).filter((id) => UUID_RE.test(String(id)));
        const visible = new Set([request.user.id]);
        if (callerMemberships.length > 0 && ids.length > 0) {
            const rows = await unscoped(() =>
                prisma.membership.findMany({
                    where: {
                        profile_id: { in: ids },
                        workspace_id: { in: callerMemberships.map((m) => m.workspace_id) },
                    },
                    select: { profile_id: true },
                })
            );
            rows.forEach((r) => visible.add(r.profile_id));
        }
        return reply.send(sessions.filter((s) => visible.has(s.mechanicId)));
    });

    // ---- Estado de una sesión (uso) -----------------------------------------
    fastify.get('/sessions/:mechanicId/status', { config: rl(240), preHandler: [authenticate] }, async (request, reply) => {
        const { mechanicId } = request.params;
        if (!(await canOperateSession(request, mechanicId))) return deny(reply);
        return forward(reply, 'GET', `/sessions/${mechanicId}/status`);
    });

    // ---- Administrar sesión (QR / iniciar / cerrar) --------------------------
    fastify.get('/sessions/:mechanicId/qr', { config: rl(240), preHandler: [authenticate] }, async (request, reply) => {
        const { mechanicId } = request.params;
        if (!(await canOperateSession(request, mechanicId, { manage: true }))) return deny(reply);
        return forward(reply, 'GET', `/sessions/${mechanicId}/qr`);
    });

    fastify.post('/sessions/:mechanicId/start', { config: rl(30), preHandler: [authenticate] }, async (request, reply) => {
        const { mechanicId } = request.params;
        if (!(await canOperateSession(request, mechanicId, { manage: true }))) return deny(reply);
        return forward(reply, 'POST', `/sessions/${mechanicId}/start`);
    });

    fastify.post('/sessions/:mechanicId/logout', { config: rl(30), preHandler: [authenticate] }, async (request, reply) => {
        const { mechanicId } = request.params;
        if (!(await canOperateSession(request, mechanicId, { manage: true }))) return deny(reply);
        return forward(reply, 'POST', `/sessions/${mechanicId}/logout`);
    });

    // ---- Envío de mensajes ---------------------------------------------------
    // El mecánico puede enviar por su propia sesión o por la de un miembro de su
    // taller (p. ej. el dueño), nunca por la de otro taller.
    for (const path of ['/send-message', '/send-media']) {
        fastify.post(path, { config: rl(60), preHandler: [authenticate] }, async (request, reply) => {
            const body = parseJsonBody(request);
            if (!body) return reply.code(400).send({ error: 'JSON inválido' });
            if (!(await canOperateSession(request, body.mechanicId))) return deny(reply);
            return forward(reply, 'POST', path, body);
        });
    }

    // send-for-order: el bot elige la sesión; validamos que la orden sea de tu taller.
    fastify.post('/send-for-order', { config: rl(60), preHandler: [authenticate] }, async (request, reply) => {
        const body = parseJsonBody(request);
        if (!body) return reply.code(400).send({ error: 'JSON inválido' });
        if (!UUID_RE.test(String(body.orderId || ''))) {
            return reply.code(400).send({ error: 'orderId inválido' });
        }
        if (!isSuper(request)) {
            const order = await unscoped(() =>
                prisma.order.findUnique({ where: { id: body.orderId }, select: { workspace_id: true } })
            );
            if (!order || !order.workspace_id) return deny(reply, 404, 'Orden no encontrada.');
            const member = await unscoped(() =>
                prisma.membership.findFirst({
                    where: { profile_id: request.user.id, workspace_id: order.workspace_id },
                    select: { id: true },
                })
            );
            if (!member) return deny(reply, 404, 'Orden no encontrada.');
        }
        return forward(reply, 'POST', '/send-for-order', body);
    });
}
