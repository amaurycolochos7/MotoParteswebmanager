import test from 'node:test';
import assert from 'node:assert/strict';
import {
    auxCommissionCap, DEFAULT_AUX_COMMISSION_CAP, creatableRoles, roleToDb, parseRate, validateAuxRate,
    sanitizePermissions, editableFieldsFor, pickFields, stripSecrets, ADMIN_EDITABLE, SELF_EDITABLE, MASTER_EDITABLE_ON_AUX,
} from '../src/lib/team-rules.js';

const owner = { id: 'o', role: 'owner' };
const admin = { id: 'a', role: 'admin' };
const maestro = { id: 'm', role: 'maestro' };
const mecanico = { id: 'x', role: 'mecanico' };

test('tope de comisión: 40 por defecto, configurable, valores inválidos vuelven al defecto', () => {
    assert.equal(DEFAULT_AUX_COMMISSION_CAP, 40);
    assert.equal(auxCommissionCap({}), 40);
    assert.equal(auxCommissionCap(undefined), 40);
    assert.equal(auxCommissionCap({ aux_commission_cap: 25 }), 25);
    assert.equal(auxCommissionCap({ aux_commission_cap: 0 }), 0);
    assert.equal(auxCommissionCap({ aux_commission_cap: 150 }), 40);
    assert.equal(auxCommissionCap({ aux_commission_cap: -3 }), 40);
    assert.equal(auxCommissionCap({ aux_commission_cap: 'abc' }), 40);
});

test('quién crea qué: admin cualquier rol; maestro solo auxiliares; el resto nada', () => {
    assert.deepEqual(creatableRoles(owner), ['admin', 'maestro', 'mecanico', 'auxiliar']);
    assert.deepEqual(creatableRoles(admin), ['admin', 'maestro', 'mecanico', 'auxiliar']);
    assert.deepEqual(creatableRoles(maestro), ['auxiliar']);
    assert.deepEqual(creatableRoles(mecanico), []);
    assert.deepEqual(creatableRoles({ role: 'auxiliar' }), []);
});

test('roleToDb traduce cada rol a membresía + campos de perfil', () => {
    assert.deepEqual(roleToDb('admin'), { membershipRole: 'admin', profile: { role: 'admin', is_master_mechanic: false, requires_approval: false } });
    assert.deepEqual(roleToDb('maestro'), { membershipRole: 'mechanic', profile: { role: 'admin_mechanic', is_master_mechanic: true, requires_approval: false } });
    assert.deepEqual(roleToDb('mecanico'), { membershipRole: 'mechanic', profile: { role: 'mechanic', is_master_mechanic: false, requires_approval: false } });
    assert.deepEqual(roleToDb('auxiliar'), { membershipRole: 'auxiliary', profile: { role: 'mechanic', is_master_mechanic: false, requires_approval: true } });
    assert.equal(roleToDb('owner'), null);
    assert.equal(roleToDb('lo-que-sea'), null);
});

test('parseRate: 0–100, rechaza lo demás', () => {
    assert.equal(parseRate(0), 0);
    assert.equal(parseRate('35.5'), 35.5);
    assert.equal(parseRate(100), 100);
    assert.equal(parseRate(101), null);
    assert.equal(parseRate(-1), null);
    assert.equal(parseRate('x'), null);
    assert.equal(parseRate(''), null);
    assert.equal(parseRate(null), null);
    assert.equal(parseRate(undefined), null);
});

test('un maestro NO puede pasar el tope; el admin sí (hasta 100)', () => {
    assert.deepEqual(validateAuxRate(maestro, 40, 40), { ok: true, rate: 40 });
    const over = validateAuxRate(maestro, 41, 40);
    assert.equal(over.ok, false);
    assert.match(over.error, /40%/);
    assert.deepEqual(validateAuxRate(admin, 60, 40), { ok: true, rate: 60 });
    assert.equal(validateAuxRate(admin, 101, 40).ok, false);
    assert.equal(validateAuxRate(maestro, 'mucho', 40).ok, false);
});

test('sanitizePermissions: solo claves conocidas y booleanas', () => {
    assert.deepEqual(
        sanitizePermissions({ can_delete_orders: true, can_edit_clients: 'si', is_super_admin: true, can_view_inbox: true, can_send_messages: false }),
        { can_delete_orders: true, can_send_messages: false },
    );
    assert.deepEqual(sanitizePermissions(null), {});
});

test('editableFieldsFor: admin todo, maestro solo su auxiliar, cada quien su perfil', () => {
    assert.equal(editableFieldsFor(admin, { id: 'z', role: 'mecanico' }), ADMIN_EDITABLE);
    assert.equal(editableFieldsFor(admin, { id: 'o', role: 'owner' }), null);
    assert.equal(editableFieldsFor(owner, { id: 'o2', role: 'owner' }), ADMIN_EDITABLE);
    assert.equal(editableFieldsFor(maestro, { id: 'z', role: 'auxiliar', supervised_by: 'm' }), MASTER_EDITABLE_ON_AUX);
    assert.equal(editableFieldsFor(maestro, { id: 'z', role: 'auxiliar', supervised_by: 'otro' }), null);
    assert.equal(editableFieldsFor(maestro, { id: 'z', role: 'mecanico', supervised_by: 'm' }), null);
    assert.equal(editableFieldsFor(mecanico, { id: 'x', role: 'mecanico' }), SELF_EDITABLE);
    assert.equal(editableFieldsFor(mecanico, { id: 'otro', role: 'mecanico' }), null);
});

test('ningún contexto permite escalar privilegios (sin asignación masiva)', () => {
    const peligrosos = ['role', 'is_super_admin', 'password_hash', 'id', 'workspace_id', 'created_at', 'super_2fa_secret', 'signup_source'];
    for (const list of [ADMIN_EDITABLE, SELF_EDITABLE, MASTER_EDITABLE_ON_AUX]) {
        for (const k of peligrosos) assert.ok(!list.includes(k), `${k} no debe ser editable`);
    }
    assert.ok(!SELF_EDITABLE.includes('commission_percentage'), 'nadie se sube su propia comisión');
    assert.ok(!SELF_EDITABLE.includes('supervised_by'));
    assert.ok(!MASTER_EDITABLE_ON_AUX.includes('supervised_by'), 'el maestro no reasigna auxiliares');
    assert.ok(!MASTER_EDITABLE_ON_AUX.includes('requires_approval'));
});

test('pickFields deja solo lo permitido', () => {
    assert.deepEqual(
        pickFields({ full_name: 'A', is_super_admin: true, phone: '1', role: 'admin' }, SELF_EDITABLE),
        { full_name: 'A', phone: '1' },
    );
    assert.deepEqual(pickFields(null, SELF_EDITABLE), {});
});

test('stripSecrets quita contraseña y secretos 2FA', () => {
    const out = stripSecrets({ id: 1, email: 'a@b.c', password_hash: 'x', super_2fa_secret: 's', super_2fa_enabled: true, full_name: 'N' });
    assert.deepEqual(out, { id: 1, email: 'a@b.c', full_name: 'N' });
});
