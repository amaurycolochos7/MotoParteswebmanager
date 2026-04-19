// Phase 3 data migration: single-tenant → multi-tenant.
//
// Safe to re-run — everything is idempotent. The script:
//   1) Seeds Plan rows (free / starter / pro / business / flagship).
//   2) Creates the flagship workspace "motopartes" if it doesn't exist and
//      attaches it to the flagship Plan (is_public=false, no limits).
//   3) Attaches every existing Profile to the flagship workspace as a
//      Membership with a role inferred from Profile.role.
//   4) Back-fills `workspace_id` on every row of the 15 data tables to point
//      at the flagship workspace.
//   5) Writes a summary + sanity counts to stdout.
//
// The script WILL refuse to run if it finds more than one workspace already
// present — that means it's already past the first migration and a second run
// could scramble data. Re-run manually with FORCE=1 only if you know what
// you're doing.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const FLAGSHIP_SLUG = 'motopartes';

const PLANS = [
    {
        code: 'free',
        name: 'Free',
        price_mxn_monthly: 0,
        price_mxn_yearly: 0,
        display_order: 10,
        is_public: true,
        features: {
            orders_per_month: 20,
            users: 2,
            whatsapp_sessions: 1,
            whatsapp_messages: 100,
            storage_gb: 0.5,
            branding: false,
            automations: 0,
            api: false,
            support: 'community',
        },
    },
    {
        code: 'starter',
        name: 'Starter',
        price_mxn_monthly: 299,
        price_mxn_yearly: 2870,
        display_order: 20,
        is_public: true,
        features: {
            orders_per_month: 200,
            users: 5,
            whatsapp_sessions: 1,
            whatsapp_messages: 2000,
            storage_gb: 5,
            branding: 'basic',
            automations: 1,
            api: false,
            support: 'whatsapp',
        },
    },
    {
        code: 'pro',
        name: 'Pro',
        price_mxn_monthly: 599,
        price_mxn_yearly: 5750,
        display_order: 30,
        is_public: true,
        features: {
            orders_per_month: null,
            users: 15,
            whatsapp_sessions: 3,
            whatsapp_messages: 10000,
            storage_gb: 25,
            branding: 'full',
            automations: 5,
            api: false,
            support: 'whatsapp',
        },
    },
    {
        code: 'business',
        name: 'Business',
        price_mxn_monthly: 1499,
        price_mxn_yearly: 14390,
        display_order: 40,
        is_public: true,
        features: {
            orders_per_month: null,
            users: null,
            whatsapp_sessions: 10,
            whatsapp_messages: null,
            storage_gb: 100,
            branding: 'custom-domain',
            automations: null,
            api: true,
            support: 'whatsapp-priority',
        },
    },
    {
        code: 'flagship',
        name: 'Flagship',
        price_mxn_monthly: 0,
        price_mxn_yearly: 0,
        display_order: 99,
        is_public: false,
        features: {
            orders_per_month: null,
            users: null,
            whatsapp_sessions: null,
            whatsapp_messages: null,
            storage_gb: null,
            branding: 'full',
            automations: null,
            api: true,
            support: 'whatsapp-priority',
            legacy_grandfathered: true,
        },
    },
];

function roleForWorkspace(profileRole) {
    if (profileRole === 'admin') return 'owner'; // the only admin is the taller owner in flagship
    if (profileRole === 'admin_mechanic') return 'admin';
    return 'mechanic';
}

