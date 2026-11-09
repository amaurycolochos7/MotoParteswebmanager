// Eliminar mensajes: quién puede eliminar para todos (reglas puras, sin BD ni bot).
import test from 'node:test';
import assert from 'node:assert/strict';
import { canRevokeForAll, REVOKE_WINDOW_MS } from '../src/lib/wa-delete.js';

const NOW = Date.parse('2026-11-09T18:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const out = (extra = {}) => ({ direction: 'out', wa_message_id: 'true_x_A', created_at: ago(60_000), sent_by: 'ana', revoked_at: null, ...extra });

test('el dueño, administrador o maestro puede eliminar para todos cualquier mensaje saliente', () => {
    for (const role of ['owner', 'admin', 'maestro']) assert.equal(canRevokeForAll(out({ sent_by: 'otro' }), { id: 'x', role }, NOW), true, role);
    assert.equal(canRevokeForAll(out({ sent_by: null, origin: 'auto' }), { id: 'x', role: 'maestro' }, NOW), true); // automático / del teléfono
});

test('un mecánico o auxiliar solo puede eliminar para todos lo que escribió él', () => {
    assert.equal(canRevokeForAll(out(), { id: 'ana', role: 'mecanico' }, NOW), true);
    assert.equal(canRevokeForAll(out({ sent_by: 'otro' }), { id: 'ana', role: 'auxiliar' }, NOW), false);
    assert.equal(canRevokeForAll(out({ sent_by: null }), { id: 'ana', role: 'mecanico' }, NOW), false);
});

test('los mensajes del cliente no se eliminan para todos', () => {
    assert.equal(canRevokeForAll(out({ direction: 'in' }), { id: 'x', role: 'owner' }, NOW), false);
});

test('ventana de WhatsApp: 2 días 12 horas; sin id de WhatsApp (nunca se envió) no hay límite', () => {
    const admin = { id: 'x', role: 'admin' };
    assert.equal(canRevokeForAll(out({ created_at: ago(REVOKE_WINDOW_MS - 60_000) }), admin, NOW), true);
    assert.equal(canRevokeForAll(out({ created_at: ago(REVOKE_WINDOW_MS + 60_000) }), admin, NOW), false);
    assert.equal(canRevokeForAll(out({ created_at: ago(REVOKE_WINDOW_MS * 3), wa_message_id: null, status: 'failed' }), admin, NOW), true);
});

test('un mensaje ya eliminado no se vuelve a eliminar', () => {
    assert.equal(canRevokeForAll(out({ revoked_at: ago(1000) }), { id: 'x', role: 'owner' }, NOW), false);
    assert.equal(canRevokeForAll(null, { id: 'x', role: 'owner' }, NOW), false);
});
