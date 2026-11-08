// Roles normalizados y permisos efectivos (V2). ÚNICA fuente de verdad de "quién puede qué".
//
// Roles de la API:  owner | admin | maestro | mecanico | auxiliar
//   owner      Membership.role = owner
//   admin      Membership.role = admin
//   maestro    Membership.role = mechanic  y  Profile.is_master_mechanic (o Profile.role = admin_mechanic)
//   mecanico   Membership.role = mechanic  (sin ser maestro ni requerir aprobación)
//   auxiliar   Membership.role = auxiliary  o  Profile.requires_approval = true
//
// Los permisos finos viven en Profile (booleanos heredados) y se sobrescriben por taller con
// Membership.permissions (JSON). `can_view_inbox` solo vive en Membership.permissions.
import prisma, { workspaceContext } from './prisma.js';

export const ROLES = ['owner', 'admin', 'maestro', 'mecanico', 'auxiliar'];

export const PERMISSION_KEYS = [
    'can_create_appointments',
    'can_send_messages',
    'can_create_clients',
    'can_create_services',
    'can_edit_clients',
    'can_delete_orders',
    'can_view_approved_orders',
];

// Valores por defecto de los permisos finos (los mismos que usa el alta de usuarios hoy).
export const PERMISSION_DEFAULTS = {
    can_create_appointments: true,
    can_send_messages: true,
    can_create_clients: true,
    can_create_services: false,
    can_edit_clients: false,
    can_delete_orders: false,
    can_view_approved_orders: true,
};

/** Rol normalizado a partir de la membresía del taller y el perfil. */
export function normalizeRole(membershipRole, profile = {}) {
    if (membershipRole === 'owner') return 'owner';
    if (membershipRole === 'admin') return 'admin';
    if (membershipRole === 'auxiliary' || profile.requires_approval === true) return 'auxiliar';
    if (profile.is_master_mechanic === true || profile.role === 'admin_mechanic') return 'maestro';
    return 'mecanico';
}

/** ¿Es un rol de gestión total (dueño / administrador)? */
export const isAdminRole = (role) => role === 'owner' || role === 'admin';

/**
 * Permisos efectivos de un integrante.
 * @param {{role?: string, permissions?: object}} membership
 * @param {object} profile  Profile (can_*, is_master_mechanic, requires_approval, role)
 */
export function effectivePermissions(membership = {}, profile = {}) {
    const role = normalizeRole(membership.role, profile);
    const override = (membership.permissions && typeof membership.permissions === 'object') ? membership.permissions : {};

    const perms = {};
    for (const key of PERMISSION_KEYS) {
        if (isAdminRole(role)) { perms[key] = true; continue; }
        if (typeof override[key] === 'boolean') perms[key] = override[key];
        else if (typeof profile[key] === 'boolean') perms[key] = profile[key];
        else perms[key] = PERMISSION_DEFAULTS[key];
    }

    const canViewInbox = isAdminRole(role) || role === 'maestro' || override.can_view_inbox === true;
    return {
        role,
        ...perms,
        can_view_inbox: canViewInbox,
        can_manage_team: isAdminRole(role),
        can_create_auxiliares: isAdminRole(role) || role === 'maestro',
        can_approve_auxiliares: isAdminRole(role) || role === 'maestro',
        can_manage_whatsapp: isAdminRole(role),
        can_see_whatsapp_status: isAdminRole(role) || role === 'maestro',
        can_see_money: isAdminRole(role) || role === 'maestro',
    };
}

/**
 * Carga (una vez por petición) el "actor": rol normalizado + permisos efectivos.
 * Requiere haber pasado por authenticate + resolveWorkspace.
 */
export async function loadActor(request) {
    if (request._actor) return request._actor;
    const profile = await workspaceContext.run({ workspaceId: null }, () =>
        prisma.profile.findUnique({ where: { id: request.user.id } })
    );
    const membership = { role: request.workspaceRole, permissions: request.workspacePermissions || {} };
    const perms = effectivePermissions(membership, profile || {});
    request._actor = { id: request.user.id, profile: profile || {}, ...perms };
    return request._actor;
}

/**
 * preHandler: exige que el rol normalizado esté en la lista.
 *   { preHandler: [authenticate, resolveWorkspace, requireRoles('owner','admin')] }
 * Los super admins pasan siempre.
 */
export function requireRoles(...allowed) {
    return async function (request, reply) {
        if (request.user?.is_super_admin === true) return;
        const actor = await loadActor(request);
        if (!allowed.includes(actor.role)) {
            return reply.status(403).send({ error: 'No tienes permiso para esta acción.' });
        }
    };
}

/** preHandler: exige un permiso efectivo (p. ej. 'can_view_inbox'). */
export function requirePermission(key) {
    return async function (request, reply) {
        if (request.user?.is_super_admin === true) return;
        const actor = await loadActor(request);
        if (!actor[key]) {
            return reply.status(403).send({ error: 'No tienes permiso para esta acción.' });
        }
    };
}

/**
 * ¿El actor puede VER/operar datos de otro integrante del taller (comisiones, etc.)?
 *  - owner/admin: cualquiera del taller.
 *  - maestro: él mismo y sus auxiliares directos.
 *  - mecánico/auxiliar: solo él mismo.
 * `workspaceId` evita que se consulte a alguien de otro taller.
 */
export async function canAccessMechanic(actor, targetId, workspaceId) {
    if (!targetId) return false;
    if (targetId === actor.id) return true;
    if (!(isAdminRole(actor.role) || actor.role === 'maestro')) return false;
    const target = await workspaceContext.run({ workspaceId: null }, async () => {
        const membership = await prisma.membership.findUnique({
            where: { workspace_id_profile_id: { workspace_id: workspaceId, profile_id: targetId } },
            select: { profile: { select: { id: true, supervised_by: true } } },
        });
        return membership?.profile || null;
    });
    if (!target) return false;
    if (isAdminRole(actor.role)) return true;
    return target.supervised_by === actor.id;
}

/**
 * ¿El actor puede gestionar al integrante `target`?
 *  - owner/admin: a todos (el owner solo lo gestiona otro owner).
 *  - maestro: solo a sus auxiliares directos (supervised_by = él).
 */
export function canManageMember(actor, target) {
    if (!actor || !target) return false;
    if (isAdminRole(actor.role)) {
        if (target.role === 'owner' && actor.role !== 'owner') return false;
        return true;
    }
    if (actor.role === 'maestro') {
        return target.role === 'auxiliar' && target.supervised_by === actor.id;
    }
    return false;
}
