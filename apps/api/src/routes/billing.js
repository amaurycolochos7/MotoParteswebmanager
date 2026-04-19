import prisma, { workspaceContext } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace, requireRole } from '../middleware/workspace.js';
import { getStripe, hasStripeKey, getWebhookSecret } from '../lib/stripe.js';
import {
    recordStripeEvent,
    markStripeEventProcessed,
    recordFailedPayment,
} from '../lib/billing.js';

function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

const PUBLIC_APP_URL = () => process.env.PUBLIC_APP_URL || 'https://motopartes.cloud';

// Find or create a Stripe Customer for a workspace, store the id on the
// Workspace row. Called lazily from checkout/portal.
async function ensureStripeCustomer(workspace, ownerEmail) {
    const stripe = getStripe();
    if (workspace.stripe_customer_id) {
        try {
            const c = await stripe.customers.retrieve(workspace.stripe_customer_id);
            if (!c.deleted) return c;
        } catch (e) {
            // fall through and recreate
        }
    }
    const customer = await stripe.customers.create({
        email: ownerEmail,
        name: workspace.name,
        metadata: {
            workspace_id: workspace.id,
            workspace_slug: workspace.slug,
            app: 'motopartes',
        },
    });
    await unscoped(() =>
        prisma.workspace.update({
            where: { id: workspace.id },
            data: { stripe_customer_id: customer.id },
        })
    );
    return customer;
}

