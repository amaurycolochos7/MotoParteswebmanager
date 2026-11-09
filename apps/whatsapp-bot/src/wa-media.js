// Archivos de WhatsApp (audios, stickers, imágenes, videos, documentos) para la bandeja "Conversaciones".
//
// POR QUÉ NO SE USAN `msg.downloadMedia()` NI `msg.id._serialized` DE LA LIBRERÍA:
// con la versión fija de WhatsApp Web (2.3000.1053021455-alpha) el id de los mensajes NO trae `_serialized`, así que
// todas las funciones de la librería que lo necesitan fallan con el error "r" (getChats, fetchMessages, downloadMedia).
// Aquí el id se arma a mano (`<fromMe>_<chat>_<idCorto>`) y los archivos se bajan directo del módulo interno de WhatsApp Web.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_MEDIA_BYTES = 12 * 1024 * 1024; // tope por archivo
/** Se descargan en cuanto llegan (pequeños y los que más se usan). Video y documentos se piden cuando alguien los abre. */
export const LIVE_MEDIA_TYPES = new Set(['image', 'sticker', 'audio', 'ptt']);
export const MEDIA_TYPES = new Set(['image', 'sticker', 'audio', 'ptt', 'video', 'document']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withTimeout(promise, ms, what) {
    let t;
    return Promise.race([
        promise,
        new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} tardó más de ${Math.round(ms / 1000)} s`)), ms); }),
    ]).finally(() => clearTimeout(t));
}

const widText = (w) => {
    if (!w) return null;
    if (typeof w === 'string') return w;
    if (w._serialized) return w._serialized;
    return w.user && w.server ? `${w.user}@${w.server}` : null;
};

/**
 * Id completo del mensaje ("true_5219611234567@c.us_3EB0ABC..."), con o sin `_serialized`. null si no se puede armar.
 * Es el formato que entiende `Msg.get(id)` de WhatsApp Web.
 */
export function msgSerializedId(msg) {
    const id = msg?.id ?? msg?._data?.id;
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (id._serialized) return id._serialized;
    const remote = widText(id.remote);
    if (!remote || !id.id) return null;
    const part = id.participant ? `_${widText(id.participant)}` : '';
    return `${id.fromMe ? 'true' : 'false'}_${remote}_${id.id}${part}`;
}

/**
 * Baja y desencripta el archivo de un mensaje directo del módulo interno de WhatsApp Web.
 * @returns {{ data?: string, mime?: string, filename?: string|null, size?: number, seconds?: number|null, error?: string }}
 */
export async function downloadMediaFromStore(client, serializedId, { maxBytes = MAX_MEDIA_BYTES, timeoutMs = 60000 } = {}) {
    if (!serializedId) return { error: 'sin_id' };
    if (!client?.pupPage?.evaluate) return { error: 'sin_pagina' };
    return withTimeout(client.pupPage.evaluate(async (msgId, max) => {
        try {
            const C = window.require('WAWebCollections');
            const msg = C.Msg.get(msgId) || (await C.Msg.getMessagesById([msgId]))?.messages?.[0];
            if (!msg || !msg.mediaData) return { error: 'sin_mensaje' };
            const declared = Number(msg.size || (msg.mediaData && msg.mediaData.size) || 0);
            if (declared && declared > max) return { error: 'muy_grande', size: declared };
            if (msg.mediaData.mediaStage === 'REUPLOADING') return { error: 'expirado' };
            if (msg.mediaData.mediaStage != 'RESOLVED') {
                await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
            }
            const stage = String(msg.mediaData.mediaStage || '');
            if (stage.includes('ERROR') || stage === 'FETCHING') return { error: 'no_disponible', stage };
            const mockQpl = { addAnnotations() { return this; }, addPoint() { return this; } };
            const buf = await window.require('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
                directPath: msg.directPath, encFilehash: msg.encFilehash, filehash: msg.filehash,
                mediaKey: msg.mediaKey, mediaKeyTimestamp: msg.mediaKeyTimestamp, type: msg.type,
                signal: new AbortController().signal, downloadQpl: mockQpl,
            });
            const bytes = new Uint8Array(buf);
            if (bytes.length > max) return { error: 'muy_grande', size: bytes.length };
            let bin = '';
            const step = 0x8000;
            for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
            return {
                data: btoa(bin), mime: msg.mimetype || null, filename: msg.filename || null, size: bytes.length,
                seconds: msg.duration ? Number(msg.duration) : null,
            };
        } catch (e) {
            return { error: 'fallo', detail: String((e && e.message) || e).slice(0, 160) };
        }
    }, serializedId, maxBytes), timeoutMs, 'descarga del archivo');
}

/** ¿Este mime ya es una nota de voz de WhatsApp (ogg + opus)? */
export const isOggOpus = (mime) => /ogg/i.test(String(mime || ''));

/** Ejecuta ffmpeg (entrada y salida por archivo temporal). Reemplazable en pruebas. */
export async function runFfmpeg(inputPath, outputPath) {
    await new Promise((resolve, reject) => {
        const p = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg', outputPath]);
        let err = '';
        p.stderr.on('data', (d) => { err += d; });
        p.on('error', (e) => reject(new Error(`ffmpeg no está disponible: ${e.message}`)));
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg falló (${code}): ${err.slice(0, 200)}`))));
    });
}

/** Convierte cualquier audio grabado en el navegador (webm, mp4, wav...) a ogg/opus, el formato de las notas de voz de WhatsApp. */
export async function convertToOggOpus(buffer, runner = runFfmpeg) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-voice-'));
    const input = path.join(dir, 'in.bin');
    const output = path.join(dir, 'out.ogg');
    try {
        await fs.writeFile(input, buffer);
        await runner(input, output);
        return await fs.readFile(output);
    } finally {
        fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}

export { sleep };
