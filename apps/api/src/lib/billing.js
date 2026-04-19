import prisma, { workspaceContext } from './prisma.js';

// Helpers around billing + plan limit enforcement. None of these open a
// Stripe connection — they only read/write local DB state.

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

// yyyy-mm key used as the period on UsageCounter.
export function currentPeriod(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

// Returns the plan features for a workspace. Falls back to Free if the
// workspace has no plan attached (defensive).
export async function getPlanFeatures(workspaceId) {
    const ws = await unscoped(() =>
        prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { plan: true, subscription: true },
        })
    );
    if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
    const planFeatures = ws.plan?.features || {};
    return {
        workspace: ws,
        plan: ws.plan,
        features: planFeatures,
        isFlagship: ws.is_flagship === true,
        status: ws.subscription_status,
    };
}

// Fetch or create the current-period UsageCounter row for a workspace.
export async function getOrCreateCounter(workspaceId, period = currentPeriod()) {
    return unscoped(async () => {
        const existing = await prisma.usageCounter.findUnique({
            where: { workspace_id_period: { workspace_id: workspaceId, period } },
        });
        if (existing) return existing;
        return prisma.usageCounter.create({
            data: { workspace_id: workspaceId, period },
        });
    });
}

// Increment a counter column by N (default 1). Returns the updated row.
export async function incrementCounter(workspaceId, column, by = 1) {
    const period = currentPeriod();
    await getOrCreateCounter(workspaceId, period);
    return unscoped(() =>
        prisma.usageCounter.update({
            where: { workspace_id_period: { workspace_id: workspaceId, period } },
            data: { [column]: { increment: by } },
        })
    );
}

// Throws a PlanLimitError if the workspace has already reached the limit for
// `column` (maps to the plan feature name below). Called at the edge of
// every relevant create endpoint (orders, whatsapp messages, photos).
//
// `flagship` workspaces are exempt from all limits — that's the contract with
// motoblaker.
const COLUMN_TO_FEATURE = {
    orders_count: 'orders_per_month',
    whatsapp_messages: 'whatsapp_messages',
    storage_bytes: 'storage_gb',
};

export class PlanLimitError extends Error {
    constructor(limit, used, feature) {
        super(`Límite del plan alcanzado (${feature}: ${used}/${limit}). Considera cambiar tu plan.`);
        this.code = 'PLAN_LIMIT';
        this.status = 402;
        this.limit = limit;
        this.used = used;
        this.feature = feature;
    }
}

export async function assertWithinLimit(workspaceId, column) {
    const { features, isFlagship } = await getPlanFeatures(workspaceId);
    if (isFlagship) return; // perpetual cortesía

    const feature = COLUMN_TO_FEATURE[column];
    const limit = feature ? features[feature] : null;
    if (limit === null || limit === undefined) return; // unlimited on this plan

    // Special case: storage_gb is a GB number, counter is bytes.
    if (column === 'storage_bytes') {
        const bytesLimit = limit * 1024 * 1024 * 1024;
        const counter = await getOrCreateCounter(workspaceId);
        const used = Number(counter.storage_bytes || 0);
        if (used >= bytesLimit) {
            throw new PlanLimitError(limit, (used / (1024 ** 3)).toFixed(2) + ' GB', feature);
        }
        return;
    }

    const counter = await getOrCreateCounter(workspaceId);
    const used = Number(counter[column] || 0);
    if (used >= limit) throw new PlanLimitError(limit, used, feature);
}

// Called after a successful create — bumps the counter by 1 (or `by`).
// Fire-and-forget from the route: we don't await failures, since we don't
// want a counter hiccup to roll back an already-committed order.
export function incrementUsageAsync(workspaceId, column, by = 1) {
    incrementCounter(workspaceId, column, by).catch((err) => {
        console.warn(`[billing] failed to increment ${column} for ${workspaceId}:`, err.message);
    });
}

// Persist a Stripe event to our BillingEvent table if we haven't seen it
// before. Returns true if we just inserted, false if it was a duplicate.
// Called from the webhook BEFORE processing to avoid double-handling.
export async function recordStripeEvent(event) {
    try {
        await unscoped(() =>
            prisma.billingEvent.create({
                data: {
                    stripe_event_id: event.id,
                    event_type: event.type,
                    payload: event.data?.object || {},
                },
            })
        );
        return true;
    } catch (err) {
        if (err.code === 'P2002') return false; // already seen (unique violation)
        throw err;
    }
}

export async function markStripeEventProcessed(eventId, error = null) {
    await unscoped(() =>
        prisma.billingEvent.updateMany({
            where: { stripe_event_id: eventId },
            data: {
                processed_at: new Date(),
                error: error ? String(error).slice(0, 500) : null,
            },
        })
    );
}

// Record a failed payment for dunning tracking.
export async function recordFailedPayment(workspaceId, data) {
    return unscoped(() =>
        prisma.failedPayment.create({
            data: {
                workspace_id: workspaceId,
                stripe_invoice_id: data.stripe_invoice_id || null,
                stripe_payment_intent: data.stripe_payment_intent || null,
                amount_cents: data.amount_cents || 0,
                currency: data.currency || 'mxn',
                reason: data.reason || null,
            },
        })
    );
}
