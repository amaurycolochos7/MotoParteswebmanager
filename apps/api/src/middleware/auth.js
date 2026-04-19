import jwt from 'jsonwebtoken';

// JWT_SECRET should always be set via env. In production we log a loud warning
// if the fallback is being used; the fallback exists ONLY so that an unset env
// does not instantly tumble the API. Rotate and set JWT_SECRET in Dokploy as a
// follow-up — this will log every user out once, by design.
const JWT_FALLBACK = 'motopartes-secret-key-change-in-production';
const JWT_SECRET = process.env.JWT_SECRET || JWT_FALLBACK;
if (JWT_SECRET === JWT_FALLBACK) {
    console.warn('[AUTH] ⚠️ JWT_SECRET env var is not set — using the legacy default. Set JWT_SECRET in Dokploy to rotate it.');
}

// `user` may include `memberships` (array of {workspace_id, role}) and a
// `workspace_id` shortcut set when the user only has one membership. The
// payload is intentionally small — Fastify logs the decoded JWT at trace
// level, and workspace permissions are looked up fresh on each request by
// resolveWorkspace.
export function generateToken(user, options = {}) {
    const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
    };
    if (Array.isArray(user.memberships)) payload.memberships = user.memberships;
    if (user.workspace_id) payload.workspace_id = user.workspace_id;
    // Fase 7 — impersonation & super claims
    if (user.impersonation_session_id) payload.impersonation_session_id = user.impersonation_session_id;
    if (user.impersonating_super_id)   payload.impersonating_super_id   = user.impersonating_super_id;
    if (user.is_super_admin)           payload.is_super_admin           = true;
    if (user.super_2fa_verified)       payload.super_2fa_verified       = true;
    return jwt.sign(payload, JWT_SECRET, { expiresIn: options.expiresIn || '7d' });
}

export function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

// Fastify hook for authentication
export async function authenticate(request, reply) {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'No autorizado' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);
        request.user = decoded;
    } catch (err) {
        return reply.status(401).send({ error: 'Token inválido' });
    }
}

// Check admin role
export async function requireAdmin(request, reply) {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Acceso denegado: se requiere rol admin' });
    }
}
