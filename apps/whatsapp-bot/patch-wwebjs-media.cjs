/**
 * Parche de whatsapp-web.js: enviar imagenes / PDF / documentos.
 *
 * Sintoma: todo envio de archivos fallaba con
 *   "Data passed to getter must include an id property (it's how we memoize)
 *    but got undefined"
 * mientras el texto funcionaba (a cualquier destinatario, con cualquier version
 * de WhatsApp Web).
 *
 * Causa: en Utils.js (util/Injected) el mensaje se arma asi:
 *     const message = { ...options, id: newMsgKey, ..., ...mediaOptions,
 *                       ...(mediaOptions.toJSON ? mediaOptions.toJSON() : {}), ... };
 * `id: newMsgKey` va ANTES de esparcir mediaOptions; el modelo de media de las
 * versiones recientes de WhatsApp Web trae su propia clave `id` (undefined) y
 * PISA el id del mensaje. Los getters de WhatsApp exigen msg.id y revientan.
 * Un texto no tiene mediaOptions, por eso no se veia afectado.
 *
 * Arreglo: reasignar `id: newMsgKey` al FINAL del objeto, despues de todos los
 * spreads. Idempotente. Si el ancla no existe (la libreria cambio) avisa pero NO
 * rompe el build.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, 'node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');

if (!fs.existsSync(target)) {
    console.log('⚠️ patch-media: Utils.js no encontrado, se omite');
    process.exit(0);
}

let code = fs.readFileSync(target, 'utf-8');

if (code.includes('PATCHED-MEDIA-ID')) {
    console.log('✅ patch-media: ya aplicado');
    process.exit(0);
}

// El objeto `message` termina con ...botOptions, ...extraOptions, };
const anchor = /(\.\.\.botOptions,\s*\n\s*\.\.\.extraOptions,)(\s*\n\s*\};)/;
if (!anchor.test(code)) {
    console.warn('⚠️ patch-media: ANCLA NO ENCONTRADA — el envio de imagenes/PDF puede fallar con "getter must include an id".');
    process.exit(0);
}

code = code.replace(
    anchor,
    '$1\n            // PATCHED-MEDIA-ID: el toJSON()/mediaOptions de WhatsApp Web trae `id: undefined` y pisaba el id del mensaje\n            id: newMsgKey,$2'
);

fs.writeFileSync(target, code, 'utf-8');
console.log('✅ patch-media: id del mensaje protegido contra mediaOptions');
