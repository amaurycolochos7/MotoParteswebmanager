// Impresión de tickets — rutas del panel (JWT + workspace).
// Contrato: docs/IMPRESION-CONTRATO.md
import crypto from 'node:crypto';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace, requireRole } from '../middleware/workspace.js';
import { assertWithinLimit, incrementUsageAsync, PlanLimitError } from '../lib/billing.js';
import { resolvePrintSettings, sanitizePrintSettings } from '../lib/print-settings.js';
import { buildTicketDoc, buildTestDoc, toEscPos, toPlainText, toPdf80 } from '../lib/ticket.js';

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';
const AGENT_ONLINE_MS = 15 * 1000;
const MAX_PENDING = 50;

const adminOnly = requireRole('owner', 'admin');

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function publicAgent(agent) {
    if (!agent) return null;
    const seen = agent.last_seen_at ? new Date(agent.last_seen_at).getTime() : 0;
    return {
        id: agent.id,
        name: agent.name,
        key_prefix: agent.key_prefix,
        last_seen_at: agent.last_seen_at,
        printer_name: agent.printer_name,
        agent_version: agent.agent_version,
        connected: !!seen && Date.now() - seen < AGENT_ONLINE_MS,
    };
}

function publicJob(j) {
    return {
        id: j.id, order_id: j.order_id, kind: j.kind, status: j.status, copies: j.copies,
        attempts: j.attempts, error: j.error, title: j.title, created_at: j.created_at, printed_at: j.printed_at,
    };
}

async function currentAgent(workspaceId) {
    return prisma.printAgent.findFirst({
        where: { workspace_id: workspaceId, revoked_at: null },
        orderBy: { created_at: 'desc' },
    });
}

/** Trae la orden con todo lo que necesita el ticket (el scoping por taller es automático). */
async function loadTicketInput(orderId, workspace) {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { status: true, services: true, parts: true, mechanic: { select: { full_name: true } }, client: true, motorcycle: true },
    });
    if (!order) return null;
    const payments = await prisma.orderPayment.findMany({
        where: { order_id: orderId },
        orderBy: { payment_date: 'asc' },
    });
    return {
        workspace,
        settings: resolvePrintSettings(workspace),
        order,
        client: order.client || {},
        motorcycle: order.motorcycle || {},
        payments,
    };
}

async function enqueue({ request, kind, doc, settings, orderId = null, title, copies }) {
    const pending = await prisma.printJob.count({ where: { workspace_id: request.workspace.id, status: { in: ['pending', 'printing'] } } });
    if (pending >= MAX_PENDING) {
        const err = new Error('Hay demasiados tickets en espera. Revisa que la impresora esté conectada.');
        err.statusCode = 429;
        throw err;
    }
    const payload = toEscPos(doc, { accents: !!settings.accents, cut: 'full' });
    const job = await prisma.printJob.create({
        data: {
            workspace_id: request.workspace.id,
            order_id: orderId,
            kind,
            status: 'pending',
            copies: Math.min(3, Math.max(1, Number(copies) || settings.copies || 1)),
            title: String(title || '').slice(0, 120) || null,
            payload_b64: payload.toString('base64'),
            created_by: request.user.id,
        },
    });
    const agent = publicAgent(await currentAgent(request.workspace.id));
    return { job: publicJob(job), agent_connected: !!agent?.connected };
}

