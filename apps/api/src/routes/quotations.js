import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { generateOrderNumber } from '../lib/order-number.js';

// Helper: generate a quotation number "COT-YY-NNNN" — sequence per workspace.
// The Prisma extension auto-scopes findFirst() to the active workspace, so the
// `startsWith` lookup naturally returns the highest existing folio for THIS
// taller and the counter resets per-workspace.
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

// Helper: compute totals from labor + parts arrays
function computeTotals(laborRows, partsRows) {
    const laborTotal = (laborRows || []).reduce(
        (sum, l) => sum + (parseFloat(l.price) || 0),
        0
    );
    const partsTotal = (partsRows || []).reduce(
        (sum, p) => sum + (parseFloat(p.price) || 0) * (parseInt(p.quantity, 10) || 1),
        0
    );
    return {
        labor_total: laborTotal,
        parts_total: partsTotal,
        total_amount: laborTotal + partsTotal,
    };
}

// Helper: recompute totals for an existing quotation by reading its rows
async function recalcQuotationTotals(quotationId) {
    const [labor, parts] = await Promise.all([
        prisma.quotationLabor.findMany({ where: { quotation_id: quotationId } }),
        prisma.quotationPart.findMany({ where: { quotation_id: quotationId } }),
    ]);
    const totals = computeTotals(labor, parts);
    await prisma.quotation.update({
        where: { id: quotationId },
        data: totals,
    });
    return totals;
}

const QUOTATION_INCLUDE = {
    client: true,
    motorcycle: true,
    labor: { orderBy: { created_at: 'asc' } },
    parts: { orderBy: { created_at: 'asc' } },
};

