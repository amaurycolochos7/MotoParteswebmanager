import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { fireEvent } from '../lib/events.js';
import { buildClientSearchWhere, matchesClient, rankScore } from '../lib/client-search.js';

export default async function clientsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // GET /api/clients
    fastify.get('/', async () => {
        return prisma.client.findMany({
            include: { motorcycles: true },
            orderBy: { created_at: 'desc' }
        });
    });

    // GET /api/clients/search?q=...  (ELIHU: buscar cliente por nombre)
    // Partial, case- AND accent-insensitive over name; also phone digits and
    // motorcycle plates. Workspace scoping is applied automatically by the
    // Prisma extension (Client is a scoped model). Returns [] for short queries.
    fastify.get('/search', async (request) => {
        const q = typeof request.query?.q === 'string' ? request.query.q : '';
        const limit = Math.min(Number(request.query?.limit) || 20, 50);

        const where = buildClientSearchWhere(q);
        if (!where) return [];

        // DB-side filter (case-insensitive, plates via relation), then refine in
        // JS for accent-insensitivity and rank so "jose" finds "José".
        const candidates = await prisma.client.findMany({
            where,
            include: {
                motorcycles: true,
                orders: {
                    select: { id: true, created_at: true, status: { select: { name: true } } },
                    orderBy: { created_at: 'desc' },
                    take: 1,
                },
            },
            take: 100,
        });

        return candidates
            .filter((c) => matchesClient(c, q))
            .sort((a, b) => rankScore(b, q) - rankScore(a, q))
            .slice(0, limit)
            .map((c) => ({
                id: c.id,
                full_name: c.full_name,
                phone: c.phone,
                email: c.email,
                motorcycles: c.motorcycles,
                last_order: c.orders[0]
                    ? { id: c.orders[0].id, created_at: c.orders[0].created_at, status: c.orders[0].status?.name || null }
                    : null,
            }));
    });

    // GET /api/clients/:id/history — historial completo del cliente para mostrar
    // ANTES de crear cotización u orden (ELIHU 5.2). Mobile-friendly summary.
    fastify.get('/:id/history', async (request, reply) => {
        const { id } = request.params;
        const client = await prisma.client.findUnique({
            where: { id },
            include: {
                motorcycles: true,
                orders: {
                    include: { status: true },
                    orderBy: { created_at: 'desc' },
                    take: 20,
                },
                quotations: { orderBy: { created_at: 'desc' }, take: 20 },
            },
        });
        if (!client) return reply.status(404).send({ error: 'Cliente no encontrado' });

        // Pending balance across orders = sum(total_amount) - sum(advance_payment)
        // for non-paid orders. (Real abono-based balance comes from OrderPayment
        // once migration 007 is applied; advance_payment is the legacy fallback.)
        const openOrders = client.orders.filter((o) => !o.is_paid);
        const pendingBalance = openOrders.reduce(
            (sum, o) => sum + (Number(o.total_amount) - Number(o.advance_payment || 0)),
            0
        );

        return {
            id: client.id,
            full_name: client.full_name,
            phone: client.phone,
            email: client.email,
            notes: client.notes,
            motorcycles: client.motorcycles,
            last_visit_at: client.orders[0]?.created_at || null,
            orders_count: client.orders.length,
            quotations_count: client.quotations.length,
            pending_balance: pendingBalance > 0 ? pendingBalance : 0,
            orders: client.orders.map((o) => ({
                id: o.id,
                order_number: o.order_number,
                status: o.status?.name || null,
                total_amount: o.total_amount,
                is_paid: o.is_paid,
                created_at: o.created_at,
            })),
            quotations: client.quotations.map((qt) => ({
                id: qt.id,
                quotation_number: qt.quotation_number,
                status: qt.status,
                total_amount: qt.total_amount,
                created_at: qt.created_at,
            })),
        };
    });

    // GET /api/clients/:id
    fastify.get('/:id', async (request, reply) => {
        const client = await prisma.client.findUnique({
            where: { id: request.params.id },
            include: { motorcycles: true, orders: { include: { status: true } } }
        });
        if (!client) return reply.status(404).send({ error: 'Cliente no encontrado' });
        return client;
    });

    // GET /api/clients/phone/:phone
    fastify.get('/phone/:phone', async (request) => {
        const phone = request.params.phone.replace(/\D/g, '');
        const client = await prisma.client.findFirst({
            where: { phone: { contains: phone } },
            include: { motorcycles: true }
        });
        return client || null;
    });

    // POST /api/clients
    fastify.post('/', async (request, reply) => {
        try {
            const data = request.body;
            const client = await prisma.client.create({
                data: {
                    phone: data.phone,
                    full_name: data.full_name,
                    email: data.email || null,
                    notes: data.notes || null,
                    created_by: request.user.id
                },
                include: { motorcycles: true }
            });
            fireEvent('client.created', {
                workspaceId: request.workspace.id,
                client_id: client.id,
            });
            return client;
        } catch (error) {
            request.log.error(error);
            if (error.code === 'P2002') {
                return reply.status(409).send({ error: 'El teléfono ya está registrado' });
            }
            return reply.status(500).send({ error: 'Error al crear cliente', details: error.message });
        }
    });

    // PUT /api/clients/:id  — editar cliente. El auxiliar NO puede editar
    // clientes salvo permiso explícito (ELIHU 14). Owner/admin/maestro sí.
    fastify.put('/:id', async (request, reply) => {
        if (!canEditClients(request)) {
            return reply.status(403).send({ error: 'No tienes permiso para editar clientes.' });
        }
        const data = { ...request.body };
        // Never let the client body rewrite ownership / scoping fields.
        delete data.id; delete data.workspace_id; delete data.created_by;
        delete data.created_at; delete data.motorcycles; delete data.orders;
        return prisma.client.update({
            where: { id: request.params.id },
            data,
            include: { motorcycles: true }
        });
    });

    // DELETE /api/clients/:id — solo owner/admin (acción destructiva, ELIHU 14).
    fastify.delete('/:id', async (request, reply) => {
        if (!['owner', 'admin'].includes(request.workspaceRole)) {
            return reply.status(403).send({ error: 'Solo el dueño o admin puede borrar clientes.' });
        }
        await prisma.client.delete({ where: { id: request.params.id } });
        return { success: true };
    });
}

// Edit permission: owner/admin/master-mechanic roles, OR an explicit
// can_edit_clients override on the membership permissions JSON.
function canEditClients(request) {
    const role = request.workspaceRole;
    if (['owner', 'admin', 'mechanic'].includes(role)) {
        // 'mechanic' here is the master role in this workspace model; auxiliaries
        // carry role 'auxiliary'. Explicit override still wins for fine control.
        if (role === 'mechanic' || role === 'owner' || role === 'admin') return true;
    }
    const perms = request.workspacePermissions || {};
    return perms.can_edit_clients === true;
}
