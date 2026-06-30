// =============================================
// EVIDENCIAS DEL SERVICIO — lógica pura (sin DB)
// =============================================
// Toda la lógica de permisos / transformaciones del módulo "Evidencias del
// servicio" vive aquí como funciones puras para poder probarla con el runner
// nativo de Node (node --test) SIN levantar Postgres ni Fastify, igual que
// lib/payments.js. Las rutas (routes/evidences.js) sólo orquestan I/O.
//
// Reutilizamos la tabla OrderPhoto: una fila es "evidencia" cuando tiene
// evidence_type != null. `caption` guarda la nota opcional. La eliminación es
// soft (deleted_at + deleted_by); nunca borrado físico.

export const PHOTO_RETENTION_DAYS = Number(process.env.PHOTO_RETENTION_DAYS) || 30;

// Tipos requeridos por ELIHU. El orden define el orden de despliegue.
export const EVIDENCE_TYPES = ['pieza_danada', 'pieza_nueva', 'despues_trabajo'];

export const EVIDENCE_TYPE_LABELS = {
    pieza_danada: 'Pieza dañada',
    pieza_nueva: 'Pieza nueva',
    despues_trabajo: 'Después del trabajo',
};

export function evidenceTypeLabel(type) {
    return EVIDENCE_TYPE_LABELS[type] || 'Evidencia';
}

// Devuelve el tipo si es válido, null si no. Sirve como validación de entrada.
export function normalizeEvidenceType(type) {
    return EVIDENCE_TYPES.includes(type) ? type : null;
}

// ─────────────────────────────────────────────────────────────────────────
// ROLES / PERMISOS
// ─────────────────────────────────────────────────────────────────────────
// El JWT sólo trae el rol global; el rol de membership (owner|admin|mechanic|
// auxiliary) viene de resolveWorkspace, y las banderas maestro/auxiliar viven
// en Profile (is_master_mechanic / requires_approval). Combinamos ambas
// señales para clasificar al actor en uno de tres niveles.
//
//   master    -> mecánico maestro / dueño / admin
//   mechanic  -> mecánico normal
//   auxiliary -> auxiliar (el más restringido)
export function resolveEvidenceRole({ workspaceRole, profile } = {}) {
    const p = profile || {};
    const isMaster =
        ['owner', 'admin'].includes(workspaceRole) ||
        p.is_master_mechanic === true ||
        p.role === 'admin_mechanic' ||
        p.role === 'admin';
    if (isMaster) return 'master';

    const isAuxiliary = workspaceRole === 'auxiliary' || p.requires_approval === true;
    if (isAuxiliary) return 'auxiliary';

    return 'mechanic';
}

// Regla 1: maestro y mecánico normal pueden subir. Auxiliar NO.
export function canUploadEvidence(role) {
    return role === 'master' || role === 'mechanic';
}

// Regla 2: sólo el maestro envía evidencias al cliente.
export function canSendEvidence(role) {
    return role === 'master';
}

// Regla 5: sólo el maestro elimina (soft delete).
export function canDeleteEvidence(role) {
    return role === 'master';
}

// Regla 10: cotización adicional desde evidencia — maestro siempre; el
// mecánico normal sólo si el sistema le dio permiso explícito.
export function canCreateAdditionalQuote(role, permissions = {}) {
    if (role === 'master') return true;
    if (role === 'mechanic' && (permissions || {}).can_create_quotes === true) return true;
    return false;
}

// ─────────────────────────────────────────────────────────────────────────
// CLASIFICACIÓN / FILTROS
// ─────────────────────────────────────────────────────────────────────────
export function isEvidence(photo) {
    return !!photo && !!photo.evidence_type;
}

// Visible = es evidencia y NO está eliminada (soft delete).
export function isVisibleEvidence(photo) {
    return isEvidence(photo) && !photo.deleted_at;
}

export function filterVisibleEvidences(photos = []) {
    return (photos || []).filter(isVisibleEvidence);
}

// Para el comprobante/PDF: misma regla — evidencias con tipo y no eliminadas.
export function filterEvidencesForPdf(photos = []) {
    return (photos || []).filter(isVisibleEvidence);
}

// ─────────────────────────────────────────────────────────────────────────
// RETENCIÓN (30 días)
// ─────────────────────────────────────────────────────────────────────────
export function computeEvidenceExpiry(createdAt = new Date(), days = PHOTO_RETENTION_DAYS) {
    const base = new Date(createdAt).getTime();
    return new Date(base + days * 24 * 60 * 60 * 1000);
}

export function isExpired(photo, now = new Date()) {
    if (!photo || !photo.expires_at) return false;
    return new Date(photo.expires_at).getTime() < new Date(now).getTime();
}

// ─────────────────────────────────────────────────────────────────────────
// TRANSFORMACIONES
// ─────────────────────────────────────────────────────────────────────────
// Patch de soft delete (regla 6: auditado, nunca borrado silencioso).
// `reason` es opcional (regla 4): el maestro puede dar un motivo al eliminar.
export function softDeletePatch(actorId, reason = null, now = new Date()) {
    return {
        deleted_at: now,
        deleted_by: actorId || null,
        delete_reason: reason ? String(reason).trim() : null,
    };
}

// Patch al marcar evidencia como enviada al cliente.
export function sentPatch(actorId, now = new Date()) {
    return { sent_to_client_at: now, sent_by: actorId || null };
}

// Totales de cotización (espejo de quotations.computeTotals).
export function computeQuoteTotals(labor = [], parts = []) {
    const labor_total = (labor || []).reduce(
        (s, l) => s + (parseFloat(l.price) || 0),
        0
    );
    const parts_total = (parts || []).reduce(
        (s, p) => s + (parseFloat(p.price) || 0) * (parseInt(p.quantity, 10) || 1),
        0
    );
    return { labor_total, parts_total, total_amount: labor_total + parts_total };
}

// Construye el payload de creación de la cotización adicional ligada a una
// evidencia + su orden. Lanza si la orden no tiene cliente.
export function buildAdditionalQuotePayload({
    order,
    description,
    labor = [],
    parts = [],
    quotationNumber,
    createdBy = null,
}) {
    if (!order || !order.client_id) {
        throw new Error('La orden no tiene cliente para cotizar');
    }
    const totals = computeQuoteTotals(labor, parts);
    return {
        quotation_number: quotationNumber,
        client_id: order.client_id,
        motorcycle_id: order.motorcycle_id || null,
        order_id: order.id,
        is_additional: true,
        customer_complaint: description || null,
        status: 'pendiente',
        created_by: createdBy,
        ...totals,
    };
}

// Regla 11: autorización del cliente para el trabajo extra.
export function applyClientAuthorization(authorized, now = new Date()) {
    return authorized
        ? { status: 'aceptada', client_authorized_at: new Date(now) }
        : { status: 'rechazada', client_authorized_at: new Date(now) };
}

// Separa un data URL (data:image/jpeg;base64,XXXX) en { mimetype, base64 }
// para mandarlo al bot de WhatsApp (que espera base64 crudo + mimetype).
export function parseDataUrl(url = '') {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(url || '');
    if (!m) {
        return { mimetype: 'image/jpeg', base64: String(url || '').replace(/^data:.*,/, '') };
    }
    return { mimetype: m[1], base64: m[2] };
}
