import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { assertWithinLimit, incrementUsageAsync, PlanLimitError } from '../lib/billing.js';
import {
    normalizeEvidenceType,
    resolveEvidenceRole,
    canUploadEvidence,
    canSendEvidence,
    canDeleteEvidence,
    canCreateAdditionalQuote,
    computeEvidenceExpiry,
    softDeletePatch,
    sentPatch,
    computeQuoteTotals,
    buildAdditionalQuotePayload,
    parseDataUrl,
    evidenceTypeLabel,
    EVIDENCE_TYPES,
} from '../lib/evidences.js';

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

// Sólo lo necesario para el listado: quién subió la evidencia.
const EVIDENCE_INCLUDE = {
    uploader: { select: { id: true, full_name: true } },
};

// Clasifica al actor (master | mechanic | auxiliary). El JWT no trae las
// banderas de maestro/auxiliar, así que leemos el Profile (no está scopeado).
async function getActorRole(request) {
    const profile = await prisma.profile.findUnique({
        where: { id: request.user.id },
        select: { is_master_mechanic: true, requires_approval: true, role: true },
    });
    return resolveEvidenceRole({ workspaceRole: request.workspaceRole, profile });
}

function deny(reply, msg) {
    return reply.status(403).send({ error: msg });
}

// Genera folio de cotización COT-YY-NNNN por workspace (espejo de quotations.js).
async function generateQuotationNumber() {
    const yy = String(new Date().getFullYear()).slice(-2);
    const prefix = `COT-${yy}-`;
    const last = await prisma.quotation.findFirst({
        where: { quotation_number: { startsWith: prefix } },
        orderBy: { quotation_number: 'desc' },
        select: { quotation_number: true },
    });
    const seq = last ? parseInt(last.quotation_number.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
}

export default async function evidencesRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // GET /api/evidences?orderId=  — evidencias ACTIVAS (no eliminadas) de una orden.
    // Cualquier miembro que pueda ver la orden puede listar (auxiliar incluido).
    fastify.get('/', async (request, reply) => {
        const { orderId } = request.query;
        if (!orderId) return reply.status(400).send({ error: 'orderId es requerido' });
        const evidences = await prisma.orderPhoto.findMany({
            where: { order_id: orderId, evidence_type: { not: null }, deleted_at: null },
            include: EVIDENCE_INCLUDE,
            orderBy: { created_at: 'desc' },
        });
        return evidences;
    });

    // POST /api/evidences  — subir evidencia (maestro + mecánico normal; auxiliar 403).
    // Body: { order_id, url (dataURL base64), evidence_type, note }
    fastify.post('/', async (request, reply) => {
        const role = await getActorRole(request);
        if (!canUploadEvidence(role)) {
            return deny(reply, 'El auxiliar no puede subir evidencias.');
        }

        const data = request.body || {};
        const type = normalizeEvidenceType(data.evidence_type);
        if (!type) {
            return reply.status(400).send({
                error: `evidence_type inválido. Permitidos: ${EVIDENCE_TYPES.join(', ')}`,
            });
        }
        if (!data.order_id) return reply.status(400).send({ error: 'order_id es requerido' });
        if (!data.url) return reply.status(400).send({ error: 'La imagen (url) es requerida' });

        // Verifica que la orden exista y pertenezca al workspace (auto-scope).
        const order = await prisma.order.findUnique({
            where: { id: data.order_id },
            select: { id: true },
        });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });

        const retentionDays = Number(process.env.PHOTO_RETENTION_DAYS) || 30;
        const created = await prisma.orderPhoto.create({
            data: {
                order_id: data.order_id,
                url: data.url,
                evidence_type: type,
                category: type, // mantiene category coherente para vistas legacy
                caption: data.note || null, // nota opcional
                uploaded_by: request.user.id,
                expires_at: computeEvidenceExpiry(new Date(), retentionDays),
            },
            include: EVIDENCE_INCLUDE,
        });
        return reply.status(201).send(created);
    });

    // DELETE /api/evidences/:id  — soft delete (sólo maestro).
    fastify.delete('/:id', async (request, reply) => {
        const role = await getActorRole(request);
        if (!canDeleteEvidence(role)) {
            return deny(reply, 'Sólo el mecánico maestro puede eliminar evidencias.');
        }

        const evidence = await prisma.orderPhoto.findUnique({
            where: { id: request.params.id },
            select: { id: true, evidence_type: true, deleted_at: true },
        });
        if (!evidence || !evidence.evidence_type) {
            return reply.status(404).send({ error: 'Evidencia no encontrada' });
        }
        if (evidence.deleted_at) return { success: true, already_deleted: true };

        // Motivo opcional (regla 4): puede venir en body o query.
        const reason = (request.body && request.body.reason) || request.query?.reason || null;
        await prisma.orderPhoto.update({
            where: { id: evidence.id },
            data: softDeletePatch(request.user.id, reason),
        });
        return { success: true };
    });

    // POST /api/evidences/send  — enviar evidencias al cliente por WhatsApp (sólo maestro).
    // Body: { order_id, evidence_ids: [], message }
    fastify.post('/send', async (request, reply) => {
        const role = await getActorRole(request);
        if (!canSendEvidence(role)) {
            return deny(reply, 'Sólo el mecánico maestro puede enviar evidencias al cliente.');
        }

        const { order_id, evidence_ids, message } = request.body || {};
        if (!order_id || !Array.isArray(evidence_ids) || evidence_ids.length === 0) {
            return reply.status(400).send({ error: 'order_id y evidence_ids son requeridos' });
        }

        // Tope del plan (mensajes WhatsApp/mes).
        try {
            await assertWithinLimit(request.workspace.id, 'whatsapp_messages');
        } catch (err) {
            if (err instanceof PlanLimitError) {
                return reply.status(402).send({
                    error: err.message, code: 'PLAN_LIMIT', feature: err.feature,
                    limit: err.limit, used: err.used,
                });
            }
            throw err;
        }

        const order = await prisma.order.findUnique({
            where: { id: order_id },
            include: { client: true },
        });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });
        if (!order.client?.phone) {
            return reply.status(400).send({ error: 'El cliente no tiene teléfono' });
        }

        // Sólo evidencias de ESTA orden, no eliminadas.
        const evidences = await prisma.orderPhoto.findMany({
            where: {
                id: { in: evidence_ids },
                order_id,
                evidence_type: { not: null },
                deleted_at: null,
            },
        });
        if (evidences.length === 0) {
            return reply.status(404).send({ error: 'No hay evidencias válidas para enviar' });
        }

        // mechanicId: preferimos una sesión conectada del taller; fallback al
        // mecánico de la orden (mismo criterio que order-pdf).
        const session = await prisma.whatsappSession.findFirst({ where: { is_connected: true } });
        const mechanicId = session?.mechanic_id || order.approved_by || order.mechanic_id;

        const results = [];
        let sentCount = 0;
        for (let i = 0; i < evidences.length; i++) {
            const ev = evidences[i];
            const { mimetype, base64 } = parseDataUrl(ev.url);
            const label = evidenceTypeLabel(ev.evidence_type);
            // El mensaje del usuario va en la primera; las demás llevan su etiqueta+nota.
            const caption = i === 0
                ? [message?.trim(), `📸 ${label}${ev.caption ? `: ${ev.caption}` : ''}`].filter(Boolean).join('\n\n')
                : `📸 ${label}${ev.caption ? `: ${ev.caption}` : ''}`;
            const filename = `evidencia-${ev.evidence_type}-${i + 1}.jpg`;

            try {
                const botRes = await fetch(`${BOT_URL}/send-document`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
                    body: JSON.stringify({ mechanicId, phone: order.client.phone, message: caption, base64, filename, mimetype }),
                    signal: AbortSignal.timeout(30000),
                });
                const ok = botRes.ok;
                if (ok) {
                    sentCount++;
                    incrementUsageAsync(request.workspace.id, 'whatsapp_messages', 1);
                    await prisma.orderPhoto.update({
                        where: { id: ev.id },
                        data: sentPatch(request.user.id),
                    });
                }
                results.push({ id: ev.id, ok });
            } catch (e) {
                request.log.error(`[EVIDENCE-SEND] bot error: ${e.message}`);
                results.push({ id: ev.id, ok: false, error: e.message });
            }
        }

        if (sentCount === 0) {
            return reply.send({ success: false, fallback: true, error: 'WhatsApp no disponible', results });
        }
        return reply.send({ success: true, sent: sentCount, total: evidences.length, results });
    });

    // POST /api/evidences/:id/quote  — crear cotización adicional desde una evidencia.
    // Maestro siempre; mecánico normal sólo con permiso explícito (can_create_quotes).
    // Body: { description, labor: [{name, price}], parts: [{name, price, quantity, notes}] }
    fastify.post('/:id/quote', async (request, reply) => {
        const role = await getActorRole(request);
        if (!canCreateAdditionalQuote(role, request.workspacePermissions)) {
            return deny(reply, 'No tienes permiso para crear cotizaciones adicionales.');
        }

        const evidence = await prisma.orderPhoto.findUnique({
            where: { id: request.params.id },
        });
        if (!evidence || !evidence.evidence_type || evidence.deleted_at) {
            return reply.status(404).send({ error: 'Evidencia no encontrada' });
        }

        const order = await prisma.order.findUnique({
            where: { id: evidence.order_id },
            select: { id: true, client_id: true, motorcycle_id: true },
        });
        if (!order) return reply.status(404).send({ error: 'Orden no encontrada' });
        if (!order.client_id) {
            return reply.status(400).send({ error: 'La orden no tiene cliente para cotizar' });
        }

        const data = request.body || {};
        const labor = Array.isArray(data.labor) ? data.labor : [];
        const parts = Array.isArray(data.parts) ? data.parts : [];
        const quotationNumber = await generateQuotationNumber();

        const payload = buildAdditionalQuotePayload({
            order,
            description: data.description,
            labor,
            parts,
            quotationNumber,
            createdBy: request.user.id,
        });

        try {
            const created = await prisma.$transaction(async (tx) => {
                const quotation = await tx.quotation.create({ data: payload });

                if (labor.length > 0) {
                    await tx.quotationLabor.createMany({
                        data: labor.map((l) => ({
                            quotation_id: quotation.id,
                            name: l.name,
                            price: parseFloat(l.price) || 0,
                        })),
                    });
                }
                if (parts.length > 0) {
                    await tx.quotationPart.createMany({
                        data: parts.map((p) => ({
                            quotation_id: quotation.id,
                            name: p.name,
                            price: parseFloat(p.price) || 0,
                            quantity: parseInt(p.quantity, 10) || 1,
                            notes: p.notes || null,
                        })),
                    });
                }

                // Liga la evidencia con su cotización adicional.
                await tx.orderPhoto.update({
                    where: { id: evidence.id },
                    data: { quotation_id: quotation.id },
                });

                return quotation;
            });

            return reply.status(201).send(
                await prisma.quotation.findUnique({
                    where: { id: created.id },
                    include: {
                        client: true,
                        motorcycle: true,
                        labor: { orderBy: { created_at: 'asc' } },
                        parts: { orderBy: { created_at: 'asc' } },
                    },
                })
            );
        } catch (err) {
            request.log.error('Error creando cotización adicional:', err);
            return reply.status(400).send({ error: err.message || 'Error al crear la cotización' });
        }
    });
}
