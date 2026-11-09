// Archivos de WhatsApp en el bot: id del mensaje armado a mano, descarga directa y conversión de audio (sin WhatsApp real).
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { msgSerializedId, downloadMediaFromStore, convertToOggOpus, MAX_MEDIA_BYTES, LIVE_MEDIA_TYPES } from '../../whatsapp-bot/src/wa-media.js';
import { importHistory } from '../../whatsapp-bot/src/inbox-events.js';

console.log = () => {};
console.warn = () => {};

test('msgSerializedId: usa _serialized si existe y lo arma a mano si no (caso de producción)', () => {
    assert.equal(msgSerializedId({ id: { _serialized: 'true_a@c.us_X1' } }), 'true_a@c.us_X1');
    // MsgKey sin _serialized: remote como Wid
    assert.equal(msgSerializedId({ id: { fromMe: false, remote: { user: '231722109149242', server: 'lid' }, id: '3EB0AAA' } }), 'false_231722109149242@lid_3EB0AAA');
    // remote ya serializado dentro del objeto
    assert.equal(msgSerializedId({ id: { fromMe: true, remote: { _serialized: '5219611234567@c.us' }, id: 'ABC' } }), 'true_5219611234567@c.us_ABC');
    // en la propiedad interna _data
    assert.equal(msgSerializedId({ _data: { id: { fromMe: false, remote: '1@lid', id: 'Z9' } } }), 'false_1@lid_Z9');
    // con participante (grupos)
    assert.equal(msgSerializedId({ id: { fromMe: false, remote: '12@g.us', id: 'G1', participant: { user: '5219', server: 'c.us' } } }), 'false_12@g.us_G1_5219@c.us');
    assert.equal(msgSerializedId({ id: 'ya_serializado' }), 'ya_serializado');
    assert.equal(msgSerializedId({}), null);
    assert.equal(msgSerializedId({ id: { fromMe: false } }), null);
    assert.equal(msgSerializedId(null), null);
});

test('tipos que se bajan al llegar: imagen, sticker, audio y nota de voz (video y documentos bajo demanda)', () => {
    for (const t of ['image', 'sticker', 'audio', 'ptt']) assert.ok(LIVE_MEDIA_TYPES.has(t), t);
    for (const t of ['video', 'document', 'chat']) assert.ok(!LIVE_MEDIA_TYPES.has(t), t);
    assert.ok(MAX_MEDIA_BYTES >= 8 * 1024 * 1024);
});

test('downloadMediaFromStore: devuelve el archivo, o un error claro sin lanzar', async () => {
    const ok = { pupPage: { evaluate: async (_fn, id, max) => ({ data: 'AAEC', mime: 'audio/ogg; codecs=opus', size: 3, seconds: 7, filename: null, _id: id, _max: max }) } };
    const r = await downloadMediaFromStore(ok, 'true_x@lid_1');
    assert.equal(r.data, 'AAEC'); assert.equal(r.seconds, 7); assert.equal(r._id, 'true_x@lid_1'); assert.equal(r._max, MAX_MEDIA_BYTES);
    assert.deepEqual(await downloadMediaFromStore(ok, null), { error: 'sin_id' });
    assert.deepEqual(await downloadMediaFromStore({}, 'id'), { error: 'sin_pagina' });
    const bad = { pupPage: { evaluate: async () => ({ error: 'expirado' }) } };
    assert.deepEqual(await downloadMediaFromStore(bad, 'id'), { error: 'expirado' });
});

test('convertToOggOpus: escribe el audio, corre ffmpeg y devuelve el resultado; limpia los temporales', async () => {
    let seen = null;
    const out = await convertToOggOpus(Buffer.from('webm-bytes'), async (input, output) => {
        seen = { input, output, content: (await fs.readFile(input)).toString() };
        await fs.writeFile(output, Buffer.from('OggS-fake'));
    });
    assert.equal(out.toString(), 'OggS-fake');
    assert.equal(seen.content, 'webm-bytes');
    await new Promise((r) => setTimeout(r, 60));
    await assert.rejects(() => fs.access(seen.input), 'el temporal se borra');
    await assert.rejects(() => convertToOggOpus(Buffer.from('x'), async () => { throw new Error('ffmpeg no está disponible'); }), /ffmpeg/);
});

test('importHistory (almacén): arma el id, y pasa tipo, duración, nombre y mime del archivo', async () => {
    const posted = [];
    const original = globalThis.fetch;
    globalThis.fetch = async (_u, opts) => { posted.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; };
    try {
        let call = 0;
        const client = {
            getChats: async () => { throw new Error('r'); },
            pupPage: {
                evaluate: async () => {
                    call += 1;
                    if (call === 1) return [{ id: '231722109149242@lid', server: 'lid', user: '231722109149242', isGroup: false, name: 'Valery', t: 9, phone: null }];
                    return { deep: 'rondas=1 total=3', msgs: [
                        { sid: 'false_231722109149242@lid_A1', fromMe: false, type: 'ptt', body: 'BASE64', caption: '', t: 10, duration: 12, mimetype: 'audio/ogg; codecs=opus', filename: null },
                        { sid: 'false_231722109149242@lid_A2', fromMe: false, type: 'sticker', body: 'BASE64', caption: '', t: 11, duration: null, mimetype: 'image/webp', filename: null },
                        { sid: 'true_231722109149242@lid_A3', fromMe: true, type: 'document', body: '', caption: 'Cotización', t: 12, duration: null, mimetype: 'application/pdf', filename: 'cotizacion.pdf' },
                    ] };
                },
            },
        };
        await importHistory(client, 'sesion-media', { pauseMs: 0 });
        const items = posted[0].messages;
        assert.equal(posted[0].replaceUntagged, true);
        assert.deepEqual(items.map((m) => m.wa_message_id), ['false_231722109149242@lid_A1', 'false_231722109149242@lid_A2', 'true_231722109149242@lid_A3']);
        assert.deepEqual(items.map((m) => m.mediaType), ['ptt', 'sticker', 'document']);
        assert.equal(items[0].mediaSeconds, 12); assert.equal(items[0].mediaMime, 'audio/ogg; codecs=opus');
        assert.equal(items[2].mediaName, 'cotizacion.pdf');
        assert.deepEqual(items.map((m) => m.body), ['[Nota de voz]', '[Sticker]', '[Documento] Cotización']);
    } finally { globalThis.fetch = original; }
});
