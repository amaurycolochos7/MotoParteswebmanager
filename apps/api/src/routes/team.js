// /api/team — gestión del equipo (V2). Ver docs/CONTRATO-V2.md.
//   owner/admin: todo el taller.  maestro: él mismo y sus auxiliares (puede CREAR auxiliares con tope de comisión).
import bcrypt from 'bcryptjs';
import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import {
    loadActor, effectivePermissions, normalizeRole, isAdminRole,
} from '../lib/permissions.js';
import {
    auxCommissionCap, creatableRoles, roleToDb, parseRate, validateAuxRate, sanitizePermissions,
    editableFieldsFor, pickFields, stripSecrets,
} from '../lib/team-rules.js';

const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bad = (reply, code, error) => reply.status(code).send({ error });

/** Fila de la API a partir de membresía + perfil (+ nombre del supervisor y conteo de órdenes). */
export function toTeamItem(m, profile, { supervisorName = null, ordersCount = 0 } = {}) {
    const eff = effectivePermissions(m, profile);
    const permissions = {};
    for (const k of ['can_create_appointments', 'can_send_messages', 'can_create_clients', 'can_create_services',
        'can_edit_clients', 'can_delete_orders', 'can_view_approved_orders']) permissions[k] = eff[k];
    return {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone || null,
        role: eff.role,
        is_active: profile.is_active,
        commission_percentage: Number(profile.commission_percentage ?? 0),
        supervised_by: profile.supervised_by || null,
        supervisor_name: supervisorName,
        can_view_inbox: eff.can_view_inbox,
        online_booking_visible: m.online_booking_visible !== false,
        permissions,
        orders_count: ordersCount,
        created_at: profile.created_at,
    };
}

