import prisma, { workspaceContext } from '../lib/prisma.js';

// Fastify preHandler hook that resolves the active workspace for the request,
// validates that the authenticated user is a member, and opens the
// AsyncLocalStorage context that the Prisma auto-scoping extension reads.
//
// Workspace resolution order:
//   1) `x-workspace-id` HTTP header, if present.
//   2) The `workspace_id` claim from the JWT (set at login time when the
//      user has exactly one membership, or after the user selects one).
//   3) The user's single membership, if they only have one.
//
// The handler MUST run AFTER `authenticate` so request.user is set.
//
// Usage in a route file:
//   fastify.register(async (inst) => {
//     inst.addHook('preHandler', authenticate);
//     inst.addHook('preHandler', resolveWorkspace);
//     inst.get('/', handler);
//   });
// or per-route:
//   { preHandler: [authenticate, resolveWorkspace] }

export async function resolveWorkspace(request, reply) {
    if (!request.user || !request.user.id) {
        return reply.status(401).send({ error: 'No autorizado' });
    }

    const headerWs = request.headers['x-workspace-id'];
    const claimWs = request.user.workspace_id;
    const memberships = request.user.memberships || [];

    let workspaceId = null;
    if (typeof headerWs === 'string' && headerWs.length > 0) {
        workspaceId = headerWs;
    } else if (claimWs) {
        workspaceId = claimWs;
    } else if (memberships.length === 1) {
        workspaceId = memberships[0].workspace_id;
    }

    if (!workspaceId) {
        return reply.status(400).send({
            error: 'Workspace no especificado. Incluye el header x-workspace-id.',
            availableWorkspaces: memberships,
        });
    }

    // Defensive: confirm the user is actually a member of the resolved
    // workspace. Even if memberships is in the JWT we double-check the DB so
    // a revoked membership takes effect within the JWT's 7-day window.
    const membership = await prisma.$transaction(async (tx) => {
        return workspaceContext.run({ workspaceId: null }, async () => {
            // Run the membership lookup OUTSIDE of any workspace scope — otherwise
            // the auto-scoping extension would scope the query to an empty/missing
            // workspace and the membership would never be found.
            return tx.membership.findUnique({
                where: {
                    workspace_id_profile_id: {
                        workspace_id: workspaceId,
                        profile_id: request.user.id,
                    },
                },
                include: { workspace: true },
            });
        });
    });

    if (!membership || !membership.workspace?.is_active) {
        return reply.status(403).send({ error: 'No tienes acceso a este workspace.' });
    }

    request.workspace = membership.workspace;
    request.workspaceRole = membership.role;
    request.workspacePermissions = membership.permissions || {};

    // Open the ALS context so Prisma queries in this request chain get
    // auto-scoped. We DON'T use .run() here because we need the context to
    // live for the rest of the request. Fastify's request lifecycle runs
    // inside a single ALS enterWith call — each request already runs in its
    // own async context, so enterWith is the right primitive.
    workspaceContext.enterWith({ workspaceId });
}

// Require a specific workspace role (owner | admin | mechanic | auxiliary).
export function requireRole(...allowed) {
    return async function (request, reply) {
        if (!request.workspaceRole) {
            return reply.status(403).send({ error: 'No tienes acceso a este workspace.' });
        }
        if (!allowed.includes(request.workspaceRole)) {
            return reply.status(403).send({
                error: `Acceso denegado: se requiere rol ${allowed.join(' o ')}`,
            });
        }
    };
}
