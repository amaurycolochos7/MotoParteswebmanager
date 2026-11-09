// Separación de datos por mecánico/maestro. Cada quien ve SOLO lo suyo; la excepción son los clientes y WhatsApp (compartidos).
//
//   owner / admin      todo el taller
//   maestro            lo suyo + lo de sus auxiliares directos (Profile.supervised_by = él)
//   mecánico/auxiliar  solo lo suyo
//
// "Lo suyo" = órdenes con mecánico asignado (o que él aprobó), cotizaciones que creó, citas que tiene asignadas.
// Esto se aplica en el SERVIDOR: antes la lista llegaba completa y solo algunas pantallas filtraban (Cotizaciones no).
import prisma, { workspaceContext } from './prisma.js';
import { loadActor, isAdminRole } from './permissions.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID_RE.test(String(v || ''));

/** Ids de mecánicos cuyo trabajo puede ver quien consulta. `null` = todo el taller (dueño/administrador). */
export async function visibleMechanicIds(request) {
    if (request._visibleIds !== undefined) return request._visibleIds;
    let ids;
    if (request.user?.is_super_admin === true) {
        ids = null;
    } else {
        const actor = await loadActor(request);
        if (isAdminRole(actor.role)) {
            ids = null;
        } else {
            ids = [actor.id];
            if (actor.role === 'maestro') {
                const aux = await workspaceContext.run({ workspaceId: null }, () => prisma.membership.findMany({
                    where: { workspace_id: request.workspace.id, profile: { supervised_by: actor.id } },
                    select: { profile_id: true },
                }));
                ids.push(...aux.map((a) => a.profile_id));
            }
        }
    }
    request._visibleIds = ids;
    return ids;
}

/** Filtro de Prisma para órdenes (vacío = sin restricción). Una orden también es de quien la aprobó. */
export const orderScope = (ids, userId) => (ids === null ? {} : { OR: [{ mechanic_id: { in: ids } }, { approved_by: userId }] });
/** Filtro para cotizaciones: las que creó él (o sus auxiliares). */
export const quotationScope = (ids) => (ids === null ? {} : { created_by: { in: ids } });
/** Filtro para citas: las asignadas a él (o a sus auxiliares). */
export const appointmentScope = (ids) => (ids === null ? {} : { assigned_mechanic_id: { in: ids } });

export async function canAccessOrder(request, orderId) {
    if (!isUuid(orderId)) return true; // el handler responderá 404/400 por su cuenta
    const ids = await visibleMechanicIds(request);
    if (ids === null) return true;
    const row = await prisma.order.findFirst({ where: { id: orderId, ...orderScope(ids, request.user.id) }, select: { id: true } });
    return !!row;
}

export async function canAccessQuotation(request, quotationId) {
    if (!isUuid(quotationId)) return true;
    const ids = await visibleMechanicIds(request);
    if (ids === null) return true;
    const row = await prisma.quotation.findFirst({ where: { id: quotationId, ...quotationScope(ids) }, select: { id: true } });
    return !!row;
}

export async function canAccessAppointment(request, appointmentId) {
    if (!isUuid(appointmentId)) return true;
    const ids = await visibleMechanicIds(request);
    if (ids === null) return true;
    const row = await prisma.appointment.findFirst({ where: { id: appointmentId, ...appointmentScope(ids) }, select: { id: true } });
    return !!row;
}

const notFound = (reply, what) => reply.status(404).send({ error: `${what} no encontrada.` });

/**
 * preHandler que corta con 404 (no 403: no se revela que existe) si la ruta apunta a una orden ajena.
 * `from(request)` devuelve el id de la orden (params, query o cuerpo); puede ser async.
 */
export function guardOrder(from) {
    return async function orderGuard(request, reply) {
        const id = await from(request);
        if (id && !(await canAccessOrder(request, id))) return notFound(reply, 'Orden');
        return undefined;
    };
}

export function guardQuotation(from) {
    return async function quotationGuard(request, reply) {
        const id = await from(request);
        if (id && !(await canAccessQuotation(request, id))) return notFound(reply, 'Cotización');
        return undefined;
    };
}

export function guardAppointment(from) {
    return async function appointmentGuard(request, reply) {
        const id = await from(request);
        if (id && !(await canAccessAppointment(request, id))) return notFound(reply, 'Cita');
        return undefined;
    };
}