export default async function billingRoutes(fastify) {
    // ─────────────────────────────────────────────────────────────────
    // WEBHOOK — public, signature-verified. Must be registered BEFORE the
    // global JSON body parser because Stripe needs the raw bytes.
    // Fastify already parses JSON by default; we override with a contentType
    // parser just for this route to keep the buffer intact.
    // ─────────────────────────────────────────────────────────────────
    fastify.post('/webhook', {
        config: { rawBody: true },
        preValidation: async (request, reply, done) => {
            // Ensure rawBody is populated regardless of Fastify version.
            if (!request.rawBody && request.body) {
                // Body already parsed — rebuild raw from string. Not ideal but
                // the addContentTypeParser below should prevent this path.
                return reply.status(400).send({ error: 'Raw body not captured' });
            }
            done?.();
        },
    }, async (request, reply) => {
        if (!hasStripeKey() || !getWebhookSecret()) {
            return reply.status(503).send({ error: 'Billing not configured' });
        }
        const sig = request.headers['stripe-signature'];
        if (!sig) return reply.status(400).send({ error: 'Missing stripe-signature header' });

        const raw = request.rawBody;
        if (!raw) return reply.status(400).send({ error: 'Raw body missing' });

        let event;
        try {
            event = getStripe().webhooks.constructEvent(raw, sig, getWebhookSecret());
        } catch (err) {
            console.warn('[billing] webhook signature failed:', err.message);
            return reply.status(400).send({ error: `Webhook Error: ${err.message}` });
        }

        // Idempotency: store the event, bail if we've already handled it.
        const isNew = await recordStripeEvent(event).catch(() => false);
        if (!isNew) return reply.send({ received: true, duplicate: true });

        try {
            await handleStripeEvent(event);
            await markStripeEventProcessed(event.id);
        } catch (err) {
            console.error('[billing] event handler failed:', err);
            await markStripeEventProcessed(event.id, err.message);
            return reply.status(500).send({ error: 'handler_failed' });
        }
        return reply.send({ received: true });
    });

    // ─────────────────────────────────────────────────────────────────
    // PUBLIC: list plans — reuses /api/workspaces/plans but exposed here
    // for convenience from the billing page.
    // ─────────────────────────────────────────────────────────────────
    fastify.get('/plans', async () => {
        return unscoped(() =>
            prisma.plan.findMany({
                where: { is_public: true, is_active: true },
                orderBy: { display_order: 'asc' },
            })
        );
    });

    // ─────────────────────────────────────────────────────────────────
    // AUTH'D ROUTES — require login + active workspace + owner role.
    // ─────────────────────────────────────────────────────────────────
    fastify.register(async function authed(app) {
        app.addHook('preHandler', authenticate);
        app.addHook('preHandler', resolveWorkspace);

        // GET /api/billing/status — current plan, trial, Stripe sub status,
        // next invoice date, current-period usage counter.
        app.get('/status', async (request) => {
            const ws = await unscoped(() =>
                prisma.workspace.findUnique({
                    where: { id: request.workspace.id },
                    include: { plan: true, subscription: { include: { plan: true } } },
                })
            );
            const period = new Date().toISOString().slice(0, 7);
            const counter = await unscoped(() =>
                prisma.usageCounter.findUnique({
                    where: { workspace_id_period: { workspace_id: ws.id, period } },
                })
            );
            return {
                plan: ws.plan ? { code: ws.plan.code, name: ws.plan.name, features: ws.plan.features } : null,
                subscription_status: ws.subscription_status,
                trial_ends_at: ws.trial_ends_at,
                is_flagship: ws.is_flagship,
                subscription: ws.subscription,
                usage: {
                    period,
                    orders_count: counter?.orders_count || 0,
                    whatsapp_messages: counter?.whatsapp_messages || 0,
                    storage_bytes: counter?.storage_bytes?.toString?.() || '0',
                },
            };
        });

        // POST /api/billing/checkout — owner-only.
        // Body: { plan_code: 'starter'|'pro'|'business', interval: 'month'|'year' }
        // Returns { url } to redirect the browser to Stripe's hosted checkout.
        app.post('/checkout', { preHandler: requireRole('owner') }, async (request, reply) => {
            if (!hasStripeKey()) return reply.status(503).send({ error: 'Stripe no está configurado todavía.' });

            const { plan_code, interval } = request.body || {};
            if (!plan_code || !['month', 'year'].includes(interval)) {
                return reply.status(400).send({ error: 'plan_code y interval (month|year) son requeridos.' });
            }
            if (request.workspace.is_flagship) {
                return reply.status(409).send({ error: 'Este taller es flagship y no necesita suscripción.' });
            }

            const plan = await unscoped(() => prisma.plan.findUnique({ where: { code: plan_code } }));
            if (!plan) return reply.status(404).send({ error: 'Plan no encontrado.' });
            if (plan.code === 'free' || plan.code === 'flagship') {
                return reply.status(400).send({ error: 'No hay checkout para ese plan.' });
            }
            const priceId = interval === 'year' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
            if (!priceId) {
                return reply.status(500).send({ error: 'El plan no tiene precio configurado en Stripe. Ejecuta prisma/seed-stripe.js.' });
            }

            // Look up owner's email for pre-fill.
            const owner = await unscoped(() =>
                prisma.profile.findUnique({ where: { id: request.user.id } })
            );
            const customer = await ensureStripeCustomer(request.workspace, owner?.email);

            const appUrl = PUBLIC_APP_URL();
            const stripe = getStripe();
            const session = await stripe.checkout.sessions.create({
                mode: 'subscription',
                customer: customer.id,
                line_items: [{ price: priceId, quantity: 1 }],
                success_url: `${appUrl}/admin/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${appUrl}/admin/billing?status=cancel`,
                metadata: {
                    workspace_id: request.workspace.id,
                    plan_code: plan.code,
                    interval,
                },
                subscription_data: {
                    metadata: {
                        workspace_id: request.workspace.id,
                        plan_code: plan.code,
                    },
                },
                allow_promotion_codes: true,
                automatic_tax: { enabled: false },
            });

            await unscoped(() =>
                prisma.auditLog.create({
                    data: {
                        workspace_id: request.workspace.id,
                        profile_id: request.user.id,
                        event: 'billing.checkout_started',
                        payload: { plan_code: plan.code, interval, session_id: session.id },
                    },
                })
            );

            return { url: session.url, id: session.id };
        });

        // POST /api/billing/portal — owner-only. Returns a Stripe Customer
        // Portal session URL so the user can manage cards / invoices / cancel.
        app.post('/portal', { preHandler: requireRole('owner') }, async (request, reply) => {
            if (!hasStripeKey()) return reply.status(503).send({ error: 'Stripe no está configurado.' });
            if (!request.workspace.stripe_customer_id) {
                return reply.status(400).send({ error: 'Aún no tienes una suscripción activa.' });
            }
            const stripe = getStripe();
            const appUrl = PUBLIC_APP_URL();
            const session = await stripe.billingPortal.sessions.create({
                customer: request.workspace.stripe_customer_id,
                return_url: `${appUrl}/admin/billing`,
            });
            return { url: session.url };
        });

        // POST /api/billing/cancel — owner-only shortcut: cancels the Stripe
        // subscription at the end of the current period (graceful).
        app.post('/cancel', { preHandler: requireRole('owner') }, async (request, reply) => {
            if (!hasStripeKey()) return reply.status(503).send({ error: 'Stripe no está configurado.' });
            const sub = await unscoped(() =>
                prisma.subscription.findUnique({ where: { workspace_id: request.workspace.id } })
            );
            if (!sub?.stripe_subscription_id) {
                return reply.status(400).send({ error: 'No hay suscripción activa que cancelar.' });
            }
            const stripe = getStripe();
            const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
                cancel_at_period_end: true,
            });
            await unscoped(() =>
                prisma.subscription.update({
                    where: { id: sub.id },
                    data: {
                        cancel_at: updated.cancel_at ? new Date(updated.cancel_at * 1000) : null,
                    },
                })
            );
            return { success: true, cancel_at: updated.cancel_at };
        });

        // POST /api/billing/resume — owner-only. Un-schedules a pending cancel.
        app.post('/resume', { preHandler: requireRole('owner') }, async (request, reply) => {
            if (!hasStripeKey()) return reply.status(503).send({ error: 'Stripe no está configurado.' });
            const sub = await unscoped(() =>
                prisma.subscription.findUnique({ where: { workspace_id: request.workspace.id } })
            );
            if (!sub?.stripe_subscription_id) {
                return reply.status(400).send({ error: 'No hay suscripción activa.' });
            }
            const stripe = getStripe();
            await stripe.subscriptions.update(sub.stripe_subscription_id, {
                cancel_at_period_end: false,
            });
            await unscoped(() =>
                prisma.subscription.update({
                    where: { id: sub.id },
                    data: { cancel_at: null, canceled_at: null },
                })
            );
            return { success: true };
        });
    });
}