export default async function quotationsRoutes(fastify) {
    fastify.register(async function authenticatedRoutes(app) {
        app.addHook('preHandler', authenticate);
        app.addHook('preHandler', resolveWorkspace);

        // GET /api/quotations  — opcional ?status= y ?client_id=
        app.get('/', async (request) => {
            const { status, client_id } = request.query;
            const where = {};
            if (status) where.status = status;
            if (client_id) where.client_id = client_id;
            return prisma.quotation.findMany({
                where,
                include: QUOTATION_INCLUDE,
                orderBy: { created_at: 'desc' },
            });
        });

        // GET /api/quotations/:id
        app.get('/:id', async (request, reply) => {
            const quotation = await prisma.quotation.findUnique({
                where: { id: request.params.id },
                include: QUOTATION_INCLUDE,
            });
            if (!quotation) {
                return reply.status(404).send({ error: 'Cotización no encontrada' });
            }
            return quotation;
        });

        // POST /api/quotations
        app.post('/', async (request, reply) => {
            const data = request.body || {};
            if (!data.client_id) {
                return reply.status(400).send({ error: 'client_id es requerido' });
            }

            const quotationNumber = await generateQuotationNumber();
            const totals = computeTotals(data.labor, data.parts);

            // valid_until: si llega valid_days > 0 lo calculamos; si llega
            // valid_until directo, lo respetamos.
            let validUntil = null;
            if (data.valid_until) {
                validUntil = new Date(data.valid_until);
            } else if (data.valid_days && parseInt(data.valid_days, 10) > 0) {
                validUntil = new Date();
                validUntil.setDate(validUntil.getDate() + parseInt(data.valid_days, 10));
            }

            try {
                const created = await prisma.$transaction(async (tx) => {
                    const quotation = await tx.quotation.create({
                        data: {
                            quotation_number: quotationNumber,
                            client_id: data.client_id,
                            motorcycle_id: data.motorcycle_id || null,
                            customer_complaint: data.customer_complaint || null,
                            notes: data.notes || null,
                            valid_until: validUntil,
                            created_by: request.user?.id || null,
                            labor_total: totals.labor_total,
                            parts_total: totals.parts_total,
                            total_amount: totals.total_amount,
                        },
                    });

                    if (Array.isArray(data.labor) && data.labor.length > 0) {
                        await tx.quotationLabor.createMany({
                            data: data.labor.map((l) => ({
                                quotation_id: quotation.id,
                                name: l.name,
                                price: parseFloat(l.price) || 0,
                            })),
                        });
                    }

                    if (Array.isArray(data.parts) && data.parts.length > 0) {
                        await tx.quotationPart.createMany({
                            data: data.parts.map((p) => ({
                                quotation_id: quotation.id,
                                name: p.name,
                                price: parseFloat(p.price) || 0,
                                quantity: parseInt(p.quantity, 10) || 1,
                                notes: p.notes || null,
                            })),
                        });
                    }

                    return quotation;
                });

                return prisma.quotation.findUnique({
                    where: { id: created.id },
                    include: QUOTATION_INCLUDE,
                });
            } catch (err) {
                request.log.error('Error creating quotation:', err);
                return reply.status(400).send({
                    error: err.message || 'Error al crear la cotización',
                });
            }
        });

        // PUT /api/quotations/:id — actualiza cabecera, líneas y status.
        // Si se mandan `labor` o `parts` (arrays), se reemplazan por completo.
        app.put('/:id', async (request, reply) => {
            const { id } = request.params;
            const data = request.body || {};

            // Verifica existencia (la extensión scopea por workspace)
            const existing = await prisma.quotation.findUnique({ where: { id } });
            if (!existing) {
                return reply.status(404).send({ error: 'Cotización no encontrada' });
            }
            if (existing.status === 'convertida') {
                return reply.status(400).send({
                    error: 'No se puede modificar una cotización ya convertida en orden',
                });
            }

            // Construye payload de update solo con campos válidos
            const updateData = {};
            if (data.customer_complaint !== undefined) {
                updateData.customer_complaint = data.customer_complaint || null;
            }
            if (data.notes !== undefined) {
                updateData.notes = data.notes || null;
            }
            if (data.motorcycle_id !== undefined) {
                updateData.motorcycle_id = data.motorcycle_id || null;
            }
            if (data.valid_until !== undefined) {
                updateData.valid_until = data.valid_until ? new Date(data.valid_until) : null;
            } else if (data.valid_days !== undefined && parseInt(data.valid_days, 10) > 0) {
                const v = new Date();
                v.setDate(v.getDate() + parseInt(data.valid_days, 10));
                updateData.valid_until = v;
            }
            if (data.status !== undefined) {
                const allowed = new Set(['pendiente', 'aceptada', 'rechazada', 'expirada']);
                if (!allowed.has(data.status)) {
                    return reply.status(400).send({
                        error: `status inválido. Permitidos: ${[...allowed].join(', ')}`,
                    });
                }
                updateData.status = data.status;
            }

            try {
                await prisma.$transaction(async (tx) => {
                    if (Object.keys(updateData).length > 0) {
                        await tx.quotation.update({ where: { id }, data: updateData });
                    }

                    // Reemplazo total de líneas si vienen los arrays
                    if (Array.isArray(data.labor)) {
                        await tx.quotationLabor.deleteMany({ where: { quotation_id: id } });
                        if (data.labor.length > 0) {
                            await tx.quotationLabor.createMany({
                                data: data.labor.map((l) => ({
                                    quotation_id: id,
                                    name: l.name,
                                    price: parseFloat(l.price) || 0,
                                })),
                            });
                        }
                    }
                    if (Array.isArray(data.parts)) {
                        await tx.quotationPart.deleteMany({ where: { quotation_id: id } });
                        if (data.parts.length > 0) {
                            await tx.quotationPart.createMany({
                                data: data.parts.map((p) => ({
                                    quotation_id: id,
                                    name: p.name,
                                    price: parseFloat(p.price) || 0,
                                    quantity: parseInt(p.quantity, 10) || 1,
                                    notes: p.notes || null,
                                })),
                            });
                        }
                    }
                });

                // Recalcula totales fuera de la transacción (lectura simple).
                if (Array.isArray(data.labor) || Array.isArray(data.parts)) {
                    await recalcQuotationTotals(id);
                }

                return prisma.quotation.findUnique({
                    where: { id },
                    include: QUOTATION_INCLUDE,
                });
            } catch (err) {
                request.log.error('Error updating quotation:', err);
                return reply.status(400).send({
                    error: err.message || 'Error al actualizar la cotización',
                });
            }
        });

        // DELETE /api/quotations/:id
        app.delete('/:id', async (request, reply) => {
            const { id } = request.params;
            const existing = await prisma.quotation.findUnique({ where: { id } });
            if (!existing) {
                return reply.status(404).send({ error: 'Cotización no encontrada' });
            }

            // Allow deletion even if converted: the linked Order is an
            // independent row with its own history (order_number, costs,
            // updates). Removing the quotation just drops the back-reference,
            // which is safe — the order remains intact.

            try {
                await prisma.$transaction(async (tx) => {
                    await tx.quotationLabor.deleteMany({ where: { quotation_id: id } });
                    await tx.quotationPart.deleteMany({ where: { quotation_id: id } });
                    await tx.quotation.delete({ where: { id } });
                });
                return { success: true };
            } catch (err) {
                request.log.error({ err, quotationId: id }, 'Error deleting quotation');
                return reply.status(400).send({
                    error: err.message || 'Error al eliminar la cotización',
                });
            }
        });

        // POST /api/quotations/:id/convert — convierte la cotización en Order
        app.post('/:id/convert', async (request, reply) => {
            const { id } = request.params;

            const quotation = await prisma.quotation.findUnique({
                where: { id },
                include: { labor: true, parts: true },
            });
            if (!quotation) {
                return reply.status(404).send({ error: 'Cotización no encontrada' });
            }
            // Idempotent: si ya fue convertida, devolver la orden existente
            if (quotation.converted_order_id || quotation.status === 'convertida') {
                return {
                    order_id: quotation.converted_order_id,
                    already_converted: true,
                };
            }

            // ponytail: reuse the proven MAX-based folio generation from lib/order-number.js.
            // COUNT was the root cause of P2002 collisions after row deletions.
            const folioPrefix = request.workspace?.folio_prefix || 'MP';

            const { nanoid } = await import('nanoid');

            // ELIHU: la orden nacida de una cotización aceptada debe quedar
            // "Autorizada". Buscamos ese estado (creado por migración 007 /
            // seed); si el taller no lo tiene, caemos al primer estado no
            // terminal por display_order para no romper talleres existentes.
            const initialStatus =
                (await prisma.orderStatus.findFirst({ where: { name: 'Autorizada' } })) ||
                (await prisma.orderStatus.findFirst({
                    where: { is_terminal: false },
                    orderBy: { display_order: 'asc' },
                }));

            // Retry loop: absorb P2002 races on order_number
            let result;
            let lastErr;
            for (let attempt = 0; attempt < 6; attempt++) {
                const orderNumber = await generateOrderNumber(folioPrefix);
                const publicToken = nanoid(12);
                try {
                    result = await prisma.$transaction(async (tx) => {
                        // Re-check inside tx to prevent double-conversion race
                        const fresh = await tx.quotation.findUnique({
                            where: { id },
                            select: { converted_order_id: true, status: true },
                        });
                        if (fresh?.converted_order_id || fresh?.status === 'convertida') {
                            return { order_id: fresh.converted_order_id, already_converted: true };
                        }

                        const order = await tx.order.create({
                            data: {
                                order_number: orderNumber,
                                client_id: quotation.client_id,
                                motorcycle_id: quotation.motorcycle_id,
                                mechanic_id: request.user?.id || null,
                                status_id: initialStatus?.id || null,
                                customer_complaint: quotation.customer_complaint,
                                mechanic_notes: quotation.notes,
                                labor_total: quotation.labor_total,
                                parts_total: quotation.parts_total,
                                total_amount: quotation.total_amount,
                                public_token: publicToken,
                                client_link: `/orden/${publicToken}`,
                            },
                        });

                        if (quotation.labor.length > 0) {
                            await tx.orderService.createMany({
                                data: quotation.labor.map((l) => ({
                                    order_id: order.id,
                                    name: l.name,
                                    price: l.price,
                                    cost: 0,
                                    quantity: 1,
                                })),
                            });
                        }

                        if (quotation.parts.length > 0) {
                            await tx.orderPart.createMany({
                                data: quotation.parts.map((p) => ({
                                    order_id: order.id,
                                    name: p.name,
                                    cost: p.price,
                                    price: p.price,
                                    quantity: p.quantity,
                                    notes: p.notes,
                                })),
                            });
                        }

                        await tx.orderHistory.create({
                            data: {
                                order_id: order.id,
                                changed_by: request.user?.id || null,
                                new_status: initialStatus?.name || 'Autorizada',
                                notes: `Orden creada desde cotización ${quotation.quotation_number}`,
                            },
                        });

                        await tx.quotation.update({
                            where: { id: quotation.id },
                            data: {
                                status: 'convertida',
                                converted_order_id: order.id,
                            },
                        });

                        return { order_id: order.id, order_number: order.order_number };
                    });
                    break;
                } catch (err) {
                    lastErr = err;
                    if (err.code === 'P2002' && Array.isArray(err.meta?.target)) {
                        if (err.meta.target.includes('order_number')) {
                            request.log.warn({ attempt, orderNumber }, 'order_number collision on convert, retrying');
                            continue;
                        }
                        if (err.meta.target.includes('converted_order_id')) {
                            // Another request already converted this quotation (race resolved by DB constraint)
                            const fresh = await prisma.quotation.findUnique({
                                where: { id },
                                select: { converted_order_id: true },
                            });
                            return { order_id: fresh?.converted_order_id, already_converted: true };
                        }
                    }
                    // Unknown error — don't expose Prisma internals
                    request.log.error({ err, quotationId: id }, 'Unexpected error converting quotation');
                    return reply.status(500).send({
                        error: 'Error interno al convertir la cotización. Intenta de nuevo.',
                    });
                }
            }

            if (!result) {
                request.log.error('All retries exhausted converting quotation', lastErr);
                return reply.status(500).send({
                    error: 'No se pudo generar el folio de orden. Intenta de nuevo.',
                });
            }

            return result;
        });
    });
}
