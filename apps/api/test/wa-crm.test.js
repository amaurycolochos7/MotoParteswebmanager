// CRM de WhatsApp: chats por maestro, adjuntos y foto de perfil (lógica pura, sin BD ni bot).
import test from 'node:test';
import assert from 'node:assert/strict';
import { masterOf, ownIdsOf, pickAssignee } from '../src/lib/wa-assign.js';
import { fileKindOf, fileBody, safeFileName, chatIdForConversation } from '../src/lib/wa-send.js';
import { chatIdOf, needsAvatarCheck, AVATAR_STALE_MS } from '../src/lib/wa-avatar.js';

const members = new Map([
    ['maciel', { id: 'maciel', role: 'maestro', supervised_by: null }],
    ['liu', { id: 'liu', role: 'maestro', supervised_by: null }],
    ['aux1', { id: 'aux1', role: 'auxiliar', supervised_by: 'maciel' }],
    ['aux-huerfano', { id: 'aux-huerfano', role: 'auxiliar', supervised_by: 'no-existe' }],
    ['dueno', { id: 'dueno', role: 'owner', supervised_by: null }],
]);

test('masterOf: el auxiliar responde por su maestro; un extraño no es del taller', () => {
    assert.equal(masterOf(members, 'maciel'), 'maciel');
    assert.equal(masterOf(members, 'aux1'), 'maciel');
    assert.equal(masterOf(members, 'aux-huerfano'), 'aux-huerfano'); // su maestro ya no está en el taller
    assert.equal(masterOf(members, 'otro-taller'), null);
});

test('ownIdsOf: "Mis chats" de un auxiliar son los de su maestro', () => {
    assert.deepEqual(ownIdsOf({ id: 'liu', role: 'maestro', profile: {} }), ['liu']);
    assert.deepEqual(ownIdsOf({ id: 'aux1', role: 'auxiliar', profile: { supervised_by: 'maciel' } }), ['maciel']);
    assert.deepEqual(ownIdsOf({ id: 'aux2', role: 'auxiliar', profile: {} }), ['aux2']);
});

test('pickAssignee: prioridad orden abierta > cita > quien respondió > última orden > preferido', () => {
    assert.equal(pickAssignee({ openOrder: 'liu', appointment: 'maciel', lastReply: 'maciel' }, members), 'liu');
    assert.equal(pickAssignee({ appointment: 'liu', lastReply: 'maciel' }, members), 'liu');
    assert.equal(pickAssignee({ lastReply: 'maciel', lastOrder: 'liu' }, members), 'maciel');
    assert.equal(pickAssignee({ lastOrder: 'liu', preferred: 'maciel' }, members), 'liu');
    assert.equal(pickAssignee({ preferred: 'maciel' }, members), 'maciel');
    assert.equal(pickAssignee({}, members), null);
});

test('pickAssignee: un auxiliar en la orden deja el chat a su maestro; quien ya no es del taller se salta', () => {
    assert.equal(pickAssignee({ openOrder: 'aux1' }, members), 'maciel');
    assert.equal(pickAssignee({ openOrder: 'ex-empleado', lastOrder: 'liu' }, members), 'liu');
});

test('fileKindOf: foto, video reproducible o documento', () => {
    assert.equal(fileKindOf('image/jpeg'), 'image');
    assert.equal(fileKindOf('image/png'), 'image');
    assert.equal(fileKindOf('image/svg+xml'), 'document');
    assert.equal(fileKindOf('video/mp4'), 'video');
    assert.equal(fileKindOf('video/quicktime'), 'video');
    assert.equal(fileKindOf('video/webm'), 'document'); // WhatsApp no lo reproduce: se manda como archivo
    assert.equal(fileKindOf('application/pdf'), 'document');
    assert.equal(fileKindOf('image/jpeg', true), 'document'); // "enviar como documento"
    assert.equal(fileKindOf(''), 'document');
});

test('fileBody: coincide con lo que reporta el bot ("[Imagen] pie")', () => {
    assert.equal(fileBody('image', ''), '[Imagen]');
    assert.equal(fileBody('image', '  Tu moto ya está lista  '), '[Imagen] Tu moto ya está lista');
    assert.equal(fileBody('video', 'x'), '[Video] x');
    assert.equal(fileBody('document', ''), '[Documento]');
});

test('safeFileName: sin rutas ni caracteres de control', () => {
    assert.equal(safeFileName('../../etc/passwd', 'document'), '.._.._etc_passwd');
    assert.equal(safeFileName('cotización: abril?.pdf', 'document'), 'cotización_ abril_.pdf');
    assert.equal(safeFileName('', 'image'), 'imagen.jpg');
    assert.equal(safeFileName(undefined, 'video'), 'video.mp4');
    assert.equal(safeFileName('a'.repeat(300), 'document').length, 120);
});

test('chatIdForConversation / chatIdOf: usa el id real del chat y, si no, el teléfono real', () => {
    assert.equal(chatIdForConversation({ wa_chat_id: '123456789012345@lid', phone: '123456789012345' }), '123456789012345@lid');
    assert.equal(chatIdForConversation({ wa_chat_id: null, phone: '9611234567' }), '529611234567@c.us');
    assert.equal(chatIdForConversation({ wa_chat_id: null, phone: '123456789012345' }), null);
    assert.equal(chatIdOf({ wa_chat_id: '529611234567@c.us', phone: '9611234567' }), '529611234567@c.us');
    assert.equal(chatIdOf({ wa_chat_id: null, phone: '123456789012345' }), null);
});

test('needsAvatarCheck: nunca revisada o vencida (7 días)', () => {
    const now = Date.now();
    assert.equal(needsAvatarCheck({ avatar_checked_at: null }, now), true);
    assert.equal(needsAvatarCheck({ avatar_checked_at: new Date(now - 1000) }, now), false);
    assert.equal(needsAvatarCheck({ avatar_checked_at: new Date(now - AVATAR_STALE_MS - 1000) }, now), true);
});
