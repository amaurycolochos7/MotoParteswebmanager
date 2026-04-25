import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';

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
            if (existing.converted_order_id || existing.status === 'convertida') {
                return reply.status(400).send({
                    error: 'No se puede eliminar una cotización ya convertida en orden',
                });
            }

            try {
                await prisma.$transaction(async (tx) => {
                    await tx.quotationLabor.deleteMany({ where: { quotation_id: id } });
                    await tx.quotationPart.deleteMany({ where: { quotation_id: id } });
                    await tx.quotation.delete({ where: { id } });
                });
                return { success: true };
            } catch (err) {
                request.log.error('Error deleting quotation:', err);
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
            if (quotation.converted_order_id || quotation.status === 'convertida') {
                return reply.status(400).send({
                    error: 'La cotización ya fue convertida en orden',
                    order_id: quotation.converted_order_id,
                });
            }

            // Genera order_number — replica el patrón de orders.js
            const folioPrefix = request.workspace?.folio_prefix || 'MP';
            const shortYear = String(new Date().getFullYear()).slice(-2);
            const prefixYear = `${folioPrefix}-${shortYear}-`;
            const orderCount = await prisma.order.count({
                where: { order_number: { startsWith: prefixYear } },
            });
            const orderNumber = `${prefixYear}${String(orderCount + 1).padStart(3, '0')}`;

            // Public token para link cliente
            const { nanoid } = await import('nanoid');
            const publicToken = nanoid(12);

            // Status inicial (no terminal)
            const initialStatus = await prisma.orderStatus.findFirst({
                where: { is_terminal: false },
                orderBy: { display_order: 'asc' },
            });

            try {
                const result = await prisma.$transaction(async (tx) => {
                    // 1. Crea la orden
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

                    // 2. Cada QuotationLabor → OrderService (price = labor.price, cost=0, quantity=1)
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

                    // 3. Cada QuotationPart → OrderPart (cost = price ya que en cotización no separamos costo)
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

                    // 4. Historial inicial
                    await tx.orderHistory.create({
                        data: {
                            order_id: order.id,
                            changed_by: request.user?.id || null,
                            new_status: 'Registrada',
                            notes: `Orden creada desde cotización ${quotation.quotation_number}`,
                        },
                    });

                    // 5. Marca la cotización como convertida
                    await tx.quotation.update({
                        where: { id: quotation.id },
                        data: {
                            status: 'convertida',
                            converted_order_id: order.id,
                        },
                    });

                    return order;
                });

                return { order_id: result.id, order_number: result.order_number };
            } catch (err) {
                request.log.error('Error converting quotation:', err);
                return reply.status(400).send({
                    error: err.message || 'Error al convertir la cotización',
                });
            }
        });
    });
}
