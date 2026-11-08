import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { fireEvent } from '../lib/events.js';
import { buildClientSearchWhere, matchesClient, rankScore, digitsOnly } from '../lib/client-search.js';
import { toLocal10, phoneVariants } from '../lib/phone.js';
import { buildLookupWhere, isPhoneQuery } from '../lib/client-lookup.js';

const MECHANIC_SELECT = { id: true, full_name: true };

/**
 * Devuelve un mensaje de error si `profileId` no es miembro del taller activo;
 * null si esta bien (o si no se pidio mecanico preferido).
 * Membership no es un modelo "scoped", por eso se filtra por workspace a mano.
 */
async function preferredMechanicError(workspaceId, profileId) {
    if (profileId === undefined || profileId === null || profileId === '') return null;
    const m = await prisma.membership.findUnique({
        where: { workspace_id_profile_id: { workspace_id: workspaceId, profile_id: String(profileId) } },
        select: { id: true },
    }).catch(() => null);
    return m ? null : 'El mecánico preferido no pertenece a este taller.';
}

export default async function clientsRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // GET /api/clients   (?web_unconfirmed=1 -> solo clientes de cita web por confirmar)
    fastify.get('/', async (request) => {
        const where = {};
        if (request.query?.web_unconfirmed === '1') where.web_unconfirmed = true;
        return prisma.client.findMany({
            where,
            include: { motorcycles: true, preferred_mechanic: { select: MECHANIC_SELECT } },
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

    // GET /api/clients/lookup?q=...  — "Buscar cliente" del panel.
    // q con 3+ digitos (telefono completo o los ultimos 4) o 3+ letras (nombre / placas / marca).
    // Devuelve clientes con sus motos y, por moto, cuantos servicios se le han terminado.
    // Una sola tanda de consultas (sin N+1): clientes -> 2 groupBy de ordenes.
    fastify.get('/lookup', async (request) => {
        const q = typeof request.query?.q === 'string' ? request.query.q.trim() : '';
        const where = buildLookupWhere(q);
        if (!where) return [];

        const candidates = await prisma.client.findMany({
            where,
            include: {
                motorcycles: { orderBy: { created_at: 'asc' } },
                preferred_mechanic: { select: MECHANIC_SELECT },
                orders: {
                    select: { id: true, order_number: true, created_at: true, status: { select: { name: true } } },
                    orderBy: { created_at: 'desc' },
                    take: 1,
                },
            },
            orderBy: { updated_at: 'desc' },
            take: 60,
        });

        // Refinar en JS (sin acentos) y ordenar por relevancia. En busquedas por telefono
        // matchesClient ya compara solo digitos.
        const ranked = candidates
            .filter((c) => (isPhoneQuery(q) ? digitsOnly(c.phone).includes(digitsOnly(q)) : matchesClient(c, q)))
            .sort((a, b) => rankScore(b, q) - rankScore(a, q))
            .slice(0, 20);

        const motoIds = ranked.flatMap((c) => c.motorcycles.map((m) => m.id));
        const done = new Map();   // moto_id -> { count, last }
        const open = new Map();   // moto_id -> ordenes abiertas (no terminales)
        if (motoIds.length > 0) {
            const [doneRows, openRows] = await Promise.all([
                prisma.order.groupBy({
                    by: ['motorcycle_id'],
                    where: {
                        motorcycle_id: { in: motoIds },
                        status: { is_terminal: true, NOT: { name: { contains: 'cancel', mode: 'insensitive' } } },
                    },
                    _count: { _all: true },
                    _max: { completed_at: true, created_at: true },
                }),
                prisma.order.groupBy({
                    by: ['motorcycle_id'],
                    where: { motorcycle_id: { in: motoIds }, OR: [{ status_id: null }, { status: { is_terminal: false } }] },
                    _count: { _all: true },
                }),
            ]);
            doneRows.forEach((r) => done.set(r.motorcycle_id, {
                count: r._count._all,
                last: r._max.completed_at || r._max.created_at,
            }));
            openRows.forEach((r) => open.set(r.motorcycle_id, r._count._all));
        }

        return ranked.map((c) => {
            const motorcycles = c.motorcycles.map((m) => {
                const d = done.get(m.id);
                return {
                    id: m.id, brand: m.brand, model: m.model, year: m.year, plates: m.plates, color: m.color,
                    services_count: d?.count || 0,
                    last_service_at: d?.last || null,
                    open_orders: open.get(m.id) || 0,
                };
            });
            return {
                id: c.id,
                full_name: c.full_name,
                phone: c.phone,
                email: c.email,
                notes: c.notes,
                origin: c.origin,
                web_unconfirmed: c.web_unconfirmed,
                preferred_mechanic_id: c.preferred_mechanic_id,
                preferred_mechanic: c.preferred_mechanic || null,
                services_count: motorcycles.reduce((s, m) => s + m.services_count, 0),
                motorcycles,
                last_order: c.orders[0]
                    ? { id: c.orders[0].id, order_number: c.orders[0].order_number, created_at: c.orders[0].created_at, status: c.orders[0].status?.name || null }
                    : null,
            };
        });
    });

    // GET /api/clients/:id/history — historial completo del cliente para mostrar
    // ANTES de crear cotización u orden (ELIHU 5.2). Mobile-friendly summary.
    fastify.get('/:id/history', async (request, reply) => {
        const { id } = request.params;
        const client = await prisma.client.findUnique({
            where: { id },
            include: {
                motorcycles: true,
                preferred_mechanic: { select: MECHANIC_SELECT },
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
            origin: client.origin,
            web_unconfirmed: client.web_unconfirmed,
            preferred_mechanic_id: client.preferred_mechanic_id,
            preferred_mechanic: client.preferred_mechanic || null,
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
            include: {
                motorcycles: true,
                orders: { include: { status: true } },
                preferred_mechanic: { select: MECHANIC_SELECT },
            }
        });
        if (!client) return reply.status(404).send({ error: 'Cliente no encontrado' });
        return client;
    });

    // GET /api/clients/phone/:phone  (acepta 10 digitos o con lada 52/521/+52)
    fastify.get('/phone/:phone', async (request) => {
        const variants = phoneVariants(request.params.phone);
        if (variants.length === 0) return null;
        const client = await prisma.client.findFirst({
            where: { phone: { in: variants } },
            include: { motorcycles: true, preferred_mechanic: { select: MECHANIC_SELECT } }
        });
        return client || null;
    });

    // POST /api/clients
    fastify.post('/', async (request, reply) => {
        try {
            const data = request.body || {};
            const mechErr = await preferredMechanicError(request.workspace.id, data.preferred_mechanic_id);
            if (mechErr) return reply.status(400).send({ error: mechErr });

            // Telefono guardado siempre en 10 digitos cuando es valido.
            const phone = toLocal10(data.phone) || String(data.phone ?? '').trim();
            const variants = phoneVariants(data.phone);
            if (variants.length > 0) {
                const dup = await prisma.client.findFirst({ where: { phone: { in: variants } }, select: { id: true } });
                if (dup) return reply.status(409).send({ error: 'El teléfono ya está registrado' });
            }

            const client = await prisma.client.create({
                data: {
                    phone,
                    full_name: data.full_name,
                    email: data.email || null,
                    notes: data.notes || null,
                    created_by: request.user.id,
                    preferred_mechanic_id: data.preferred_mechanic_id || null,
                },
                include: { motorcycles: true, preferred_mechanic: { select: MECHANIC_SELECT } }
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
        delete data.preferred_mechanic; delete data.origin; delete data.workspace; delete data.creator;

        if ('preferred_mechanic_id' in data) {
            const mechErr = await preferredMechanicError(request.workspace.id, data.preferred_mechanic_id);
            if (mechErr) return reply.status(400).send({ error: mechErr });
            data.preferred_mechanic_id = data.preferred_mechanic_id || null;
        }

        if ('phone' in data) {
            const variants = phoneVariants(data.phone);
            if (variants.length === 0) return reply.status(400).send({ error: 'Teléfono inválido.' });
            const dup = await prisma.client.findFirst({
                where: { phone: { in: variants }, id: { not: request.params.id } },
                select: { id: true },
            });
            if (dup) return reply.status(409).send({ error: 'El teléfono ya está registrado' });
            data.phone = toLocal10(data.phone) || String(data.phone).trim();
        }

        try {
            return await prisma.client.update({
                where: { id: request.params.id },
                data,
                include: { motorcycles: true, preferred_mechanic: { select: MECHANIC_SELECT } }
            });
        } catch (error) {
            if (error.code === 'P2002') return reply.status(409).send({ error: 'El teléfono ya está registrado' });
            if (error.code === 'P2025') return reply.status(404).send({ error: 'Cliente no encontrado' });
            throw error;
        }
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
