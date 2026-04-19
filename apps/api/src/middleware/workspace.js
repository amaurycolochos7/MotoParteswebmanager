import prisma, { workspaceContext } from '../lib/prisma.js';

// Fastify onRequest hook — installs a mutable workspace store on the request's
// async context at the earliest possible point. We use enterWith here because
// onRequest runs in the request's root async chain, so the store propagates
// to every subsequent hook / handler / Prisma call reliably.
//
// The store starts as `{ workspaceId: null }` and is mutated in place by
// resolveWorkspace once the user + workspace are known. Mutation (rather than
// `enterWith` a second time) is essential — calling enterWith again AFTER an
// await boundary in a preHandler is unreliable in Fastify because the
// continuation may not inherit the new store the way enterWith promises.
export function installWorkspaceStore(request) {
    workspaceContext.enterWith({ workspaceId: null });
}

// Fastify preHandler hook that resolves the active workspace for the request,
// validates that the authenticated user is a member, and mutates the
// ALS store installed by installWorkspaceStore so the Prisma auto-scoping
// extension reads the correct workspaceId.
//
// Workspace resolution order:
//   1) `x-workspace-id` HTTP header, if present.
//   2) The `workspace_id` claim from the JWT (set at login time when the
//      user has exactly one membership, or after the user selects one).
//   3) The user's single membership, if they only have one.
//
// The handler MUST run AFTER `authenticate` so request.user is set, and
// AFTER installWorkspaceStore so the store exists.
//
// Usage per-route:   { preHandler: [authenticate, resolveWorkspace] }
// Usage per-plugin:  inst.addHook('preHandler', resolveWorkspace);

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
    // workspace. Ran UNSCOPED so the auto-scoping extension doesn't filter
    // the membership lookup itself (Membership isn't a scoped model anyway,
    // but if we ever move it, this keeps us safe).
    const membership = await workspaceContext.run({ workspaceId: null }, () =>
        prisma.membership.findUnique({
            where: {
                workspace_id_profile_id: {
                    workspace_id: workspaceId,
                    profile_id: request.user.id,
                },
            },
            include: { workspace: true },
        })
    );

    if (!membership || !membership.workspace?.is_active) {
        return reply.status(403).send({ error: 'No tienes acceso a este workspace.' });
    }

    request.workspace = membership.workspace;
    request.workspaceRole = membership.role;
    request.workspacePermissions = membership.permissions || {};

    // Mutate the store installed by installWorkspaceStore. This is the
    // hot-path that actually powers the Prisma extension filter. Because the
    // store was entered in onRequest, every async continuation spawned by
    // Fastify from this point sees the mutated workspaceId.
    const store = workspaceContext.getStore();
    if (store) {
        store.workspaceId = workspaceId;
    } else {
        // Fall-back: if somehow the onRequest hook didn't run (e.g. a route
        // registered outside the main Fastify instance), install the store
        // on the spot. Not ideal but safer than crashing.
        workspaceContext.enterWith({ workspaceId });
    }
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
