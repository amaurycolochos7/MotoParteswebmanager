import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath, nextFromSearch, loginUrlFor } from '../../frontend/src/lib/safeNext.js';
test('safeNextPath', () => {
  assert.equal(safeNextPath('/mechanic/appointments?cita=abc'), '/mechanic/appointments?cita=abc');
  for (const bad of ['https://evil.com', '//evil.com', '/' + String.fromCharCode(92) + 'evil.com', 'javascript:alert(1)', '', null, undefined, '/login', '/login?next=/x', '/mechanic\n/x', 'mechanic/x'])
    assert.equal(safeNextPath(bad), null, String(bad));
});
test('nextFromSearch / loginUrlFor roundtrip', () => {
  const url = loginUrlFor('/mechanic/appointments?cita=1&mine=1');
  assert.equal(url, '/login?next=%2Fmechanic%2Fappointments%3Fcita%3D1%26mine%3D1');
  assert.equal(nextFromSearch(url.slice(url.indexOf('?'))), '/mechanic/appointments?cita=1&mine=1');
  assert.equal(nextFromSearch('?next=https://evil.com'), null);
  assert.equal(loginUrlFor('//evil.com'), '/login');
});
