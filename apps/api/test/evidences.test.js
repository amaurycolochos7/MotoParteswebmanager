// Pruebas del módulo "Evidencias del servicio".
// Runner nativo de Node (node --test) — sin DB, sin frameworks, igual que
// payments.test.js. Ejercitan la lógica pura de lib/evidences.js, que es lo
// que las rutas usan para decidir permisos y transformaciones. Cada uno de
// los 14 escenarios requeridos por ELIHU está cubierto y etiquetado.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    EVIDENCE_TYPES,
    normalizeEvidenceType,
    resolveEvidenceRole,
    canUploadEvidence,
    canSendEvidence,
    canDeleteEvidence,
    canCreateAdditionalQuote,
    isEvidence,
    isVisibleEvidence,
    filterVisibleEvidences,
    filterEvidencesForPdf,
    computeEvidenceExpiry,
    isExpired,
    softDeletePatch,
    sentPatch,
    computeQuoteTotals,
    buildAdditionalQuotePayload,
    applyClientAuthorization,
    parseDataUrl,
} from '../src/lib/evidences.js';

// ── Roles ────────────────────────────────────────────────────────────────
const MASTER = resolveEvidenceRole({ workspaceRole: 'mechanic', profile: { is_master_mechanic: true } });
const MASTER_OWNER = resolveEvidenceRole({ workspaceRole: 'owner', profile: {} });
const NORMAL = resolveEvidenceRole({ workspaceRole: 'mechanic', profile: { is_master_mechanic: false } });
const AUX_ROLE = resolveEvidenceRole({ workspaceRole: 'auxiliary', profile: {} });
const AUX_FLAG = resolveEvidenceRole({ workspaceRole: 'mechanic', profile: { requires_approval: true } });

test('resolveEvidenceRole clasifica master/mechanic/auxiliary por ambas señales', () => {
    assert.equal(MASTER, 'master');
    assert.equal(MASTER_OWNER, 'master');
    assert.equal(resolveEvidenceRole({ workspaceRole: 'admin', profile: {} }), 'master');
    assert.equal(resolveEvidenceRole({ workspaceRole: 'mechanic', profile: { role: 'admin_mechanic' } }), 'master');
    assert.equal(NORMAL, 'mechanic');
    assert.equal(AUX_ROLE, 'auxiliary');
    assert.equal(AUX_FLAG, 'auxiliary');
});

test('tipos de evidencia válidos son exactamente los 3 requeridos', () => {
    assert.deepEqual(EVIDENCE_TYPES, ['pieza_danada', 'pieza_nueva', 'despues_trabajo']);
    assert.equal(normalizeEvidenceType('pieza_danada'), 'pieza_danada');
    assert.equal(normalizeEvidenceType('otra_cosa'), null);
});

// ── 1. Maestro sube evidencia → PASS ──────────────────────────────────────
test('#1 maestro puede subir evidencia → PASS', () => {
    assert.equal(canUploadEvidence(MASTER), true);
});

// ── 2. Mecánico normal sube evidencia → PASS ──────────────────────────────
test('#2 mecánico normal puede subir evidencia → PASS', () => {
    assert.equal(canUploadEvidence(NORMAL), true);
});

// ── 3. Auxiliar sube evidencia → 403 ──────────────────────────────────────
test('#3 auxiliar NO puede subir evidencia → 403', () => {
    assert.equal(canUploadEvidence(AUX_ROLE), false);
    assert.equal(canUploadEvidence(AUX_FLAG), false);
});

// ── 4. Maestro envía por WhatsApp → PASS (mock) ───────────────────────────
test('#4 maestro puede enviar evidencia por WhatsApp → PASS', () => {
    assert.equal(canSendEvidence(MASTER), true);
    // mock del envío: parseDataUrl produce base64+mimetype para el bot
    const { mimetype, base64 } = parseDataUrl('data:image/jpeg;base64,QUJD');
    assert.equal(mimetype, 'image/jpeg');
    assert.equal(base64, 'QUJD');
    // tras enviar, el patch marca la evidencia como enviada
    const patch = sentPatch('master-1');
    assert.ok(patch.sent_to_client_at instanceof Date);
    assert.equal(patch.sent_by, 'master-1');
});

// ── 5. Mecánico normal intenta enviar → 403 ───────────────────────────────
test('#5 mecánico normal NO puede enviar → 403', () => {
    assert.equal(canSendEvidence(NORMAL), false);
});

// ── 6. Auxiliar intenta enviar → 403 ──────────────────────────────────────
test('#6 auxiliar NO puede enviar → 403', () => {
    assert.equal(canSendEvidence(AUX_ROLE), false);
});

// ── 7. Maestro elimina → soft delete PASS ─────────────────────────────────
test('#7 maestro elimina → soft delete (auditado), no borrado físico', () => {
    assert.equal(canDeleteEvidence(MASTER), true);
    const photo = { id: 'p1', evidence_type: 'pieza_danada', deleted_at: null };
    assert.equal(isVisibleEvidence(photo), true);
    const patch = softDeletePatch('master-1', 'foto borrosa');
    const deleted = { ...photo, ...patch };
    assert.ok(deleted.deleted_at instanceof Date, 'queda marca de eliminación');
    assert.equal(deleted.deleted_by, 'master-1', 'queda quién eliminó (auditoría)');
    assert.equal(deleted.delete_reason, 'foto borrosa', 'queda el motivo opcional');
    assert.equal(isVisibleEvidence(deleted), false, 'deja de ser visible');
    assert.equal(isEvidence(deleted), true, 'sigue existiendo la fila (no borrado físico)');

    // El motivo es OPCIONAL: sin motivo, delete_reason = null.
    assert.equal(softDeletePatch('master-1').delete_reason, null);
});

