import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDelayMs, classifyFailure, reasonOf, RETRY_WINDOW_MS } from '../src/lib/wa-send.js';
import {
    phoneFromChat, isIgnoredChat, previewOf, statusFromAck, betterStatus, comparableBody,
} from '../src/lib/wa-inbox.js';
import { shouldForward, bodyOf } from '../../whatsapp-bot/src/inbox-events.js';
import { toWaNumber } from '../src/lib/phone.js';

test('cola de reintentos: espera creciente hasta 15 min y ventana de 30 min', () => {
    assert.equal(nextDelayMs(1), 15_000);
    assert.equal(nextDelayMs(2), 30_000);
    assert.equal(nextDelayMs(3), 60_000);
    assert.equal(nextDelayMs(7), 15 * 60_000);
    assert.equal(nextDelayMs(50), 15 * 60_000);   // tope
    assert.equal(nextDelayMs(0), 15_000);         // nunca menos que el primer escalón
    assert.equal(RETRY_WINDOW_MS, 30 * 60 * 1000);
});

test('classifyFailure: bot caído o reconectando se reintenta; número inexistente o petición mala no', () => {
    assert.equal(classifyFailure({ unreachable: true, status: 0, error: 'fetch failed' }), 'retry');
    assert.equal(classifyFailure({ status: 503, error: 'Sesión de WhatsApp no disponible' }), 'retry');
    assert.equal(classifyFailure({ status: 502, error: 'x' }), 'retry');
    assert.equal(classifyFailure({ status: 500, error: 'Timeout' }), 'retry');
    assert.equal(classifyFailure({ status: 400, error: 'phone y message son requeridos' }), 'permanent');
    assert.equal(classifyFailure({ status: 500, error: 'El número 9611 no está registrado en WhatsApp' }), 'permanent');
});

test('reasonOf mantiene los motivos que ya conocía el panel', () => {
    assert.equal(reasonOf({ unreachable: true }), 'whatsapp_desconectado');
    assert.equal(reasonOf({ status: 503 }), 'whatsapp_desconectado');
    assert.equal(reasonOf({ status: 418 }), 'bot_418');
    assert.equal(reasonOf({ reason: 'sin_telefono' }), 'sin_telefono');
});

test('toWaNumber: 52 + 10 dígitos', () => {
    assert.equal(toWaNumber('961 123 4567'), '529611234567');
    assert.equal(toWaNumber('+52 1 961 123 4567'), '529611234567');
    assert.equal(toWaNumber('14155550123'), '14155550123');
});

test('phoneFromChat: c.us usa el número; @lid usa la pista del contacto', () => {
    assert.equal(phoneFromChat('5219611234567@c.us'), '9611234567');
    assert.equal(phoneFromChat('529611234567@c.us'), '9611234567');
    assert.equal(phoneFromChat('14155550123@c.us'), '14155550123');
    assert.equal(phoneFromChat('99887766554433@lid', '5219611234567'), '9611234567');
    assert.equal(phoneFromChat('99887766554433@lid'), '99887766554433');
    assert.equal(phoneFromChat(''), '');
});

test('isIgnoredChat: grupos, estados y difusión no entran a la bandeja', () => {
    assert.equal(isIgnoredChat('120363000000@g.us'), true);
    assert.equal(isIgnoredChat('status@broadcast'), true);
    assert.equal(isIgnoredChat('123@broadcast'), true);
    assert.equal(isIgnoredChat('123@newsletter'), true);
    assert.equal(isIgnoredChat(''), true);
    assert.equal(isIgnoredChat('5219611234567@c.us'), false);
    assert.equal(isIgnoredChat('99887766@lid'), false);
});

test('previewOf: recorta, limpia espacios y rotula multimedia', () => {
    assert.equal(previewOf('  hola\n  mundo  '), 'hola mundo');
    assert.equal(previewOf('x'.repeat(200)).length, 120);
    assert.ok(previewOf('x'.repeat(200)).endsWith('...'));
    assert.equal(previewOf('', 'image'), '[Imagen]');
    assert.equal(previewOf('', 'video'), '[video]');
    assert.equal(previewOf('', null), '');
});

test('estados de mensaje: ack -> estado y nunca retroceden', () => {
    assert.equal(statusFromAck(-1), 'failed');
    assert.equal(statusFromAck(0), 'queued');
    assert.equal(statusFromAck(1), 'sent');
    assert.equal(statusFromAck(2), 'delivered');
    assert.equal(statusFromAck(3), 'read');
    assert.equal(statusFromAck(4), 'read');
    assert.equal(betterStatus('sent', 'delivered'), 'delivered');
    assert.equal(betterStatus('read', 'delivered'), 'read');
    assert.equal(betterStatus('queued', 'sent'), 'sent');
    assert.equal(betterStatus('delivered', 'queued'), 'delivered');
});

test('comparableBody ignora recortes y saltos de línea de WhatsApp', () => {
    assert.equal(comparableBody('Hola\r\nMundo \n'), 'Hola\nMundo');
    assert.equal(comparableBody(comparableBody('  a ')), 'a');
});

// ── Bot: qué se reenvía a la bandeja (sin WhatsApp real) ──
test('bot: grupos, estados y avisos del sistema no se reenvían', () => {
    assert.equal(shouldForward({ from: '1@g.us', fromMe: false, type: 'chat' }), false);
    assert.equal(shouldForward({ from: 'status@broadcast', fromMe: false, type: 'image' }), false);
    assert.equal(shouldForward({ from: '5219611234567@c.us', fromMe: false, type: 'e2e_notification' }), false);
    assert.equal(shouldForward({ from: '5219611234567@c.us', fromMe: false, type: 'chat', isStatus: true }), false);
    assert.equal(shouldForward(null), false);
});

test('bot: mensajes normales sí; para los salientes el chat es `to`', () => {
    assert.equal(shouldForward({ from: '5219611234567@c.us', fromMe: false, type: 'chat' }), true);
    assert.equal(shouldForward({ from: '5219610000000@c.us', to: '5219611234567@c.us', fromMe: true, type: 'chat' }), true);
    assert.equal(shouldForward({ from: '5219610000000@c.us', to: '1@g.us', fromMe: true, type: 'chat' }), false);
});

test('bot: texto tal cual; multimedia con etiqueta y pie de foto', () => {
    assert.equal(bodyOf({ type: 'chat', body: '  hola ' }), 'hola');
    assert.equal(bodyOf({ type: 'image', body: 'BASE64...', caption: '' }), '[Imagen]');
    assert.equal(bodyOf({ type: 'image', caption: 'la falla' }), '[Imagen] la falla');
    assert.equal(bodyOf({ type: 'ptt' }), '[Nota de voz]');
    assert.equal(bodyOf({ type: 'document', _data: { caption: 'factura' } }), '[Documento] factura');
});
