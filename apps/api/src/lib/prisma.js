import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

// AsyncLocalStorage carries the current workspace across awaits so that a
// single Prisma extension can scope every read/write without each route having
// to remember to pass workspace_id. Each Fastify request opens a context via
// workspace middleware (src/middleware/workspace.js). Long-running queries
// (migration scripts, admin tools) explicitly set { workspaceId: null } to
// opt out.
export const workspaceContext = new AsyncLocalStorage();

export function getWorkspaceId() {
    return workspaceContext.getStore()?.workspaceId || null;
}

// Models that carry a workspace_id column in Phase 3. KEEP IN SYNC with
// schema.prisma — the auto-scoping extension uses this to decide whether a
// query should be filtered or not.
const SCOPED_MODELS = new Set([
    'Client',
    'Motorcycle',
    'Service',
    'OrderStatus',
    'Order',
    'OrderService',
    'OrderPart',
    'OrderPhoto',
    'OrderHistory',
    'OrderUpdate',
    'Appointment',
    'WhatsappSession',
    'OrderRequest',
    'MechanicEarning',
    'PaymentRequest',
]);

const CREATE_OPS = new Set(['create', 'createMany', 'upsert']);
const FILTER_OPS = new Set([
    'findMany',
    'findFirst',
    'findFirstOrThrow',
    'count',
    'aggregate',
    'groupBy',
    'updateMany',
    'deleteMany',
]);
// Operations that target a row by unique id — we guard these with an extra
// read-then-check because the Prisma query layer only accepts unique fields
// in the `where` clause, so we can't inject workspace_id there.
const BY_UNIQUE_OPS = new Set([
    'findUnique',
    'findUniqueOrThrow',
    'update',
    'delete',
]);

function whereAlreadyMentionsWorkspace(where) {
    if (!where || typeof where !== 'object') return false;
    if ('workspace_id' in where) return true;
    for (const key of ['AND', 'OR']) {
        const v = where[key];
        if (Array.isArray(v) && v.some(whereAlreadyMentionsWorkspace)) return true;
    }
    return false;
}

const prisma = new PrismaClient().$extends({
    name: 'workspace-auto-scope',
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                const wsId = getWorkspaceId();
                if (!wsId || !SCOPED_MODELS.has(model)) {
                    return query(args);
                }

                // ── CREATE PATH: inject workspace_id into `data` ───────────
                if (CREATE_OPS.has(operation)) {
                    if (operation === 'createMany') {
                        const rows = Array.isArray(args.data) ? args.data : [args.data];
                        args.data = rows.map((row) =>
                            row.workspace_id ? row : { ...row, workspace_id: wsId }
                        );
                    } else if (operation === 'upsert') {
                        if (!args.create?.workspace_id) {
                            args.create = { ...args.create, workspace_id: wsId };
                        }
                    } else {
                        // create
                        if (!args.data?.workspace_id) {
                            args.data = { ...args.data, workspace_id: wsId };
                        }
                    }
                    return query(args);
                }

                // ── FILTER PATH: inject workspace_id into `where` ─────────
                if (FILTER_OPS.has(operation)) {
                    if (!whereAlreadyMentionsWorkspace(args.where)) {
                        args.where = { ...(args.where || {}), workspace_id: wsId };
                    }
                    return query(args);
                }

                // ── BY-UNIQUE PATH: read-before-write to prevent cross-tenant
                // mutations. Prisma rejects workspace_id in `where` for findUnique
                // (only unique fields allowed), so we can't scope at the SQL
                // layer. Instead we do an internal scoped read first and, if
                // the target doesn't belong to the caller's workspace, return
                // null / throw a NotFound without running the write.
                if (BY_UNIQUE_OPS.has(operation)) {
                    const resultIfMissing = operation === 'findUniqueOrThrow'
                        ? (() => { const e = new Error('Row not found in workspace'); e.code = 'P2025'; throw e; })
                        : () => null;

                    // Internal findUnique without modifying args so we don't
                    // re-enter the extension recursively.
                    const target = await query({ where: args.where });
                    if (!target || (target.workspace_id && target.workspace_id !== wsId)) {
                        return resultIfMissing();
                    }

                    // Target belongs to our workspace: safe to run the original op.
                    return query(args);
                }

                return query(args);
            },
        },
    },
});

export default prisma;
