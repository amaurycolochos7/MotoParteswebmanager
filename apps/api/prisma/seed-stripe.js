// One-shot (idempotent) script that creates Stripe products + prices matching
// our Plan catalog and stores the generated IDs back on the Plan rows.
//
// Run with:
//   STRIPE_SECRET_KEY=sk_test_... node prisma/seed-stripe.js
//
// Re-running is safe: we look up existing products by metadata.plan_code
// before creating new ones. Prices are immutable in Stripe, so if the price
// changed we create a new price and archive the old one.

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient({ log: ['warn', 'error'] });
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
    console.error('STRIPE_SECRET_KEY env var is required.');
    process.exit(1);
}
const stripe = new Stripe(stripeKey);

const PLAN_CODES_TO_SYNC = ['starter', 'pro', 'business']; // free + flagship skip Stripe

// `products.search` requires the search-API feature flag on the Stripe
// account; on fresh test accounts it can 400. `products.list` + filter in
// memory is universally available and fast enough for a handful of plans.
async function findProduct(planCode) {
    let starting_after;
    while (true) {
        const page = await stripe.products.list({ limit: 100, starting_after });
        for (const p of page.data) {
            if (p.metadata?.plan_code === planCode && p.metadata?.app === 'motopartes') return p;
        }
        if (!page.has_more) return null;
        starting_after = page.data[page.data.length - 1].id;
    }
}

async function upsertProduct(plan) {
    let product = await findProduct(plan.code);
    if (product) {
        if (product.name !== plan.name) {
            product = await stripe.products.update(product.id, { name: plan.name });
        }
        console.log(`  product ${plan.code}: reused ${product.id}`);
    } else {
        product = await stripe.products.create({
            name: plan.name,
            description: `Plan ${plan.name} de MotoPartes`,
            metadata: { plan_code: plan.code, app: 'motopartes' },
        });
        console.log(`  product ${plan.code}: created ${product.id}`);
    }
    return product;
}

async function findPrice(productId, intervalMonths, unitAmount) {
    const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 100,
    });
    return prices.data.find((p) =>
        p.currency === 'mxn' &&
        p.unit_amount === unitAmount &&
        p.recurring?.interval === (intervalMonths === 12 ? 'year' : 'month') &&
        p.recurring?.interval_count === 1
    ) || null;
}

async function upsertPrice(product, interval, unitAmountMxn) {
    const unitAmountCents = Math.round(unitAmountMxn * 100);
    const existing = await findPrice(product.id, interval === 'year' ? 12 : 1, unitAmountCents);
    if (existing) {
        console.log(`    price ${interval}: reused ${existing.id} ($${unitAmountMxn} MXN)`);
        return existing;
    }
    const price = await stripe.prices.create({
        product: product.id,
        currency: 'mxn',
        unit_amount: unitAmountCents,
        recurring: { interval, interval_count: 1 },
        metadata: { plan_code: product.metadata.plan_code, interval, app: 'motopartes' },
    });
    console.log(`    price ${interval}: created ${price.id} ($${unitAmountMxn} MXN)`);
    return price;
}

async function main() {
    console.log('— Seeding Stripe products/prices —');
    const plans = await prisma.plan.findMany({
        where: { code: { in: PLAN_CODES_TO_SYNC } },
        orderBy: { display_order: 'asc' },
    });
    for (const plan of plans) {
        console.log(`\n${plan.name} (${plan.code})`);
        const product = await upsertProduct(plan);
        const monthly = await upsertPrice(product, 'month', plan.price_mxn_monthly);
        const yearly = await upsertPrice(product, 'year', plan.price_mxn_yearly);
        await prisma.plan.update({
            where: { id: plan.id },
            data: {
                stripe_price_id_monthly: monthly.id,
                stripe_price_id_yearly: yearly.id,
            },
        });
    }
    console.log('\n✓ Stripe sync complete.');
}

main()
    .catch((e) => {
        console.error('✗ seed-stripe failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
