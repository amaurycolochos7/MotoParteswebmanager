// Fase 6.4 — Rutas de integraciones externas (Google Calendar por ahora).
//
// Flujo OAuth:
//   1. Frontend GET /api/integrations/google/auth-url → { url }
//   2. Frontend redirige al usuario a esa URL.
//   3. Google → redirige de vuelta a /api/integrations/google/callback?code=...&state=<workspace_id>
//   4. Backend intercambia code por tokens y los guarda en workspace.google_calendar_tokens.
//   5. Redirige al usuario a /admin/integrations?connected=1.
//
// El `state` es el workspace_id del usuario que inició el flujo. Se verifica
// en el callback contra el JWT enviado en el initial auth-url para evitar
// CSRF cross-workspace.

import crypto from 'crypto';
import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace, requireRole } from '../middleware/workspace.js';
import {
    isGoogleCalendarConfigured,
    getAuthUrl,
    exchangeCode,
} from '../lib/google-calendar.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

// State de un solo uso: workspace_id + nonce aleatorio + timestamp. Se
// persiste en una caché en memoria durante 10 min. Aceptable porque el
// callback llega en segundos.
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function cleanStates() {
    const now = Date.now();
    for (const [k, v] of pendingStates.entries()) {
        if (now - v.created_at > STATE_TTL_MS) pendingStates.delete(k);
    }
}

const PUBLIC_APP_URL = () => process.env.PUBLIC_APP_URL || 'https://motopartes.cloud';

export default async function integrationsRoutes(fastify) {
    // GET /api/integrations/status — qué integraciones hay conectadas en el workspace.
    fastify.get('/status', { preHandler: [authenticate, resolveWorkspace] }, async (request, reply) => {
        const ws = await unscoped(() =>
            prisma.workspace.findUnique({
                where: { id: request.workspaceId },
                select: { id: true, google_calendar_tokens: true },
            })
        );
        return reply.send({
            google_calendar: {
                configured_on_server: isGoogleCalendarConfigured(),
                connected: Boolean(ws?.google_calendar_tokens?.access_token || ws?.google_calendar_tokens?.refresh_token),
            },
        });
    });

    // GET /api/integrations/google/auth-url — devuelve la URL a la que mandar al usuario.
    fastify.get(
        '/google/auth-url',
        { preHandler: [authenticate, resolveWorkspace, requireRole(['owner', 'admin'])] },
        async (request, reply) => {
            if (!isGoogleCalendarConfigured()) {
                return reply.status(501).send({
                    error: 'Google Calendar no está configurado en este servidor. Contacta al soporte para activarlo.',
                });
            }
            const nonce = crypto.randomBytes(16).toString('hex');
            const state = `${request.workspaceId}.${nonce}`;
            pendingStates.set(state, {
                workspace_id: request.workspaceId,
                profile_id: request.user.id,
                created_at: Date.now(),
            });
            cleanStates();
            return reply.send({ url: getAuthUrl(state) });
        }
    );

    // GET /api/integrations/google/callback — Google redirige aquí con ?code y &state.
    // No usa authenticate porque es un redirect externo; valida con state.
    fastify.get('/google/callback', async (request, reply) => {
        const { code, state, error } = request.query || {};
        const redirectBase = `${PUBLIC_APP_URL()}/admin/integrations`;

        if (error) {
            return reply.redirect(`${redirectBase}?error=${encodeURIComponent(error)}`);
        }
        if (!code || !state) {
            return reply.redirect(`${redirectBase}?error=missing-params`);
        }

        const entry = pendingStates.get(state);
        if (!entry) {
            return reply.redirect(`${redirectBase}?error=invalid-state`);
        }
        pendingStates.delete(state);

        try {
            const tokens = await exchangeCode(code);
            // Persistimos tokens en el workspace.
            await unscoped(() =>
                prisma.workspace.update({
                    where: { id: entry.workspace_id },
                    data: {
                        google_calendar_tokens: {
                            access_token: tokens.access_token,
                            refresh_token: tokens.refresh_token,
                            expiry_date: tokens.expiry_date,
                            scope: tokens.scope,
                            token_type: tokens.token_type,
                            calendar_id: 'primary',
                            connected_at: new Date().toISOString(),
                        },
                    },
                })
            );
            await unscoped(() =>
                prisma.auditLog.create({
                    data: {
                        workspace_id: entry.workspace_id,
                        profile_id: entry.profile_id,
                        event: 'integration.google_calendar.connected',
                        payload: { scopes: tokens.scope },
                    },
                })
            );
            return reply.redirect(`${redirectBase}?connected=1`);
        } catch (e) {
            console.error('[google-oauth] callback error:', e.message);
            return reply.redirect(`${redirectBase}?error=exchange-failed`);
        }
    });

    // POST /api/integrations/google/disconnect — borra los tokens del workspace.
    fastify.post(
        '/google/disconnect',
        { preHandler: [authenticate, resolveWorkspace, requireRole(['owner', 'admin'])] },
        async (request, reply) => {
            await unscoped(() =>
                prisma.workspace.update({
                    where: { id: request.workspaceId },
                    data: { google_calendar_tokens: null },
                })
            );
            await unscoped(() =>
                prisma.auditLog.create({
                    data: {
                        workspace_id: request.workspaceId,
                        profile_id: request.user.id,
                        event: 'integration.google_calendar.disconnected',
                        payload: {},
                    },
                })
            );
            return reply.send({ success: true });
        }
    );
}
