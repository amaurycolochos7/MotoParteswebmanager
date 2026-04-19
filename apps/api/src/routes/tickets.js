// Fase 7.2 — Rutas de tickets del cliente (dentro de un workspace).
// Monta /api/tickets* — cada cliente ve SOLO los suyos (scope por workspace + created_by).

import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { notifyNewTicket, notifyTicketReply } from '../lib/ticket-notifications.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

const MAX_BODY_LEN = 20000;
const ALLOWED_CATEGORIES = ['billing', 'technical', 'feature_request', 'account', 'whatsapp', 'onboarding', 'other'];

// Sanitización mínima: remover tags HTML peligrosos. Rendering es markdown-safe
// en el frontend (no HTML raw).
function sanitizeBody(raw) {
    if (typeof raw !== 'string') return '';
    return raw
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .slice(0, MAX_BODY_LEN);
}

export default async function ticketsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // GET /api/tickets — listar mis tickets en este workspace
    fastify.get('/', async (request, reply) => {
        const tickets = await unscoped(() =>
            prisma.supportTicket.findMany({
                where: {
                    workspace_id: request.workspaceId,
                    // Owners/admins ven todos los tickets del workspace; mecánicos solo los suyos.
                    ...((request.workspaceRole === 'owner' || request.workspaceRole === 'admin')
                        ? {}
                        : { created_by: request.user.id }),
                },
                orderBy: { last_message_at: 'desc' },
                select: {
                    id: true, ticket_number: true, subject: true, category: true,
                    priority: true, status: true, last_message_at: true, last_message_from: true,
                    customer_unread: true, created_at: true,
                    creator: { select: { full_name: true, email: true } },
                },
            })
        );
        return reply.send({ items: tickets });
    });

    // POST /api/tickets — crear nuevo ticket (max 10/h por IP)
    fastify.post('/', {
        config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    }, async (request, reply) => {
        const { subject, category, body_md, priority = 'normal' } = request.body || {};

        if (!subject?.trim()) return reply.status(400).send({ error: 'Asunto requerido.' });
        if (!body_md?.trim()) return reply.status(400).send({ error: 'Mensaje requerido.' });
        if (!ALLOWED_CATEGORIES.includes(category)) {
            return reply.status(400).send({ error: `Categoría inválida. Opciones: ${ALLOWED_CATEGORIES.join(', ')}` });
        }
        // El cliente no puede crear urgent directamente.
        const customerPriority = ['low', 'normal', 'high'].includes(priority) ? priority : 'normal';

        const metadata = {
            user_agent: request.headers['user-agent'] || null,
            referer: request.headers.referer || null,
        };

        const ticket = await unscoped(() =>
            prisma.supportTicket.create({
                data: {
                    workspace_id: request.workspaceId,
                    created_by: request.user.id,
                    subject: subject.trim().slice(0, 200),
                    category,
                    priority: customerPriority,
                    status: 'open',
                    last_message_from: 'customer',
                    admin_unread: 1,
                    metadata,
                    messages: {
                        create: {
                            author_id: request.user.id,
                            author_type: 'customer',
                            body_md: sanitizeBody(body_md),
                        },
                    },
                },
                include: {
                    creator: { select: { full_name: true, email: true } },
                    messages: true,
                    workspace: { select: { name: true, slug: true } },
                },
            })
        );

        // Notificar al super-admin (best-effort).
        notifyNewTicket(ticket).catch((e) => console.error('[notify] new ticket:', e.message));

        return reply.status(201).send({ ticket });
    });

    // GET /api/tickets/:id — ver ticket mío (con mensajes, SIN internal notes)
    fastify.get('/:id', async (request, reply) => {
        const ticket = await unscoped(() =>
            prisma.supportTicket.findFirst({
                where: {
                    id: request.params.id,
                    workspace_id: request.workspaceId,
                },
                include: {
                    messages: {
                        where: { is_internal: false },
                        orderBy: { created_at: 'asc' },
                        include: {
                            author: { select: { id: true, full_name: true, email: true, is_super_admin: true } },
                            attachments: true,
                        },
                    },
                    assignee: { select: { full_name: true, email: true } },
                    creator: { select: { full_name: true, email: true } },
                    attachments: { where: { message_id: null } },
                },
            })
        );
        if (!ticket) return reply.status(404).send({ error: 'Ticket no encontrado.' });

        // Reset unread counter del customer side.
        if (ticket.customer_unread > 0) {
            await unscoped(() =>
                prisma.supportTicket.update({
                    where: { id: ticket.id },
                    data: { customer_unread: 0 },
                })
            );
        }
        return reply.send({ ticket });
    });

    // POST /api/tickets/:id/reply — cliente responde (max 30/h por IP)
    fastify.post('/:id/reply', {
        config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    }, async (request, reply) => {
        const { body_md } = request.body || {};
        if (!body_md?.trim()) return reply.status(400).send({ error: 'Mensaje requerido.' });

        const ticket = await unscoped(() =>
            prisma.supportTicket.findFirst({
                where: { id: request.params.id, workspace_id: request.workspaceId },
                select: { id: true, status: true, subject: true },
            })
        );
        if (!ticket) return reply.status(404).send({ error: 'Ticket no encontrado.' });
        if (['closed', 'spam'].includes(ticket.status)) {
            return reply.status(400).send({ error: 'Ticket cerrado. Crea uno nuevo si el problema persiste.' });
        }

        const newMessage = await unscoped(() =>
            prisma.$transaction(async (tx) => {
                const msg = await tx.ticketMessage.create({
                    data: {
                        ticket_id: ticket.id,
                        author_id: request.user.id,
                        author_type: 'customer',
                        body_md: sanitizeBody(body_md),
                    },
                });
                await tx.supportTicket.update({
                    where: { id: ticket.id },
                    data: {
                        last_message_at: new Date(),
                        last_message_from: 'customer',
                        status: ticket.status === 'resolved' ? 'open' : 'waiting_admin',
                        admin_unread: { increment: 1 },
                        customer_unread: 0,
                    },
                });
                return msg;
            })
        );

        notifyTicketReply({ ticket_id: ticket.id, from: 'customer' }).catch(() => {});
        return reply.send({ message: newMessage });
    });

    // POST /api/tickets/:id/mark-resolved — cliente marca como resuelto (sin crear conversación nueva)
    fastify.post('/:id/mark-resolved', async (request, reply) => {
        const ticket = await unscoped(() =>
            prisma.supportTicket.findFirst({
                where: { id: request.params.id, workspace_id: request.workspaceId },
            })
        );
        if (!ticket) return reply.status(404).send({ error: 'Ticket no encontrado.' });

        await unscoped(() =>
            prisma.supportTicket.update({
                where: { id: ticket.id },
                data: { status: 'resolved', resolved_at: new Date() },
            })
        );
        return reply.send({ success: true });
    });
}
