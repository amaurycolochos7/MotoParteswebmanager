// Migraciones de datos que corren al arrancar la API (V2). TODAS son idempotentes: correrlas dos veces no duplica ni pisa nada.
//   1) Sesión única de WhatsApp por taller: se toma la que YA estaba conectada (sin volver a escanear el QR).
//   2) Plantillas + automatizaciones por defecto de los mensajes de orden (el servidor es el único remitente).
import { migrateWorkspaceSessions } from './wa-session.js';
import { ensureDefaultMessages, workspacesWithWhatsApp } from './default-messages.js';

export async function runStartupMigrations(log = console) {
    const summary = { sessions_assigned: 0, defaults: {} };
    try {
        summary.sessions_assigned = await migrateWorkspaceSessions();
    } catch (e) {
        log.error?.(`[migraciones] sesión única de WhatsApp falló: ${e.message}`);
    }
    try {
        for (const wsId of await workspacesWithWhatsApp()) {
            summary.defaults[wsId] = await ensureDefaultMessages(wsId);
        }
    } catch (e) {
        log.error?.(`[migraciones] mensajes por defecto fallaron: ${e.message}`);
    }
    log.info?.(`[migraciones] listo: ${JSON.stringify(summary)}`);
    return summary;
}
