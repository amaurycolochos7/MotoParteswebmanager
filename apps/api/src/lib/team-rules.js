// Reglas puras (sin base de datos) para gestionar el equipo: quién puede crear/editar a quién,
// tope de comisión de auxiliares y campos permitidos. Se prueban en test/team-rules.test.js.
import { isAdminRole, PERMISSION_KEYS } from './permissions.js';

export const DEFAULT_AUX_COMMISSION_CAP = 40;

/** Tope de comisión (%) que un maestro puede dar a un auxiliar. */
export function auxCommissionCap(settings) {
    const raw = Number(settings?.aux_commission_cap);
    return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : DEFAULT_AUX_COMMISSION_CAP;
}

/** Roles que cada actor puede crear. */
export function creatableRoles(actor) {
    if (actor.role === 'owner' || actor.role === 'admin') return ['admin', 'maestro', 'mecanico', 'auxiliar'];
    if (actor.role === 'maestro') return ['auxiliar'];
    return [];
}

/** Traduce un rol de la API a los campos de BD (Membership.role + campos del Profile). */
export function roleToDb(role) {
    switch (role) {
        case 'admin':
            return { membershipRole: 'admin', profile: { role: 'admin', is_master_mechanic: false, requires_approval: false } };
        case 'maestro':
            return { membershipRole: 'mechanic', profile: { role: 'admin_mechanic', is_master_mechanic: true, requires_approval: false } };
        case 'mecanico':
            return { membershipRole: 'mechanic', profile: { role: 'mechanic', is_master_mechanic: false, requires_approval: false } };
        case 'auxiliar':
            return { membershipRole: 'auxiliary', profile: { role: 'mechanic', is_master_mechanic: false, requires_approval: true } };
        default:
            return null;
    }
}

/** Valida un porcentaje de comisión (0–100). Devuelve número o null. */
export function parseRate(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Valida la comisión de un auxiliar según quién la fija.
 * @returns {{ok:true,rate:number}|{ok:false,error:string}}
 */
export function validateAuxRate(actor, value, cap) {
    const rate = parseRate(value);
    if (rate === null) return { ok: false, error: 'La comisión debe ser un número entre 0 y 100.' };
    if (actor.role === 'maestro' && rate > cap) {
        return { ok: false, error: `El tope de comisión para auxiliares es ${cap}%.` };
    }
    return { ok: true, rate };
}

/** Normaliza permisos finos (solo claves conocidas, solo booleanos). */
export function sanitizePermissions(input) {
    const out = {};
    if (input && typeof input === 'object') {
        for (const key of PERMISSION_KEYS) {
            if (typeof input[key] === 'boolean') out[key] = input[key];
        }
    }
    return out;
}

/** Campos del Profile que se pueden editar por contexto (todo lo demás se ignora: sin asignación masiva). */
export const SELF_EDITABLE = ['full_name', 'phone', 'avatar_url', 'password'];
export const MASTER_EDITABLE_ON_AUX = ['full_name', 'phone', 'commission_percentage', 'password'];
export const ADMIN_EDITABLE = [
    'full_name', 'phone', 'avatar_url', 'password', 'email', 'commission_percentage',
    'is_master_mechanic', 'requires_approval', 'supervised_by', 'is_active',
    'can_create_services', 'can_create_appointments', 'can_send_messages', 'can_create_clients',
    'can_edit_clients', 'can_delete_orders', 'can_view_approved_orders',
];

/** Filtra `updates` dejando solo los campos permitidos. */
export function pickFields(updates, allowed) {
    const out = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(updates || {}, key)) out[key] = updates[key];
    }
    return out;
}

/**
 * ¿Qué campos puede editar `actor` del integrante `target`?
 * target: { id, role, supervised_by }
 * Devuelve la lista de campos permitidos o null si no puede editar.
 */
export function editableFieldsFor(actor, target) {
    if (isAdminRole(actor.role)) {
        if (target.role === 'owner' && actor.role !== 'owner') return null;
        return ADMIN_EDITABLE;
    }
    if (actor.role === 'maestro' && target.role === 'auxiliar' && target.supervised_by === actor.id) {
        return MASTER_EDITABLE_ON_AUX;
    }
    if (actor.id === target.id) return SELF_EDITABLE;
    return null;
}

/** Campos sensibles que NUNCA salen en listados. */
const SECRET_KEYS = new Set([
    'password_hash', 'super_2fa_secret', 'super_2fa_enabled', 'super_admin_added_at', 'super_admin_added_by',
]);
export function stripSecrets(profile) {
    const out = {};
    for (const [k, v] of Object.entries(profile || {})) if (!SECRET_KEYS.has(k)) out[k] = v;
    return out;
}
