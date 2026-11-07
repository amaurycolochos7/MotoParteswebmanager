// Agente de impresión → API. Autenticación por clave del agente (x-print-key),
// SIN JWT. Contrato: docs/IMPRESION-CONTRATO.md
//
// Este plugin corre sin contexto de workspace (no hay usuario): por eso TODAS las
// consultas filtran explícitamente por workspace_id del agente.
import prisma from '../lib/prisma.js';
import { sha256 } from './print.js';

const MAX_ATTEMPTS = 5;
const STALE_PRINTING_MS = 60 * 1000;       // un "imprimiendo" sin resultado vuelve a la cola
const EXPIRE_PENDING_MS = 48 * 3600 * 1000; // no imprimir tickets de hace días al reconectar

export default async function printAgentRoutes(fastify) {
    fastify.addHook('preHandler', async (request, reply) => {
        const key = request.headers['x-print-key'];
        if (typeof key !== 'string' || !key.startsWith('mpp_') || key.length > 100) {
            return reply.status(401).send({ error: 'Clave del agente inválida' });
        }
        const agent = await prisma.printAgent.findUnique({
            where: { key_hash: sha256(key) },
            include: { workspace: { select: { is_active: true } } },
        });
        if (!agent || agent.revoked_at || !agent.workspace?.is_active) {
            return reply.status(401).send({ error: 'Clave del agente inválida o revocada' });
        }
        request.agent = agent;
    });

    const limit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

    // GET /ping — el asistente de instalación comprueba que la clave sirva (no reclama trabajos)
    fastify.get('/ping', limit, async (request) => {
        await prisma.printAgent.update({ where: { id: request.agent.id }, data: { last_seen_at: new Date() } });
        return { ok: true };
    });

    // GET /poll — latido + reclama el siguiente trabajo
    fastify.get('/poll', limit, async (request) => {
        const agent = request.agent;
        const wsId = agent.workspace_id;
        const now = new Date();
        const version = String(request.query.version || '').slice(0, 20) || null;
        const printer = String(request.query.printer || '').slice(0, 120) || null;

        // Solo se pisan versión/impresora si el agente las manda (no borrar con null).
        await prisma.printAgent.update({
            where: { id: agent.id },
            data: { last_seen_at: now, ...(version && { agent_version: version }), ...(printer && { printer_name: printer }) },
        });

        // Mantenimiento de la cola de este taller
        const stale = new Date(now.getTime() - STALE_PRINTING_MS);
        await prisma.printJob.updateMany({
            where: { workspace_id: wsId, status: 'printing', claimed_at: { lt: stale }, attempts: { gte: MAX_ATTEMPTS } },
            data: { status: 'failed', error: 'La impresora no respondió' },
        });
        await prisma.printJob.updateMany({
            where: { workspace_id: wsId, status: 'printing', claimed_at: { lt: stale } },
            data: { status: 'pending' },
        });
        await prisma.printJob.updateMany({
            where: { workspace_id: wsId, status: 'pending', created_at: { lt: new Date(now.getTime() - EXPIRE_PENDING_MS) } },
            data: { status: 'failed', error: 'Expiró: la laptop estuvo desconectada más de 48 h' },
        });

        // Reclamo atómico: solo uno gana aunque lleguen dos sondeos a la vez
        for (let i = 0; i < 3; i++) {
            const next = await prisma.printJob.findFirst({
                where: { workspace_id: wsId, status: 'pending', OR: [{ next_attempt_at: null }, { next_attempt_at: { lte: now } }] },
                orderBy: { created_at: 'asc' },
            });
            if (!next) return { job: null };
            const claimed = await prisma.printJob.updateMany({
                where: { id: next.id, workspace_id: wsId, status: 'pending' },
                data: { status: 'printing', claimed_at: now, attempts: { increment: 1 }, agent_id: agent.id, error: null },
            });
            if (claimed.count === 1) {
                return {
                    job: {
                        id: next.id, kind: next.kind, copies: next.copies, title: next.title,
                        attempts: next.attempts + 1, payload_b64: next.payload_b64,
                    },
                };
            }
        }
        return { job: null };
    });

    // POST /jobs/:id/result
    fastify.post('/jobs/:id/result', limit, async (request, reply) => {
        const wsId = request.agent.workspace_id;
        const { ok, error } = request.body || {};
        const job = await prisma.printJob.findFirst({ where: { id: request.params.id, workspace_id: wsId } });
        if (!job) return reply.status(404).send({ error: 'Trabajo no encontrado' });
        // Idempotente: si ya no está "imprimiendo" (cancelado, ya reportado) no se toca.
        if (job.status !== 'printing') return { ok: true };

        if (ok === true) {
            await prisma.printJob.updateMany({
                where: { id: job.id, workspace_id: wsId, status: 'printing' },
                data: { status: 'printed', printed_at: new Date(), error: null },
            });
        } else {
            const msg = String(error || 'Error de impresión').slice(0, 300);
            const giveUp = job.attempts >= MAX_ATTEMPTS;
            await prisma.printJob.updateMany({
                where: { id: job.id, workspace_id: wsId, status: 'printing' },
                data: giveUp
                    ? { status: 'failed', error: msg }
                    : { status: 'pending', error: msg, next_attempt_at: new Date(Date.now() + 15000 * job.attempts) },
            });
        }
        return { ok: true };
    });
}