export default async function teamRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    async function loadMembers(workspaceId) {
        return unscoped(() => prisma.membership.findMany({
            where: { workspace_id: workspaceId },
            include: { profile: true },
            orderBy: { joined_at: 'asc' },
        }));
    }

    async function buildItems(rows) {
        const ids = rows.map((r) => r.profile.id);
        const counts = ids.length
            ? await prisma.order.groupBy({ by: ['mechanic_id'], where: { mechanic_id: { in: ids } }, _count: { _all: true } })
            : [];
        const byId = new Map(counts.map((c) => [c.mechanic_id, c._count._all]));
        const names = new Map(rows.map((r) => [r.profile.id, r.profile.full_name]));
        return rows.map((r) => toTeamItem(r, r.profile, {
            supervisorName: r.profile.supervised_by ? names.get(r.profile.supervised_by) || null : null,
            ordersCount: byId.get(r.profile.id) || 0,
        }));
    }

    async function findMember(workspaceId, id) {
        if (!UUID_RE.test(String(id || ''))) return null;
        return unscoped(() => prisma.membership.findUnique({
            where: { workspace_id_profile_id: { workspace_id: workspaceId, profile_id: id } },
            include: { profile: true },
        }));
    }

    /** Fila normalizada {id, role, supervised_by} de un integrante, para las reglas de edición. */
    const targetOf = (m) => ({
        id: m.profile.id,
        role: normalizeRole(m.role, m.profile),
        supervised_by: m.profile.supervised_by || null,
    });

    // ── GET /api/team/me — rol normalizado y permisos efectivos del usuario actual (el panel lo usa para el menú) ──
    fastify.get('/me', async (request) => {
        const actor = await loadActor(request);
        const { id, role, can_view_inbox, can_manage_team, can_create_auxiliares, can_approve_auxiliares,
            can_manage_whatsapp, can_see_whatsapp_status, can_see_money, ...rest } = actor;
        const permissions = {};
        for (const k of ['can_create_appointments', 'can_send_messages', 'can_create_clients', 'can_create_services',
            'can_edit_clients', 'can_delete_orders', 'can_view_approved_orders']) permissions[k] = rest[k];
        return {
            id, role, workspace_id: request.workspace.id,
            can_view_inbox, can_manage_team, can_create_auxiliares, can_approve_auxiliares,
            can_manage_whatsapp, can_see_whatsapp_status, can_see_money,
            permissions,
            supervised_by: actor.profile?.supervised_by || null,
            aux_commission_cap: auxCommissionCap(request.workspace.settings),
        };
    });

    // ── GET /api/team ────────────────────────────────────────────────────
    fastify.get('/', async (request, reply) => {
        const actor = await loadActor(request);
        if (!(isAdminRole(actor.role) || actor.role === 'maestro')) return bad(reply, 403, 'No tienes permiso para ver el equipo.');
        let rows = await loadMembers(request.workspace.id);
        if (actor.role === 'maestro') {
            rows = rows.filter((r) => r.profile.id === actor.id || r.profile.supervised_by === actor.id);
        }
        return buildItems(rows);
    });

    // ── Ajustes del equipo (tope de comisión de auxiliares) ─────────────
    fastify.get('/settings', async (request, reply) => {
        const actor = await loadActor(request);
        if (!(isAdminRole(actor.role) || actor.role === 'maestro')) return bad(reply, 403, 'No tienes permiso.');
        return { aux_commission_cap: auxCommissionCap(request.workspace.settings) };
    });

    fastify.put('/settings', async (request, reply) => {
        const actor = await loadActor(request);
        if (!isAdminRole(actor.role)) return bad(reply, 403, 'Solo el administrador puede cambiar los ajustes del equipo.');
        const cap = parseRate(request.body?.aux_commission_cap);
        if (cap === null) return bad(reply, 400, 'El tope debe ser un número entre 0 y 100.');
        const current = (request.workspace.settings && typeof request.workspace.settings === 'object') ? request.workspace.settings : {};
        await unscoped(() => prisma.workspace.update({
            where: { id: request.workspace.id },
            data: { settings: { ...current, aux_commission_cap: cap } },
        }));
        return { aux_commission_cap: cap };
    });

    // ── POST /api/team ───────────────────────────────────────────────────
    fastify.post('/', async (request, reply) => {
        const actor = await loadActor(request);
        const body = request.body || {};
        const allowedRoles = creatableRoles(actor);
        if (allowedRoles.length === 0) return bad(reply, 403, 'No tienes permiso para crear usuarios.');

        const fullName = String(body.full_name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        if (!fullName) return bad(reply, 400, 'El nombre es obligatorio.');
        if (!EMAIL_RE.test(email)) return bad(reply, 400, 'El correo no es válido.');
        if (password.length < 6) return bad(reply, 400, 'La contraseña debe tener al menos 6 caracteres.');

        const role = String(body.role || '');
        if (!roleToDb(role)) return bad(reply, 400, 'Rol no válido.');
        if (!allowedRoles.includes(role)) {
            return bad(reply, 403, actor.role === 'maestro'
                ? 'Como maestro solo puedes crear auxiliares.'
                : 'No puedes crear ese rol.');
        }

        const cap = auxCommissionCap(request.workspace.settings);
        let rate = parseRate(body.commission_percentage);
        if (body.commission_percentage !== undefined && body.commission_percentage !== null && body.commission_percentage !== '' && rate === null) {
            return bad(reply, 400, 'La comisión debe ser un número entre 0 y 100.');
        }
        if (rate === null) rate = role === 'auxiliar' ? Math.min(10, cap) : 10;

        let supervisedBy = null;
        if (role === 'auxiliar') {
            const check = validateAuxRate(actor, rate, cap);
            if (!check.ok) return bad(reply, 400, check.error);
            if (actor.role === 'maestro') {
                if (body.supervised_by && body.supervised_by !== actor.id) {
                    return bad(reply, 403, 'Como maestro, tus auxiliares siempre quedan a tu cargo.');
                }
                supervisedBy = actor.id;
            } else {
                if (!body.supervised_by) return bad(reply, 400, 'Elige el maestro al que reporta el auxiliar.');
                const sup = await findMember(request.workspace.id, body.supervised_by);
                if (!sup) return bad(reply, 400, 'El maestro asignado no existe en este taller.');
                const supRole = normalizeRole(sup.role, sup.profile);
                if (!(isAdminRole(supRole) || supRole === 'maestro')) return bad(reply, 400, 'El responsable del auxiliar debe ser maestro o administrador.');
                supervisedBy = sup.profile.id;
            }
        }

        const db = roleToDb(role);
        const perms = sanitizePermissions(body.permissions);
        const membershipPermissions = { ...perms };
        // Auxiliar: la bandeja se marca (o no) al crearlo. Para los demás roles el acceso lo da el rol.
        if (role === 'auxiliar' || role === 'mecanico') membershipPermissions.can_view_inbox = body.can_view_inbox === true;

        const existing = await unscoped(() => prisma.profile.findUnique({ where: { email } }));
        if (existing) {
            const already = await findMember(request.workspace.id, existing.id);
            if (already) return bad(reply, 409, 'Ese correo ya pertenece a este taller.');
            if (!isAdminRole(actor.role)) return bad(reply, 409, 'Ese correo ya está registrado. Pide al administrador que lo agregue.');
        }

        const created = await unscoped(() => prisma.$transaction(async (tx) => {
            let profile = existing;
            if (!profile) {
                profile = await tx.profile.create({
                    data: {
                        email,
                        password_hash: await bcrypt.hash(password, 10),
                        full_name: fullName,
                        phone: body.phone ? String(body.phone).trim() : null,
                        commission_percentage: rate,
                        signup_source: 'admin',
                        supervised_by: supervisedBy,
                        ...db.profile,
                        // permisos finos heredados (el override por taller vive en Membership.permissions)
                        ...pickFields(perms, Object.keys(perms)),
                    },
                });
            }
            const membership = await tx.membership.create({
                data: {
                    workspace_id: request.workspace.id,
                    profile_id: profile.id,
                    role: db.membershipRole,
                    permissions: membershipPermissions,
                    invited_by: actor.id,
                },
            });
            await tx.auditLog.create({
                data: {
                    workspace_id: request.workspace.id,
                    profile_id: actor.id,
                    event: 'user.added',
                    payload: { added_profile_id: profile.id, role, via: 'team' },
                },
            });
            return { profile, membership };
        }));

        reply.status(201);
        return toTeamItem(created.membership, created.profile, { supervisorName: null, ordersCount: 0 });
    });

    // ── PUT /api/team/:id ────────────────────────────────────────────────
    fastify.put('/:id', async (request, reply) => {
        const actor = await loadActor(request);
        const member = await findMember(request.workspace.id, request.params.id);
        if (!member) return bad(reply, 404, 'Usuario no encontrado en este taller.');
        const target = targetOf(member);
        if (target.id === actor.id && !isAdminRole(actor.role)) {
            return bad(reply, 403, 'Edita tu perfil desde "Mi perfil".');
        }
        const allowed = editableFieldsFor(actor, target);
        if (!allowed) return bad(reply, 403, 'No tienes permiso para editar a este usuario.');

        const body = request.body || {};
        const updates = pickFields(body, allowed);
        const cap = auxCommissionCap(request.workspace.settings);

        if ('commission_percentage' in updates) {
            const rate = parseRate(updates.commission_percentage);
            if (rate === null) return bad(reply, 400, 'La comisión debe ser un número entre 0 y 100.');
            if (target.role === 'auxiliar') {
                const check = validateAuxRate(actor, rate, cap);
                if (!check.ok) return bad(reply, 400, check.error);
            }
            updates.commission_percentage = rate;
        }
        if ('email' in updates) {
            const email = String(updates.email || '').trim().toLowerCase();
            if (!EMAIL_RE.test(email)) return bad(reply, 400, 'El correo no es válido.');
            updates.email = email;
        }
        if ('password' in updates) {
            if (String(updates.password || '').length < 6) return bad(reply, 400, 'La contraseña debe tener al menos 6 caracteres.');
            updates.password_hash = await bcrypt.hash(String(updates.password), 10);
            delete updates.password;
        }

        // Cambio de rol: solo admin/owner (y nunca tocar al owner salvo otro owner).
        let newMembershipRole = null;
        if (body.role !== undefined && body.role !== target.role) {
            if (!isAdminRole(actor.role)) return bad(reply, 403, 'Solo el administrador puede cambiar roles.');
            if (target.role === 'owner') return bad(reply, 403, 'No se puede cambiar el rol del dueño.');
            const db = roleToDb(String(body.role));
            if (!db) return bad(reply, 400, 'Rol no válido.');
            newMembershipRole = db.membershipRole;
            Object.assign(updates, db.profile);
            if (body.role !== 'auxiliar') updates.supervised_by = null;
        }

        // Supervisor del auxiliar (solo admin; el maestro no reasigna).
        if ('supervised_by' in updates || newMembershipRole === 'auxiliary') {
            const finalRole = body.role || target.role;
            if (finalRole === 'auxiliar') {
                const supId = updates.supervised_by || member.profile.supervised_by;
                if (!supId) return bad(reply, 400, 'Elige el maestro al que reporta el auxiliar.');
                const sup = await findMember(request.workspace.id, supId);
                if (!sup) return bad(reply, 400, 'El maestro asignado no existe en este taller.');
                updates.supervised_by = sup.profile.id;
            } else {
                updates.supervised_by = null;
            }
        }
        if (newMembershipRole === 'auxiliary' && !('commission_percentage' in updates)) {
            // pasa a auxiliar con su % actual: respeta el tope si lo fija un maestro (no aplica a admin)
        }

        // Permisos del taller (Membership.permissions): can_view_inbox + permisos finos.
        let membershipPermissions = null;
        if (body.can_view_inbox !== undefined || body.permissions !== undefined) {
            if (!(isAdminRole(actor.role) || (actor.role === 'maestro' && target.role === 'auxiliar'))) {
                return bad(reply, 403, 'No tienes permiso para cambiar los permisos.');
            }
            const current = (member.permissions && typeof member.permissions === 'object') ? member.permissions : {};
            membershipPermissions = { ...current, ...sanitizePermissions(body.permissions) };
            if (typeof body.can_view_inbox === 'boolean') membershipPermissions.can_view_inbox = body.can_view_inbox;
        }

        await unscoped(() => prisma.$transaction(async (tx) => {
            if (Object.keys(updates).length > 0) await tx.profile.update({ where: { id: target.id }, data: updates });
            const mData = {};
            if (newMembershipRole) mData.role = newMembershipRole;
            if (membershipPermissions) mData.permissions = membershipPermissions;
            if (Object.keys(mData).length > 0) await tx.membership.update({ where: { id: member.id }, data: mData });
            await tx.auditLog.create({
                data: {
                    workspace_id: request.workspace.id, profile_id: actor.id, event: 'user.updated',
                    payload: { profile_id: target.id, fields: Object.keys(updates).filter((k) => k !== 'password_hash'), role: newMembershipRole },
                },
            });
        }));

        const fresh = await findMember(request.workspace.id, target.id);
        const [item] = await buildItems([fresh]);
        return item;
    });

    // ── PATCH /api/team/:id/active { active } ────────────────────────────
    fastify.patch('/:id/active', async (request, reply) => {
        const actor = await loadActor(request);
        const member = await findMember(request.workspace.id, request.params.id);
        if (!member) return bad(reply, 404, 'Usuario no encontrado en este taller.');
        const target = targetOf(member);
        if (target.id === actor.id) return bad(reply, 400, 'No puedes desactivarte a ti mismo.');
        const allowed = editableFieldsFor(actor, target);
        if (!allowed || !(isAdminRole(actor.role) || (actor.role === 'maestro' && target.role === 'auxiliar'))) {
            return bad(reply, 403, 'No tienes permiso para esta acción.');
        }
        if (typeof request.body?.active !== 'boolean') return bad(reply, 400, 'active debe ser true o false.');
        if (target.role === 'owner' && request.body.active === false) return bad(reply, 400, 'No se puede desactivar al dueño.');
        const updated = await unscoped(() => prisma.profile.update({ where: { id: target.id }, data: { is_active: request.body.active } }));
        return { id: updated.id, is_active: updated.is_active };
    });

    // ── DELETE /api/team/:id — quita del taller ──────────────────────────
    fastify.delete('/:id', async (request, reply) => {
        const actor = await loadActor(request);
        const member = await findMember(request.workspace.id, request.params.id);
        if (!member) return bad(reply, 404, 'Usuario no encontrado en este taller.');
        const target = targetOf(member);
        if (target.id === actor.id) return bad(reply, 400, 'No puedes eliminarte a ti mismo.');
        const allowed = editableFieldsFor(actor, target);
        if (!allowed || !(isAdminRole(actor.role) || (actor.role === 'maestro' && target.role === 'auxiliar'))) {
            return bad(reply, 403, 'No tienes permiso para eliminar a este usuario.');
        }
        const result = await unscoped(() => prisma.$transaction(async (tx) => {
            if (member.role === 'owner') {
                const owners = await tx.membership.count({ where: { workspace_id: request.workspace.id, role: 'owner' } });
                if (owners <= 1) return { lastOwner: true };
            }
            await tx.membership.delete({ where: { id: member.id } });
            const remaining = await tx.membership.count({ where: { profile_id: target.id } });
            if (remaining === 0) await tx.profile.update({ where: { id: target.id }, data: { is_active: false } });
            // Sus auxiliares quedan sin responsable: se avisa en la respuesta (el admin los reasigna).
            const orphans = await tx.profile.count({ where: { supervised_by: target.id } });
            await tx.auditLog.create({
                data: {
                    workspace_id: request.workspace.id, profile_id: actor.id, event: 'user.removed',
                    payload: { removed_profile_id: target.id, deactivated: remaining === 0, via: 'team' },
                },
            });
            return { success: true, deactivated: remaining === 0, orphan_auxiliaries: orphans };
        }));
        if (result.lastOwner) return bad(reply, 400, 'No puedes eliminar al último propietario.');
        return result;
    });

    // ── DELETE /api/team/:id/permanent — solo owner ──────────────────────
    fastify.delete('/:id/permanent', async (request, reply) => {
        const actor = await loadActor(request);
        if (actor.role !== 'owner') return bad(reply, 403, 'Solo el propietario puede eliminar definitivamente.');
        const member = await findMember(request.workspace.id, request.params.id);
        if (!member) return bad(reply, 404, 'Usuario no encontrado en este taller.');
        const id = member.profile.id;
        if (id === actor.id) return bad(reply, 400, 'No puedes eliminarte a ti mismo.');

        const result = await unscoped(() => prisma.$transaction(async (tx) => {
            const memCount = await tx.membership.count({ where: { profile_id: id } });
            if (memCount > 1) return { multi: true };
            if (member.role === 'owner') {
                const owners = await tx.membership.count({ where: { workspace_id: request.workspace.id, role: 'owner' } });
                if (owners <= 1) return { lastOwner: true };
            }
            await tx.mechanicEarning.deleteMany({ where: { mechanic_id: id } });
            await tx.orderRequest.deleteMany({ where: { OR: [{ requested_by: id }, { requested_to: id }] } });
            await tx.paymentRequest.deleteMany({ where: { OR: [{ master_id: id }, { auxiliary_id: id }] } });
            await tx.whatsappSession.deleteMany({ where: { mechanic_id: id } });
            await tx.order.updateMany({ where: { mechanic_id: id }, data: { mechanic_id: null } });
            await tx.profile.updateMany({ where: { supervised_by: id }, data: { supervised_by: null } });
            await tx.membership.deleteMany({ where: { profile_id: id } });
            await tx.profile.delete({ where: { id } });
            return { success: true };
        }));
        if (result.multi) return bad(reply, 409, 'Ese usuario pertenece a otros talleres; solo puedes quitarlo del tuyo.');
        if (result.lastOwner) return bad(reply, 400, 'No puedes eliminar al último propietario.');
        return result;
    });
}