async function main() {
    const force = process.env.FORCE === '1';
    const existingWorkspaces = await prisma.workspace.count();
    if (existingWorkspaces > 1 && !force) {
        throw new Error(
            `Refusing to run: ${existingWorkspaces} workspaces already exist. ` +
            `Set FORCE=1 to override (only safe if you really know what you are doing).`
        );
    }

    // ─── 1. PLANS ────────────────────────────────────────────────────
    console.log('— Seeding plans …');
    for (const p of PLANS) {
        await prisma.plan.upsert({
            where: { code: p.code },
            update: {
                name: p.name,
                price_mxn_monthly: p.price_mxn_monthly,
                price_mxn_yearly: p.price_mxn_yearly,
                display_order: p.display_order,
                is_public: p.is_public,
                features: p.features,
                is_active: true,
            },
            create: {
                code: p.code,
                name: p.name,
                price_mxn_monthly: p.price_mxn_monthly,
                price_mxn_yearly: p.price_mxn_yearly,
                display_order: p.display_order,
                is_public: p.is_public,
                features: p.features,
                is_active: true,
            },
        });
    }
    const flagshipPlan = await prisma.plan.findUniqueOrThrow({ where: { code: 'flagship' } });

    // ─── 2. FLAGSHIP WORKSPACE ───────────────────────────────────────
    console.log('— Ensuring flagship workspace …');
    const ownerProfile = await prisma.profile.findFirst({
        where: { role: { in: ['admin', 'admin_mechanic'] }, is_active: true },
        orderBy: { created_at: 'asc' },
    });
    const flagship = await prisma.workspace.upsert({
        where: { slug: FLAGSHIP_SLUG },
        update: {},
        create: {
            slug: FLAGSHIP_SLUG,
            name: 'MotoPartes',
            business_type: 'motorcycle',
            folio_prefix: 'MP',
            plan_id: flagshipPlan.id,
            subscription_status: 'active',
            is_active: true,
            is_flagship: true,
            onboarding_completed: true,
            branding: {
                logo_url: '/logo.png',
                primary_color: '#ef4444',
                secondary_color: '#1e293b',
                tagline: 'Reparaciones y Modificaciones',
                pdf_footer: 'MotoPartes — Taller de motocicletas',
            },
            created_by: ownerProfile?.id || null,
        },
    });
    // Make sure the flagship is always pointed at the flagship plan — in case a
    // previous run created it with a different plan.
    if (flagship.plan_id !== flagshipPlan.id) {
        await prisma.workspace.update({
            where: { id: flagship.id },
            data: { plan_id: flagshipPlan.id, is_flagship: true },
        });
    }

    // Subscription record (every workspace should have one — makes billing
    // code uniform even for the flagship).
    await prisma.subscription.upsert({
        where: { workspace_id: flagship.id },
        update: { status: 'active', plan_id: flagshipPlan.id },
        create: {
            workspace_id: flagship.id,
            plan_id: flagshipPlan.id,
            status: 'active',
        },
    });

    console.log(`  flagship workspace id=${flagship.id}`);

    // ─── 3. MEMBERSHIPS ──────────────────────────────────────────────
    console.log('— Attaching existing profiles to the flagship workspace …');
    const profiles = await prisma.profile.findMany();
    let membershipsCreated = 0;
    for (const prof of profiles) {
        const res = await prisma.membership.upsert({
            where: { workspace_id_profile_id: { workspace_id: flagship.id, profile_id: prof.id } },
            update: { role: roleForWorkspace(prof.role) },
            create: {
                workspace_id: flagship.id,
                profile_id: prof.id,
                role: roleForWorkspace(prof.role),
            },
        });
        if (res) membershipsCreated++;
    }
    console.log(`  ${membershipsCreated} memberships ensured (${profiles.length} profiles total).`);

    // ─── 4. BACK-FILL workspace_id ON DATA TABLES ────────────────────
    //
    // Each UPDATE runs as its own statement so Postgres logs the affected count.
    // We use raw SQL because Prisma's bulk updateMany is fine but the raw
    // version is more legible for a one-off like this and outputs clean
    // "UPDATE n" counts.
    console.log('— Back-filling workspace_id on every data table …');
    const tables = [
        'clients', 'motorcycles', 'services', 'order_statuses',
        'orders', 'order_services', 'order_parts', 'order_photos',
        'order_history', 'order_updates', 'appointments',
        'whatsapp_sessions', 'order_requests', 'mechanic_earnings',
        'payment_requests',
    ];
    const results = {};
    await prisma.$transaction(async (tx) => {
        for (const t of tables) {
            const n = await tx.$executeRawUnsafe(
                `UPDATE ${t} SET workspace_id = $1::uuid WHERE workspace_id IS NULL`,
                flagship.id,
            );
            results[t] = n;
            console.log(`  ${t.padEnd(22)} ${n} rows`);
        }
    }, { timeout: 60000 });

    // ─── 5. SANITY CHECK ─────────────────────────────────────────────
    console.log('\n— Sanity check (rows still missing workspace_id) :');
    for (const t of tables) {
        const r = await prisma.$queryRawUnsafe(
            `SELECT count(*)::int AS c FROM ${t} WHERE workspace_id IS NULL`
        );
        const c = Array.isArray(r) ? r[0].c : r.c;
        const mark = c === 0 ? '✓' : '✗';
        console.log(`  ${mark} ${t.padEnd(22)} ${c}`);
    }

    console.log('\n✓ Migration complete.');
    console.log(`  flagship workspace id : ${flagship.id}`);
    console.log(`  flagship workspace slug : ${flagship.slug}`);
    console.log(`  flagship plan code : ${flagshipPlan.code}`);
}

main()
    .catch((e) => {
        console.error('✗ Migration failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
