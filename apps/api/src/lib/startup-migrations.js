// Migraciones de datos que corren al arrancar la API (V2). TODAS son idempotentes: correrlas dos veces no duplica ni pisa nada.
//   1) Sesión única de WhatsApp por taller: se toma la que YA estaba conectada (sin volver a escanear el QR).
//   2) Plantillas + automatizaciones por defecto de los mensajes de orden (el servidor es el único remitente),
//      y ordenarlas: apagar duplicadas activas y corregir filtros que nunca coinciden (p. ej. "Lista" vs "Lista para Entregar").
import { migrateWorkspaceSessions } from './wa-session.js';
import { mergeDuplicateConversations } from './wa-inbox.js';
import { syncAssignments } from './wa-assign.js';
import { ensureDefaultMessages, reconcileOrderAutomations, workspacesWithWhatsApp } from './default-messages.js';

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
            // Apaga duplicadas activas (mismo aviso dos veces) y corrige filtros que nunca coinciden con el estado real del taller.
            summary.defaults[wsId].reconcile = await reconcileOrderAutomations(wsId);
            // Une chats de WhatsApp duplicados (mismo wa_chat_id) sin perder mensajes.
            summary.defaults[wsId].conversations_merged = await mergeDuplicateConversations(wsId);
            // Reparte los chats entre los maestros según sus órdenes, citas y respuestas (los asignados a mano no se tocan).
            summary.defaults[wsId].conversations_assigned = await syncAssignments(wsId);
        }
    } catch (e) {
        log.error?.(`[migraciones] mensajes por defecto fallaron: ${e.message}`);
    }
    log.info?.(`[migraciones] listo: ${JSON.stringify(summary)}`);
    return summary;
}
