import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRole, effectivePermissions, canManageMember, isAdminRole } from '../src/lib/permissions.js';

test('normalizeRole: owner / admin / maestro / mecanico / auxiliar', () => {
    assert.equal(normalizeRole('owner', {}), 'owner');
    assert.equal(normalizeRole('admin', { role: 'admin_mechanic' }), 'admin');
    assert.equal(normalizeRole('mechanic', { is_master_mechanic: true }), 'maestro');
    assert.equal(normalizeRole('mechanic', { role: 'admin_mechanic' }), 'maestro');
    assert.equal(normalizeRole('mechanic', {}), 'mecanico');
    assert.equal(normalizeRole('auxiliary', {}), 'auxiliar');
    assert.equal(normalizeRole('mechanic', { requires_approval: true }), 'auxiliar');
    // un auxiliar marcado como maestro por error sigue siendo auxiliar (requiere aprobación manda)
    assert.equal(normalizeRole('mechanic', { requires_approval: true, is_master_mechanic: true }), 'auxiliar');
    // valores raros heredados (la pantalla vieja guardaba admin_mechanic como rol del taller)
    assert.equal(normalizeRole('admin_mechanic', { is_master_mechanic: true }), 'maestro');
});

test('owner y admin tienen todos los permisos y la bandeja', () => {
    for (const role of ['owner', 'admin']) {
        const p = effectivePermissions({ role, permissions: { can_delete_orders: false } }, { can_delete_orders: false });
        assert.equal(p.can_delete_orders, true);
        assert.equal(p.can_view_inbox, true);
        assert.equal(p.can_manage_team, true);
        assert.equal(p.can_manage_whatsapp, true);
        assert.equal(p.can_create_auxiliares, true);
    }
});

test('maestro: bandeja y auxiliares sí; administrar equipo/WhatsApp no', () => {
    const p = effectivePermissions({ role: 'mechanic', permissions: {} }, { is_master_mechanic: true });
    assert.equal(p.role, 'maestro');
    assert.equal(p.can_view_inbox, true);
    assert.equal(p.can_create_auxiliares, true);
    assert.equal(p.can_approve_auxiliares, true);
    assert.equal(p.can_see_whatsapp_status, true);
    assert.equal(p.can_manage_team, false);
    assert.equal(p.can_manage_whatsapp, false);
});

test('auxiliar: la bandeja es false por defecto y true solo si se marcó al crearlo', () => {
    const off = effectivePermissions({ role: 'auxiliary', permissions: {} }, { requires_approval: true });
    assert.equal(off.can_view_inbox, false);
    const on = effectivePermissions({ role: 'auxiliary', permissions: { can_view_inbox: true } }, { requires_approval: true });
    assert.equal(on.can_view_inbox, true);
    // "truthy" no cuenta: debe ser booleano true
    const str = effectivePermissions({ role: 'auxiliary', permissions: { can_view_inbox: 'true' } }, {});
    assert.equal(str.can_view_inbox, false);
    assert.equal(off.can_create_auxiliares, false);
    assert.equal(off.can_manage_whatsapp, false);
    assert.equal(off.can_see_money, false);
});

test('mecánico común: sin bandeja salvo que se marque', () => {
    const p = effectivePermissions({ role: 'mechanic', permissions: {} }, {});
    assert.equal(p.role, 'mecanico');
    assert.equal(p.can_view_inbox, false);
    assert.equal(effectivePermissions({ role: 'mechanic', permissions: { can_view_inbox: true } }, {}).can_view_inbox, true);
});

test('permisos finos: override del taller > perfil > valores por defecto', () => {
    const base = effectivePermissions({ role: 'mechanic', permissions: {} }, {});
    assert.equal(base.can_create_clients, true);
    assert.equal(base.can_delete_orders, false);
    const profile = effectivePermissions({ role: 'mechanic', permissions: {} }, { can_delete_orders: true, can_create_clients: false });
    assert.equal(profile.can_delete_orders, true);
    assert.equal(profile.can_create_clients, false);
    const override = effectivePermissions({ role: 'mechanic', permissions: { can_delete_orders: false } }, { can_delete_orders: true });
    assert.equal(override.can_delete_orders, false);
});

test('canManageMember: admin a todos menos al owner; maestro solo a sus auxiliares', () => {
    const owner = { id: 'o', role: 'owner' };
    const admin = { id: 'a', role: 'admin' };
    const maestro = { id: 'm', role: 'maestro' };
    assert.equal(canManageMember(owner, { id: 'x', role: 'owner' }), true);
    assert.equal(canManageMember(admin, { id: 'x', role: 'mecanico' }), true);
    assert.equal(canManageMember(admin, { id: 'o', role: 'owner' }), false);
    assert.equal(canManageMember(maestro, { id: 'x', role: 'auxiliar', supervised_by: 'm' }), true);
    assert.equal(canManageMember(maestro, { id: 'x', role: 'auxiliar', supervised_by: 'otro' }), false);
    assert.equal(canManageMember(maestro, { id: 'x', role: 'mecanico', supervised_by: 'm' }), false);
    assert.equal(canManageMember({ id: 'z', role: 'auxiliar' }, { id: 'z', role: 'auxiliar' }), false);
    assert.equal(canManageMember(null, {}), false);
});

test('isAdminRole', () => {
    assert.equal(isAdminRole('owner'), true);
    assert.equal(isAdminRole('admin'), true);
    assert.equal(isAdminRole('maestro'), false);
});
