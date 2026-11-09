// Sesión ÚNICA de WhatsApp del taller (V2).
//
// El bot guarda cada sesión con un id (`mechanicId`) = id de un Profile. Antes cada mecánico tenía la suya y
// había tres formas distintas de escoger una. Ahora el taller tiene UNA: Workspace.whatsapp_session_profile_id.
// Esta capa resuelve ese id y habla con el bot. TODO lo demás usa estas funciones.
import prisma, { workspaceContext } from './prisma.js';

export const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
export const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);

// Cache corta para no consultar la BD en cada mensaje.
const CACHE_MS = 20_000;
const cache = new Map(); // workspaceId -> { id, at }
export function clearSessionCache(workspaceId) {
    if (workspaceId) cache.delete(workspaceId); else cache.clear();
}

/**
 * Id de sesión del bot para un taller.
 *  1) Workspace.whatsapp_session_profile_id.
 *  2) Respaldo (taller aún sin migrar): la sesión conectada de algún integrante del taller; si no, cualquiera.
 *  3) null si no hay nada configurado.
 */
export async function resolveSessionId(workspaceId) {
    if (!workspaceId) return null;
    const hit = cache.get(workspaceId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.id;

    let id = null;
    const ws = await unscoped(() => prisma.workspace.findUnique({
        where: { id: workspaceId }, select: { whatsapp_session_profile_id: true },
    }));
    if (ws?.whatsapp_session_profile_id) {
        id = ws.whatsapp_session_profile_id;
    } else {
        id = await findLegacySessionProfile(workspaceId);
    }
    cache.set(workspaceId, { id, at: Date.now() });
    return id;
}

/** Sesión heredada del taller (para la migración y como respaldo). Prefiere la conectada. */
export async function findLegacySessionProfile(workspaceId) {
    const members = await unscoped(() => prisma.membership.findMany({
        where: { workspace_id: workspaceId }, select: { profile_id: true },
    }));
    const memberIds = members.map((m) => m.profile_id);
    const rows = await unscoped(() => prisma.whatsappSession.findMany({
        where: { OR: [{ workspace_id: workspaceId }, { mechanic_id: { in: memberIds } }] },
        orderBy: [{ is_connected: 'desc' }, { updated_at: 'desc' }],
    }));
    const row = rows.find((r) => r.mechanic_id && (r.workspace_id === workspaceId || memberIds.includes(r.mechanic_id)));
    return row?.mechanic_id || null;
}

/** Llamada al bot. Devuelve { ok, status, data, error, unreachable }. Nunca lanza. */
export async function botCall(path, { method = 'GET', body, timeoutMs = 25_000 } = {}) {
    try {
        const res = await fetch(`${BOT_URL}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
        return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data?.error || text.slice(0, 200)), unreachable: false };
    } catch (e) {
        return { ok: false, status: 0, data: null, error: e.message, unreachable: true };
    }
}

/** Estado para la pantalla de ajustes: contrato GET /api/whatsapp/status. */
export async function getWorkspaceStatus(workspaceId) {
    const sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) {
        return { configured: false, connected: false, state: 'disconnected', phone_number: null, connected_at: null, qr_data_url: null };
    }
    const st = await botCall(`/sessions/${sessionId}/status`, { timeoutMs: 8000 });
    const d = st.data || {};
    if (!st.ok) {
        return {
            configured: true, connected: false, state: 'disconnected', phone_number: null, connected_at: null,
            qr_data_url: null, error: st.unreachable ? 'El servicio de WhatsApp no responde.' : st.error,
        };
    }
    let state = 'disconnected';
    if (d.isConnected) state = 'connected';
    else if (d.qr) state = 'qr';
    else if (d.initializing || d.restartScheduled || d.exists) state = 'connecting';

    let qr = null;
    if (state === 'qr') {
        const q = await botCall(`/sessions/${sessionId}/qr`, { timeoutMs: 8000 });
        qr = q.ok ? (q.data?.qr || null) : null;
    }
    const dbRow = await unscoped(() => prisma.whatsappSession.findUnique({ where: { mechanic_id: sessionId } }));
    return {
        configured: true,
        connected: !!d.isConnected,
        state,
        phone_number: d.phoneNumber || dbRow?.phone_number || null,
        connected_at: d.isConnected ? (dbRow?.connected_at || null) : null,
        qr_data_url: qr,
        last_error: d.lastError || null,
    };
}

/** Inicia la sesión del taller (la crea si el taller no tenía ninguna: usa `fallbackProfileId`). */
export async function startWorkspaceSession(workspaceId, fallbackProfileId) {
    let sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) {
        sessionId = fallbackProfileId;
        await unscoped(() => prisma.workspace.update({
            where: { id: workspaceId }, data: { whatsapp_session_profile_id: sessionId },
        }));
        clearSessionCache(workspaceId);
    }
    const r = await botCall(`/sessions/${sessionId}/start`, { method: 'POST', timeoutMs: 15_000 });
    return { ok: r.ok, error: r.error, sessionId };
}

/** Cierra la sesión del taller (para cambiar de número). */
export async function logoutWorkspaceSession(workspaceId) {
    const sessionId = await resolveSessionId(workspaceId);
    if (!sessionId) return { ok: true, sessionId: null };
    const r = await botCall(`/sessions/${sessionId}/logout`, { method: 'POST', timeoutMs: 30_000 });
    return { ok: r.ok, error: r.error, sessionId };
}

/** Taller al que pertenece una sesión del bot (para los eventos entrantes). */
export async function workspaceOfSession(sessionId) {
    // Un id que no es UUID jamás es una sesión válida (evita que Prisma lance un error de columna).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sessionId || ''))) return null;
    const ws = await unscoped(() => prisma.workspace.findFirst({
        where: { whatsapp_session_profile_id: sessionId }, select: { id: true },
    }));
    if (ws) return ws.id;
    const row = await unscoped(() => prisma.whatsappSession.findUnique({ where: { mechanic_id: sessionId } }));
    if (row?.workspace_id) return row.workspace_id;
    const m = await unscoped(() => prisma.membership.findFirst({ where: { profile_id: sessionId }, select: { workspace_id: true } }));
    return m?.workspace_id || null;
}

/**
 * Migración idempotente: asigna Workspace.whatsapp_session_profile_id a los talleres que no lo tienen,
 * tomando la sesión que YA estaba conectada (no hace falta volver a escanear el QR).
 * Devuelve cuántos talleres cambió.
 */
export async function migrateWorkspaceSessions() {
    const workspaces = await unscoped(() => prisma.workspace.findMany({
        where: { whatsapp_session_profile_id: null }, select: { id: true },
    }));
    let changed = 0;
    for (const w of workspaces) {
        const id = await findLegacySessionProfile(w.id);
        if (!id) continue;
        await unscoped(() => prisma.workspace.update({ where: { id: w.id }, data: { whatsapp_session_profile_id: id } }));
        changed += 1;
    }
    clearSessionCache();
    return changed;
}