// ─── Webhook dispatcher ───────────────────────────────────────────────
async function handleStripeEvent(event) {
    const obj = event.data?.object || {};
    switch (event.type) {
        case 'checkout.session.completed':
            return handleCheckoutCompleted(obj);
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
            return handleSubscriptionUpdated(obj);
        case 'customer.subscription.deleted':
            return handleSubscriptionDeleted(obj);
        case 'invoice.paid':
            return handleInvoicePaid(obj);
        case 'invoice.payment_failed':
            return handleInvoiceFailed(obj);
        default:
            // Silently ignore events we don't care about — still recorded in
            // BillingEvent for debugging.
            return;
    }
}

async function findWorkspaceByCustomer(customerId) {
    return unscoped(() =>
        prisma.workspace.findFirst({ where: { stripe_customer_id: customerId } })
    );
}

async function handleCheckoutCompleted(session) {
    const wsId = session.metadata?.workspace_id;
    if (!wsId) return;
    await unscoped(() =>
        prisma.auditLog.create({
            data: {
                workspace_id: wsId,
                event: 'billing.checkout_completed',
                payload: {
                    plan_code: session.metadata?.plan_code,
                    interval: session.metadata?.interval,
                    amount_total: session.amount_total,
                    subscription_id: session.subscription,
                },
            },
        })
    );
    // Subscription row is hydrated by customer.subscription.created which
    // follows immediately, so no direct DB mutation here.
}

