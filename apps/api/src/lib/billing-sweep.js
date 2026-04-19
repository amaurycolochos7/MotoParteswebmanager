import prisma, { workspaceContext } from './prisma.js';

// Nightly (or hourly in prod) sweep that enforces billing policy:
//   1) Trial expired with no Stripe subscription → downgrade to Free.
//   2) Subscription past_due with 3+ FailedPayment rows in the last 7 days
//      → downgrade to Free + mark subscription canceled.
//   3) Optionally prune BillingEvent > 90 days old.
//
// The sweep is safe to call repeatedly (idempotent) and can be triggered
// from setInterval inside the API process, from a cron, or via a manual
// `docker exec api node scripts/billing-sweep.js` invocation.

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

async function getFreePlan() {
    return unscoped(() => prisma.plan.findUnique({ where: { code: 'free' } }));
}

export async function expireTrials() {
    const now = new Date();
    const free = await getFreePlan();
    if (!free) return { downgraded: 0 };

    const expired = await unscoped(() =>
        prisma.workspace.findMany({
            where: {
                subscription_status: 'trialing',
                trial_ends_at: { lte: now },
                is_flagship: false,
            },
            include: { subscription: true },
        })
    );

    let downgraded = 0;
    for (const ws of expired) {
        // Skip workspaces that actually have a paid Stripe subscription.
        if (ws.subscription?.stripe_subscription_id && ws.subscription.status === 'active') continue;
        await unscoped(() =>
            prisma.$transaction(async (tx) => {
                await tx.workspace.update({
                    where: { id: ws.id },
                    data: { plan_id: free.id, subscription_status: 'free', trial_ends_at: null },
                });
                if (ws.subscription) {
                    await tx.subscription.update({
                        where: { id: ws.subscription.id },
                        data: { plan_id: free.id, status: 'free' },
                    });
                }
                await tx.auditLog.create({
                    data: {
                        workspace_id: ws.id,
                        event: 'billing.trial_expired',
                        payload: { downgraded_to: 'free' },
                    },
                });
            })
        );
        downgraded += 1;
    }
    return { downgraded };
}

export async function enforceDunning() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const free = await getFreePlan();
    if (!free) return { downgraded: 0 };

    // Find workspaces that are past_due and have 3+ failures in 7 days.
    const candidates = await unscoped(() =>
        prisma.workspace.findMany({
            where: { subscription_status: 'past_due', is_flagship: false },
        })
    );

    let downgraded = 0;
    for (const ws of candidates) {
        const failCount = await unscoped(() =>
            prisma.failedPayment.count({
                where: { workspace_id: ws.id, created_at: { gte: sevenDaysAgo } },
            })
        );
        if (failCount < 3) continue;

        await unscoped(() =>
            prisma.$transaction(async (tx) => {
                await tx.workspace.update({
                    where: { id: ws.id },
                    data: { plan_id: free.id, subscription_status: 'canceled_dunning' },
                });
                await tx.subscription.updateMany({
                    where: { workspace_id: ws.id },
                    data: { plan_id: free.id, status: 'canceled', canceled_at: now },
                });
                await tx.auditLog.create({
                    data: {
                        workspace_id: ws.id,
                        event: 'billing.dunning_downgrade',
                        payload: { fail_count_last_7d: failCount, downgraded_to: 'free' },
                    },
                });
            })
        );
        downgraded += 1;
    }
    return { downgraded };
}

export async function pruneOldEvents() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const { count } = await unscoped(() =>
        prisma.billingEvent.deleteMany({ where: { created_at: { lt: cutoff } } })
    );
    return { deleted: count };
}

// Fase 7 — Revierte a Free los workspaces con plan manual vencido.
// Se aplica a subscripciones con `source='manual'` y `manual_expires_at <= now`.
// Los workspaces flagship NO se tocan (no tienen expiry).
export async function expireManualPlans() {
    const now = new Date();
    const free = await getFreePlan();
    if (!free) return { downgraded: 0 };

    const expired = await unscoped(() =>
        prisma.subscription.findMany({
            where: {
                source: 'manual',
                manual_expires_at: { lte: now, not: null },
            },
            include: { workspace: true },
        })
    );

    let downgraded = 0;
    for (const sub of expired) {
        if (sub.workspace?.is_flagship) continue;
        await unscoped(() =>
            prisma.$transaction(async (tx) => {
                await tx.subscription.update({
                    where: { id: sub.id },
                    data: {
                        plan_id: free.id,
                        status: 'free',
                        source: 'stripe', // vuelve al carril normal
                        manual_assigned_by: null,
                        manual_expires_at: null,
                        manual_note: null,
                    },
                });
                await tx.workspace.update({
                    where: { id: sub.workspace_id },
                    data: { plan_id: free.id, subscription_status: 'free' },
                });
                await tx.auditLog.create({
                    data: {
                        workspace_id: sub.workspace_id,
                        event: 'billing.manual_plan_expired',
                        payload: { was_note: sub.manual_note, was_expires_at: sub.manual_expires_at },
                    },
                });
            })
        );
        downgraded += 1;
    }
    return { downgraded };
}

export async function runBillingSweep() {
    const start = Date.now();
    const trials = await expireTrials();
    const dunning = await enforceDunning();
    const manual = await expireManualPlans();
    const pruned = await pruneOldEvents();
    const durationMs = Date.now() - start;
    const result = { trials, dunning, manual, pruned, durationMs };
    console.log(`[billing-sweep] ${JSON.stringify(result)}`);
    return result;
}

// If called directly, run once and exit.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
    runBillingSweep()
        .catch((e) => {
            console.error('[billing-sweep] FAILED:', e);
            process.exit(1);
        })
        .finally(() => prisma.$disconnect());
}
