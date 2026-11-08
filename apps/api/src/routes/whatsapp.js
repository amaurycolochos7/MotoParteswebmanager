import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { loadActor, requirePermission } from '../lib/permissions.js';
import { getWorkspaceStatus, startWorkspaceSession, logoutWorkspaceSession, resolveSessionId, clearSessionCache } from '../lib/wa-session.js';
import { sendToClient } from '../lib/wa-send.js';

// WhatsApp del taller (V2): UNA sesión compartida. Ver docs/CONTRATO-V2.md.
export default async function whatsappRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    const forbid = (reply, error = 'No tienes permiso para esta acción.') => reply.status(403).send({ error });

    // GET /api/whatsapp/status — owner/admin/maestro
    fastify.get('/status', { preHandler: [requirePermission('can_see_whatsapp_status')] }, async (request) => {
        const status = await getWorkspaceStatus(request.workspace.id);
        const pending = await prisma.waOutbox.count({ where: { workspace_id: request.workspace.id, status: 'pending' } });
        return { ...status, pending_messages: pending };
    });

    // POST /api/whatsapp/start — owner/admin: inicia la sesión del taller (el QR sale en /status)
    fastify.post('/start', { preHandler: [requirePermission('can_manage_whatsapp')] }, async (request, reply) => {
        const actor = await loadActor(request);
        const r = await startWorkspaceSession(request.workspace.id, actor.id);
        if (!r.ok) return reply.status(502).send({ error: r.error || 'No se pudo iniciar WhatsApp.' });
        return { success: true };
    });

    // POST /api/whatsapp/logout — owner/admin: cierra la sesión (para cambiar de número)
    fastify.post('/logout', { preHandler: [requirePermission('can_manage_whatsapp')] }, async (request, reply) => {
        const r = await logoutWorkspaceSession(request.workspace.id);
        if (!r.ok) return reply.status(502).send({ error: r.error || 'No se pudo cerrar la sesión.' });
        clearSessionCache(request.workspace.id);
        return { success: true };
    });

    // POST /api/whatsapp/send { phone, message, order_id? } — envío manual desde el panel
    fastify.post('/send', { preHandler: [requirePermission('can_send_messages')] }, async (request, reply) => {
        const { phone, message } = request.body || {};
        const text = String(message || '').trim();
        if (!phone) return reply.status(400).send({ error: 'phone requerido.' });
        if (!text) return reply.status(400).send({ error: 'El mensaje está vacío.' });
        if (text.length > 4000) return reply.status(400).send({ error: 'El mensaje es demasiado largo.' });
        const r = await sendToClient(request.workspace.id, phone, text, {
            origin: 'panel', sentBy: request.user.id, context: { order_id: request.body?.order_id || null },
        });
        if (r.sent) return { success: true, queued: false, messageId: r.messageId || null };
        if (r.queued) return { success: true, queued: true, reason: r.reason };
        return reply.status(502).send({ success: false, error: r.error || r.reason || 'No se pudo enviar.' });
    });

    // ── Sesiones (heredado, acotado) ─────────────────────────────────────
    // GET /api/whatsapp/sessions — filas del taller (la sesión única es la que coincide con whatsapp_session_profile_id)
    fastify.get('/sessions', async (request) => {
        const sessionId = await resolveSessionId(request.workspace.id);
        const rows = await prisma.whatsappSession.findMany({
            include: { mechanic: { select: { id: true, full_name: true, phone: true, is_master_mechanic: true } } },
        });
        return rows.map((r) => ({ ...r, is_workspace_session: r.mechanic_id === sessionId }));
    });

    fastify.get('/sessions/:mechanicId', async (request) => {
        return prisma.whatsappSession.findUnique({
            where: { mechanic_id: request.params.mechanicId },
            include: { mechanic: { select: { id: true, full_name: true, phone: true } } },
        });
    });

    // PUT /api/whatsapp/sessions/:mechanicId — solo owner/admin y solo campos conocidos (antes: asignación masiva).
    fastify.put('/sessions/:mechanicId', async (request, reply) => {
        const actor = await loadActor(request);
        if (!actor.can_manage_whatsapp) return forbid(reply);
        const b = request.body || {};
        const data = {};
        if (typeof b.is_connected === 'boolean') data.is_connected = b.is_connected;
        if (typeof b.phone_number === 'string' || b.phone_number === null) data.phone_number = b.phone_number;
        if (typeof b.session_name === 'string' || b.session_name === null) data.session_name = b.session_name;
        return prisma.whatsappSession.upsert({
            where: { mechanic_id: request.params.mechanicId },
            update: data,
            create: { mechanic_id: request.params.mechanicId, ...data },
        });
    });
}
