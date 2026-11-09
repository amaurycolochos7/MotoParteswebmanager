// Chats por maestro (CRM de WhatsApp). Cada conversación puede estar "a cargo" de un maestro (WaConversation.assigned_to).
//
// Se asigna sola, en este orden de prioridad (la primera regla que aplique gana):
//   1) a mano (assigned_manually): nunca se toca;
//   2) el mecánico de la orden ABIERTA del cliente;
//   3) el mecánico de su próxima cita;
//   4) quien respondió el chat desde el panel por última vez;
//   5) el mecánico de su última orden (ya cerrada);
//   6) el mecánico preferido del cliente.
// Si el responsable es un auxiliar, el chat queda a cargo de SU maestro (supervised_by).
// Las funciones reciben SIEMPRE el workspaceId y no dependen del auto-scope (se pueden llamar fuera de una petición).
import prisma, { workspaceContext } from './prisma.js';
import { normalizeRole, isAdminRole } from './permissions.js';

const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);
const LIVE_APPT = ['scheduled', 'pending_external', 'confirmed', 'proposal_sent'];

/** Integrantes del taller indexados por id, con rol normalizado. */
export async function loadMembers(workspaceId) {
    const rows = await unscoped(() => prisma.membership.findMany({
        where: { workspace_id: workspaceId },
        select: {
            role: true,
            profile: { select: { id: true, full_name: true, avatar_url: true, is_master_mechanic: true, requires_approval: true, supervised_by: true, role: true, is_active: true } },
        },
    }));
    const map = new Map();
    for (const r of rows) {
        if (!r.profile) continue;
        map.set(r.profile.id, { ...r.profile, role: normalizeRole(r.role, r.profile) });
    }
    return map;
}

/** El auxiliar responde por su maestro; cualquier otro, por sí mismo. null si no es integrante del taller. */
export function masterOf(members, profileId) {
    const m = members.get(profileId);
    if (!m) return null;
    if (m.role === 'auxiliar' && m.supervised_by && members.has(m.supervised_by)) return m.supervised_by;
    return profileId;
}

/** Ids cuyos chats ve alguien en "Mis chats" (un auxiliar ve los de su maestro). */
export function ownIdsOf(actor) {
    if (actor.role === 'auxiliar') return actor.profile?.supervised_by ? [actor.profile.supervised_by] : [actor.id];
    return [actor.id];
}

/**
 * Decide el responsable de una conversación a partir de datos ya consultados (puro, se prueba sin BD).
 * @param {{openOrder?, appointment?, lastReply?, lastOrder?, preferred?}} hints  ids de Profile (o null)
 */
export function pickAssignee(hints, members) {
    const order = [hints.openOrder, hints.appointment, hints.lastReply, hints.lastOrder, hints.preferred];
    for (const id of order) {
        if (!id) continue;
        const master = masterOf(members, id);
        if (master) return master;
    }
    return null;
}

/**
 * Recalcula el responsable de las conversaciones visibles que no se asignaron a mano. Devuelve cuántas cambiaron.
 * Idempotente y barato (unas cuantas consultas por lote); se llama al listar, con un tope de frecuencia.
 */