export default async function printRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // ── Ajustes + estado ──────────────────────────────────────────────
    fastify.get('/settings', async (request) => {
        const wsId = request.workspace.id;
        const [agent, groups] = await Promise.all([
            currentAgent(wsId),
            prisma.printJob.groupBy({ by: ['status'], where: { workspace_id: wsId, status: { in: ['pending', 'printing', 'failed'] } }, _count: { _all: true } }),
        ]);
        const queue = { pending: 0, printing: 0, failed: 0 };
        groups.forEach((g) => { queue[g.status] = g._count._all; });
        return { settings: resolvePrintSettings(request.workspace), agent: publicAgent(agent), queue };
    });

    fastify.put('/settings', { preHandler: adminOnly }, async (request) => {
        const patch = sanitizePrintSettings(request.body || {});
        const ws = await prisma.workspace.findUnique({ where: { id: request.workspace.id } });
        const settings = { ...(ws.settings || {}), print: { ...((ws.settings || {}).print || {}), ...patch } };
        const updated = await prisma.workspace.update({ where: { id: ws.id }, data: { settings } });
        request.workspace.settings = updated.settings;
        return { settings: resolvePrintSettings(updated) };
    });

    // ── Clave del agente ──────────────────────────────────────────────
    fastify.post('/agent-key', { preHandler: adminOnly }, async (request) => {
        const key = `mpp_${crypto.randomBytes(24).toString('base64url')}`;
        const wsId = request.workspace.id;
        await prisma.printAgent.updateMany({ where: { workspace_id: wsId, revoked_at: null }, data: { revoked_at: new Date() } });
        const agent = await prisma.printAgent.create({
            data: { workspace_id: wsId, key_hash: sha256(key), key_prefix: key.slice(0, 8), created_by: request.user.id },
        });
        return { key, agent: publicAgent(agent) };
    });

    fastify.delete('/agent-key', { preHandler: adminOnly }, async (request) => {
        await prisma.printAgent.updateMany({ where: { workspace_id: request.workspace.id, revoked_at: null }, data: { revoked_at: new Date() } });
        return { ok: true };
    });

    // ── Vista previa ──────────────────────────────────────────────────
    fastify.get('/orders/:orderId/preview', async (request, reply) => {
        const input = await loadTicketInput(request.params.orderId, request.workspace);
        if (!input) return reply.status(404).send({ error: 'Orden no encontrada' });
        const doc = buildTicketDoc(input);
        return { text: toPlainText(doc), cols: doc.cols };
    });

    fastify.get('/sample', async (request) => {
        const settings = resolvePrintSettings(request.workspace);
        const now = new Date();
        const doc = buildTicketDoc({
            workspace: request.workspace,
            settings,
            now,
            order: {
                order_number: 'MP-26-000', created_at: new Date(now.getTime() - 2 * 3600e3), completed_at: now,
                status: { name: 'Entregada' }, customer_complaint: 'Ruido en la cadena y no arranca bien en las mañanas',
                labor_total: 1030, parts_total: 1115, total_amount: 2145, public_token: 'EJEMPLO12345',
                mechanic: { full_name: 'Carlos M.' },
                services: [{ name: 'Afinación mayor', price: 850, quantity: 1 }, { name: 'Lubricado de cadena', price: 180, quantity: 1 }],
                parts: [{ name: 'Bujía NGK CR8E', price: 95, quantity: 2 }, { name: 'Kit de arrastre 428H 40/14', price: 780, quantity: 1 }, { name: 'Aceite 20W50 1L', price: 145, quantity: 1 }],
            },
            client: { full_name: 'Juan Pérez López', phone: '9611234505' },
            motorcycle: { brand: 'Italika', model: 'FT150', year: 2022, plates: '4X2-ABC' },
            payments: [
                { amount: 500, payment_method: 'efectivo', payment_date: new Date(now.getTime() - 86400e3) },
                { amount: 1645, payment_method: 'tarjeta', payment_date: now, receipt_number: 'REC-26-0087' },
            ],
        });
        return { text: toPlainText(doc), cols: doc.cols };
    });

    // ── Imprimir ──────────────────────────────────────────────────────
    fastify.post('/orders/:orderId/ticket', async (request, reply) => {
        const input = await loadTicketInput(request.params.orderId, request.workspace);
        if (!input) return reply.status(404).send({ error: 'Orden no encontrada' });
        const doc = buildTicketDoc(input);
        try {
            const result = await enqueue({
                request, kind: 'ticket', doc, settings: input.settings, orderId: input.order.id,
                title: `${input.order.order_number} · ${input.client.full_name || 'Sin nombre'}`,
                copies: request.body?.copies,
            });
            return reply.status(201).send(result);
        } catch (err) {
            if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
            throw err;
        }
    });

    fastify.post('/test', { preHandler: adminOnly }, async (request, reply) => {
        const settings = resolvePrintSettings(request.workspace);
        try {
            const result = await enqueue({
                request, kind: 'test', doc: buildTestDoc(settings, request.workspace), settings, title: 'Ticket de prueba', copies: 1,
            });
            return reply.status(201).send(result);
        } catch (err) {
            if (err.statusCode) return reply.status(err.statusCode).send({ error: err.message });
            throw err;
        }
    });

    // ── Cola ──────────────────────────────────────────────────────────
    fastify.get('/jobs', async (request) => {
        const limit = Math.min(100, Math.max(1, parseInt(request.query.limit) || 30));
        const where = { workspace_id: request.workspace.id };
        if (request.query.order_id) where.order_id = String(request.query.order_id);
        const jobs = await prisma.printJob.findMany({ where, orderBy: { created_at: 'desc' }, take: limit });
        return { jobs: jobs.map(publicJob) };
    });

    fastify.post('/jobs/:id/reprint', async (request, reply) => {
        const src = await prisma.printJob.findFirst({ where: { id: request.params.id, workspace_id: request.workspace.id } });
        if (!src) return reply.status(404).send({ error: 'Trabajo no encontrado' });
        const job = await prisma.printJob.create({
            data: {
                workspace_id: src.workspace_id, order_id: src.order_id, kind: src.kind, status: 'pending', copies: src.copies,
                title: src.title, payload_b64: src.payload_b64, created_by: request.user.id,
            },
        });
        return reply.status(201).send({ job: publicJob(job) });
    });

    fastify.post('/jobs/:id/cancel', async (request, reply) => {
        const res = await prisma.printJob.updateMany({
            where: { id: request.params.id, workspace_id: request.workspace.id, status: 'pending' },
            data: { status: 'cancelled' },
        });
        const job = await prisma.printJob.findFirst({ where: { id: request.params.id, workspace_id: request.workspace.id } });
        if (!job) return reply.status(404).send({ error: 'Trabajo no encontrado' });
        if (res.count === 0) return reply.status(400).send({ error: 'Solo se puede cancelar un ticket que aún está en espera.' });
        return { job: publicJob(job) };
    });

    // ── Ticket por WhatsApp (PDF de 80 mm) ────────────────────────────
    fastify.post('/orders/:orderId/ticket/whatsapp', async (request, reply) => {
        try {
            await assertWithinLimit(request.workspace.id, 'whatsapp_messages');
        } catch (err) {
            if (err instanceof PlanLimitError) {
                return reply.status(402).send({ error: err.message, code: 'PLAN_LIMIT', feature: err.feature, limit: err.limit, used: err.used });
            }
            throw err;
        }
        const input = await loadTicketInput(request.params.orderId, request.workspace);
        if (!input) return reply.status(404).send({ error: 'Orden no encontrada' });
        if (!input.client.phone) return reply.status(400).send({ error: 'El cliente no tiene teléfono' });

        const pdf = await toPdf80(buildTicketDoc(input, { accents: true }));
        const o = input.order;
        const caption = `*TICKET DE SERVICIO*\n${o.order_number}\nTotal: $${Number(o.total_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n\n-- ${request.workspace.name || 'MotoPartes'}`;
        const mechanicId = o.approved_by || o.mechanic_id || request.user.id;
        try {
            const res = await fetch(`${BOT_URL}/send-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
                body: JSON.stringify({
                    mechanicId, phone: input.client.phone, message: caption,
                    base64: pdf.toString('base64'), filename: `${o.order_number}_ticket.pdf`, mimetype: 'application/pdf',
                }),
                signal: AbortSignal.timeout(30000),
            });
            const text = await res.text();
            let body; try { body = JSON.parse(text); } catch { body = { error: text }; }
            if (!res.ok) return reply.send({ success: false, fallback: true, error: body.error || 'WhatsApp no disponible', botStatus: res.status });
            incrementUsageAsync(request.workspace.id, 'whatsapp_messages', 1);
            return reply.send({ success: true, automated: true, messageId: body.messageId });
        } catch (err) {
            fastify.log.error(`[TICKET-WA] ${err.message}`);
            return reply.send({ success: false, fallback: true, error: `WhatsApp bot error: ${err.message}` });
        }
    });
}