// ── 8. Mecánico normal elimina → 403 ──────────────────────────────────────
test('#8 mecánico normal NO puede eliminar → 403', () => {
    assert.equal(canDeleteEvidence(NORMAL), false);
    assert.equal(canDeleteEvidence(AUX_ROLE), false);
});

// ── 9. Evidencia aparece en listado de la orden ───────────────────────────
test('#9 evidencia activa aparece en el listado de la orden', () => {
    const photos = [
        { id: 'a', evidence_type: 'pieza_nueva', deleted_at: null },
        { id: 'b', evidence_type: null, deleted_at: null },          // foto de ingreso, no evidencia
        { id: 'c', evidence_type: 'despues_trabajo', deleted_at: new Date() }, // eliminada
    ];
    const visible = filterVisibleEvidences(photos);
    assert.deepEqual(visible.map((p) => p.id), ['a']);
});

// ── 10. Evidencia aparece en comprobante/PDF ──────────────────────────────
test('#10 evidencia activa aparece en el PDF', () => {
    const photos = [{ id: 'a', evidence_type: 'pieza_danada', deleted_at: null }];
    assert.equal(filterEvidencesForPdf(photos).length, 1);
});

// ── 11. Crear cotización adicional desde evidencia ────────────────────────
test('#11 cotización adicional desde evidencia: permisos + payload', () => {
    assert.equal(canCreateAdditionalQuote(MASTER), true);
    assert.equal(canCreateAdditionalQuote(NORMAL), false);
    assert.equal(canCreateAdditionalQuote(NORMAL, { can_create_quotes: true }), true);
    assert.equal(canCreateAdditionalQuote(AUX_ROLE, { can_create_quotes: true }), false);

    const totals = computeQuoteTotals(
        [{ name: 'Mano de obra', price: 300 }],
        [{ name: 'Balero', price: 150, quantity: 2 }]
    );
    assert.deepEqual(totals, { labor_total: 300, parts_total: 300, total_amount: 600 });

    const payload = buildAdditionalQuotePayload({
        order: { id: 'o1', client_id: 'c1', motorcycle_id: 'm1' },
        description: 'Cambio de balero detectado',
        labor: [{ name: 'Mano de obra', price: 300 }],
        parts: [{ name: 'Balero', price: 150, quantity: 2 }],
        quotationNumber: 'COT-26-0007',
        createdBy: 'master-1',
    });
    assert.equal(payload.order_id, 'o1');
    assert.equal(payload.client_id, 'c1');
    assert.equal(payload.motorcycle_id, 'm1');
    assert.equal(payload.is_additional, true);
    assert.equal(payload.status, 'pendiente');
    assert.equal(payload.total_amount, 600);
    assert.equal(payload.quotation_number, 'COT-26-0007');
});

test('#11b buildAdditionalQuotePayload exige cliente en la orden', () => {
    assert.throws(() => buildAdditionalQuotePayload({ order: { id: 'o1' }, quotationNumber: 'X' }));
});

// ── 12. Cliente autoriza trabajo extra ────────────────────────────────────
test('#12 cliente autoriza/rechaza el trabajo extra', () => {
    const ok = applyClientAuthorization(true);
    assert.equal(ok.status, 'aceptada');
    assert.ok(ok.client_authorized_at instanceof Date);

    const no = applyClientAuthorization(false);
    assert.equal(no.status, 'rechazada');
    assert.ok(no.client_authorized_at instanceof Date);
});

// ── 13. Evidencia eliminada NO aparece en PDF ─────────────────────────────
test('#13 evidencia eliminada (soft delete) NO aparece en el PDF', () => {
    const photos = [
        { id: 'a', evidence_type: 'pieza_danada', deleted_at: null },
        { id: 'b', evidence_type: 'pieza_nueva', deleted_at: new Date() },
    ];
    const inPdf = filterEvidencesForPdf(photos);
    assert.deepEqual(inPdf.map((p) => p.id), ['a']);
});

// ── 14. Evidencia expira a 30 días ────────────────────────────────────────
test('#14 evidencia expira a 30 días', () => {
    const created = new Date('2026-01-01T00:00:00.000Z');
    const expiry = computeEvidenceExpiry(created, 30);
    const expectedMs = created.getTime() + 30 * 24 * 60 * 60 * 1000;
    assert.equal(expiry.getTime(), expectedMs);

    const photo = { expires_at: expiry };
    assert.equal(isExpired(photo, new Date('2026-01-15T00:00:00.000Z')), false, 'antes de 30d: vigente');
    assert.equal(isExpired(photo, new Date('2026-02-15T00:00:00.000Z')), true, 'después de 30d: expirada');
    assert.equal(isExpired({ expires_at: null }), false, 'sin expiración: nunca expira');
});