async function handleSubscriptionUpdated(sub) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    const ws = await findWorkspaceByCustomer(customerId);
    if (!ws) return;

    const planCode = sub.metadata?.plan_code;
    let planId = null;
    if (planCode) {
        const plan = await unscoped(() => prisma.plan.findUnique({ where: { code: planCode } }));
        planId = plan?.id || null;
    }

    await unscoped(() =>
        prisma.subscription.upsert({
            where: { workspace_id: ws.id },
            update: {
                plan_id: planId || undefined,
                stripe_subscription_id: sub.id,
                status: sub.status,
                current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
                current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
                cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
                canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
            },
            create: {
                workspace_id: ws.id,
                plan_id: planId || ws.plan_id,
                stripe_subscription_id: sub.id,
                status: sub.status,
                current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
                current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
            },
        })
    );

    // Sync workspace-level denormalized plan + status.
    await unscoped(() =>
        prisma.workspace.update({
            where: { id: ws.id },
            data: {
                plan_id: planId || ws.plan_id,
                subscription_status: sub.status,
                trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
            },
        })
    );
}

async function handleSubscriptionDeleted(sub) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    const ws = await findWorkspaceByCustomer(customerId);
    if (!ws) return;
    const freePlan = await unscoped(() => prisma.plan.findUnique({ where: { code: 'free' } }));
    await unscoped(() =>
        prisma.$transaction(async (tx) => {
            await tx.workspace.update({
                where: { id: ws.id },
                data: {
                    plan_id: freePlan?.id || null,
                    subscription_status: 'canceled',
                },
            });
            await tx.subscription.update({
                where: { workspace_id: ws.id },
                data: {
                    status: 'canceled',
                    canceled_at: new Date(),
                    plan_id: freePlan?.id || ws.plan_id,
                },
            });
            await tx.auditLog.create({
                data: {
                    workspace_id: ws.id,
                    event: 'billing.subscription_canceled',
                    payload: { plan_downgraded_to: freePlan?.code || null },
                },
            });
        })
    );
}

async function handleInvoicePaid(invoice) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    const ws = await findWorkspaceByCustomer(customerId);
    if (!ws) return;
    await unscoped(() =>
        prisma.auditLog.create({
            data: {
                workspace_id: ws.id,
                event: 'billing.invoice_paid',
                payload: {
                    invoice_id: invoice.id,
                    amount_paid: invoice.amount_paid,
                    currency: invoice.currency,
                    hosted_url: invoice.hosted_invoice_url,
                },
            },
        })
    );
    // Reset usage counter for the new period (best-effort; the nightly cron
    // also covers this).
    const period = new Date().toISOString().slice(0, 7);
    await unscoped(async () => {
        const existing = await prisma.usageCounter.findUnique({
            where: { workspace_id_period: { workspace_id: ws.id, period } },
        });
        if (!existing) {
            await prisma.usageCounter.create({
                data: { workspace_id: ws.id, period },
            });
        }
    });
}

async function handleInvoiceFailed(invoice) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    const ws = await findWorkspaceByCustomer(customerId);
    if (!ws) return;
    await recordFailedPayment(ws.id, {
        stripe_invoice_id: invoice.id,
        stripe_payment_intent: invoice.payment_intent,
        amount_cents: invoice.amount_due,
        currency: invoice.currency,
        reason: invoice.last_finalization_error?.message || invoice.billing_reason || 'payment_failed',
    });
    await unscoped(() =>
        prisma.workspace.update({
            where: { id: ws.id },
            data: { subscription_status: 'past_due' },
        })
    );
    await unscoped(() =>
        prisma.auditLog.create({
            data: {
                workspace_id: ws.id,
                event: 'billing.invoice_failed',
                payload: {
                    invoice_id: invoice.id,
                    amount_due: invoice.amount_due,
                    currency: invoice.currency,
                },
            },
        })
    );
    // Dunning actual downgrade happens in src/lib/dunning.js, triggered by
    // the nightly cron — keeps the policy (3 fails in 7 days) in one place.
}