export async function syncAssignments(workspaceId, { max = 2000 } = {}) {
    const members = await loadMembers(workspaceId);
    if (!members.size) return 0;
    const convs = await unscoped(() => prisma.waConversation.findMany({
        where: { workspace_id: workspaceId, hidden: false, assigned_manually: false },
        orderBy: { last_message_at: { sort: 'desc', nulls: 'last' } },
        take: max,
        select: { id: true, client_id: true, assigned_to: true },
    }));
    if (!convs.length) return 0;

    const clientIds = [...new Set(convs.map((c) => c.client_id).filter(Boolean))];
    const convIds = convs.map((c) => c.id);
    const [clients, orders, appts, replies] = await Promise.all([
        clientIds.length ? unscoped(() => prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, preferred_mechanic_id: true } })) : [],
        clientIds.length ? unscoped(() => prisma.order.findMany({
            where: { workspace_id: workspaceId, client_id: { in: clientIds }, mechanic_id: { not: null } },
            orderBy: { created_at: 'desc' }, take: 5000,
            select: { client_id: true, mechanic_id: true, status: { select: { is_terminal: true } } },
        })) : [],
        clientIds.length ? unscoped(() => prisma.appointment.findMany({
            where: { workspace_id: workspaceId, client_id: { in: clientIds }, assigned_mechanic_id: { not: null }, scheduled_date: { gte: new Date() }, status: { in: LIVE_APPT } },
            orderBy: { scheduled_date: 'asc' }, take: 5000,
            select: { client_id: true, assigned_mechanic_id: true },
        })) : [],
        unscoped(() => prisma.waMessage.findMany({
            where: { workspace_id: workspaceId, conversation_id: { in: convIds }, origin: 'panel', sent_by: { not: null } },
            orderBy: { created_at: 'desc' }, take: 8000,
            select: { conversation_id: true, sent_by: true },
        })),
    ]);

    const preferred = new Map(clients.map((c) => [c.id, c.preferred_mechanic_id]));
    const openOrder = new Map(); const lastOrder = new Map(); const appt = new Map(); const reply = new Map();
    for (const o of orders) { // ya vienen de la más reciente a la más antigua
        if (!lastOrder.has(o.client_id)) lastOrder.set(o.client_id, o.mechanic_id);
        if (!openOrder.has(o.client_id) && o.status && o.status.is_terminal === false) openOrder.set(o.client_id, o.mechanic_id);
    }
    for (const a of appts) if (!appt.has(a.client_id)) appt.set(a.client_id, a.assigned_mechanic_id);
    for (const r of replies) {
        // Un dueño/administrador que contesta no "se queda" con el chat; los demás sí.
        const who = members.get(r.sent_by);
        if (!who || isAdminRole(who.role)) continue;
        if (!reply.has(r.conversation_id)) reply.set(r.conversation_id, r.sent_by);
    }

    const byTarget = new Map(); // assignee|'' -> [conv ids]
    for (const c of convs) {
        const next = pickAssignee({
            openOrder: c.client_id ? openOrder.get(c.client_id) : null,
            appointment: c.client_id ? appt.get(c.client_id) : null,
            lastReply: reply.get(c.id),
            lastOrder: c.client_id ? lastOrder.get(c.client_id) : null,
            preferred: c.client_id ? preferred.get(c.client_id) : null,
        }, members);
        if ((next || null) === (c.assigned_to || null)) continue;
        const key = next || '';
        if (!byTarget.has(key)) byTarget.set(key, []);
        byTarget.get(key).push(c.id);
    }
    let changed = 0;
    for (const [key, ids] of byTarget) {
        const r = await unscoped(() => prisma.waConversation.updateMany({ where: { id: { in: ids } }, data: { assigned_to: key || null } }));
        changed += r.count;
    }
    return changed;
}

const lastRun = new Map(); // workspaceId -> ms
const inFlight = new Map(); // workspaceId -> Promise
/** Como syncAssignments pero a lo más una vez por `everyMs` por taller (la lista de chats la llama en cada consulta). */
export async function ensureFreshAssignments(workspaceId, everyMs = 45_000) {
    if (Date.now() - (lastRun.get(workspaceId) || 0) < everyMs) return inFlight.get(workspaceId) || null;
    lastRun.set(workspaceId, Date.now());
    const p = syncAssignments(workspaceId).catch((e) => { console.error('[wa-assign]', e.message); return 0; }).finally(() => inFlight.delete(workspaceId));
    inFlight.set(workspaceId, p);
    return p;
}
export function resetAssignmentThrottle() { lastRun.clear(); }

/**
 * Quien contesta un chat sin responsable se lo queda (salvo dueño/administrador). Devuelve el id asignado o null.
 * `actor` es el de loadActor (id, role, profile).
 */
export async function claimByReply(workspaceId, conv, actor) {
    if (!conv || conv.assigned_to || conv.assigned_manually) return conv?.assigned_to || null;
    if (!actor || isAdminRole(actor.role)) return null;
    const members = await loadMembers(workspaceId);
    const master = masterOf(members, actor.id);
    if (!master) return null;
    await unscoped(() => prisma.waConversation.update({ where: { id: conv.id }, data: { assigned_to: master } }));
    return master;
}

/**
 * Secciones de la bandeja con sus contadores: { all, none, masters:[{id, full_name, avatar_url, total, unread}] }.
 * Los maestros del taller aparecen siempre (aunque no tengan chats); otros integrantes, solo si tienen alguno.
 */
export async function getSections(workspaceId) {
    const members = await loadMembers(workspaceId);
    const groups = await unscoped(() => prisma.waConversation.groupBy({
        by: ['assigned_to'], where: { workspace_id: workspaceId, hidden: false },
        _count: { _all: true }, _sum: { unread_count: true },
    }));
    const stat = new Map(groups.map((g) => [g.assigned_to || '', { total: g._count._all, unread: g._sum.unread_count || 0 }]));
    const zero = { total: 0, unread: 0 };
    const masters = [];
    for (const m of members.values()) {
        const s = stat.get(m.id) || zero;
        if (m.role !== 'maestro' && s.total === 0) continue;
        masters.push({ id: m.id, full_name: m.full_name, avatar_url: m.avatar_url || null, role: m.role, ...s });
    }
    masters.sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));
    const all = [...stat.values()].reduce((a, s) => ({ total: a.total + s.total, unread: a.unread + s.unread }), { total: 0, unread: 0 });
    return { all, none: stat.get('') || zero, masters };
}
