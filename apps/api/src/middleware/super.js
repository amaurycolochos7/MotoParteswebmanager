// Fase 7 — Middleware del super-admin.
//
// Valida que request.user.is_super_admin === true. Adicionalmente:
//   - Si SUPER_IP_ALLOWLIST está seteada, la IP origen debe estar en ella.
//   - Si profile.super_2fa_enabled y SUPER_REQUIRE_2FA=true, el JWT debe traer
//     el claim `super_2fa_verified: true`. Se setea al pasar TOTP.
//
// Carga el profile completo (no solo el JWT claim) para evitar que un token viejo
// pretenda ser super si la flag is_super_admin fue revocada después.

import prisma, { workspaceContext } from '../lib/prisma.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

export async function requireSuperAdmin(request, reply) {
    if (!request.user || !request.user.id) {
        return reply.status(401).send({ error: 'No autorizado' });
    }

    const profile = await unscoped(() =>
        prisma.profile.findUnique({
            where: { id: request.user.id },
            select: {
                id: true,
                email: true,
                full_name: true,
                is_super_admin: true,
                is_active: true,
                super_2fa_enabled: true,
            },
        })
    );

    if (!profile?.is_active || !profile?.is_super_admin) {
        return reply.status(403).send({ error: 'Acceso restringido — solo super-admin.' });
    }

    // IP allowlist (opcional via env)
    const allowlist = process.env.SUPER_IP_ALLOWLIST;
    if (allowlist && allowlist.length > 0) {
        const allowed = allowlist.split(',').map((s) => s.trim()).filter(Boolean);
        const ip = request.ip || request.socket?.remoteAddress;
        if (!ip || !allowed.some((a) => ip === a || ip.endsWith(a))) {
            return reply.status(403).send({ error: 'IP no permitida para super-admin.' });
        }
    }

    // 2FA enforcement — solo si el perfil lo tiene habilitado Y SUPER_REQUIRE_2FA=true.
    // Durante 7.1-7.3 esto es opcional; 7.4 lo hace obligatorio para is_super_admin.
    const require2FA = process.env.SUPER_REQUIRE_2FA === 'true';
    if (require2FA && profile.super_2fa_enabled) {
        if (!request.user.super_2fa_verified) {
            return reply.status(403).send({ error: 'Requiere verificación 2FA.' });
        }
    }

    request.superAdmin = profile;
    return;
}

// Helper: registrar una acción del super-admin en super_admin_actions.
// Llamado desde las rutas de super tras una mutación.
export async function logSuperAction({
    request, action, target_type, target_id = null, payload_before = null,
    payload_after = null, reason = null
}) {
    try {
        await unscoped(() =>
            prisma.superAdminAction.create({
                data: {
                    super_admin_id: request.user.id,
                    action,
                    target_type,
                    target_id,
                    payload_before,
                    payload_after,
                    reason,
                    ip_address: request.ip || null,
                    user_agent: request.headers['user-agent'] || null,
                },
            })
        );
    } catch (err) {
        // No bloqueamos la operación original si el log falla, pero lo escupimos.
        console.error('[super-action-log] failed:', err.message);
    }
}
