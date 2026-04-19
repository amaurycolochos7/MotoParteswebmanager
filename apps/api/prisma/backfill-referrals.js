// Backfill Fase 6.2 — ejecutar UNA SOLA VEZ después de `npx prisma db push`.
//
// Qué hace:
// 1. A cada Workspace sin `referral_slug` le asigna su `slug` como ref slug
//    (así todos pueden compartir su link desde día 1).
// 2. Marca `is_partner = true` en el workspace flagship (motoblaker) para que
//    sus referidos futuros entren con 30% vitalicio.
// 3. Para cada Workspace que tenga `settings.referral_source.referrer_workspace_id`
//    (capturado por Fase 6.1 entre el despliegue parcial y el completo),
//    crea la fila `Referral` correspondiente con tasa según is_partner del referente.
//
// Uso: desde el contenedor API:
//   node prisma/backfill-referrals.js

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

async function main() {
    console.log('[BACKFILL] Iniciando backfill de Fase 6.2 — programa de afiliados.');

    // 1. Asignar referral_slug = slug a los que no tengan uno.
    const toSlug = await prisma.workspace.findMany({
        where: { referral_slug: null },
        select: { id: true, slug: true, name: true },
    });
    for (const ws of toSlug) {
        // Verificar colisión por si acaso
        const clash = await prisma.workspace.findFirst({
            where: { referral_slug: ws.slug },
            select: { id: true },
        });
        const finalSlug = clash ? `${ws.slug}-${ws.id.slice(0, 4)}` : ws.slug;
        await prisma.workspace.update({
            where: { id: ws.id },
            data: { referral_slug: finalSlug },
        });
        console.log(`  • ${ws.name}: referral_slug=${finalSlug}`);
    }

    // 2. Flagship → partner.
    const flagship = await prisma.workspace.findFirst({
        where: { is_flagship: true },
        select: { id: true, name: true, slug: true, is_partner: true },
    });
    if (flagship && !flagship.is_partner) {
        await prisma.workspace.update({
            where: { id: flagship.id },
            data: { is_partner: true },
        });
        console.log(`  • ${flagship.name} (flagship) marcado como PARTNER → 30% vitalicio.`);
    } else if (flagship) {
        console.log(`  • ${flagship.name} ya era partner.`);
    } else {
        console.log('  • No hay workspace flagship. Saltando paso de partner.');
    }

    // 3. Materializar referrals capturados por Fase 6.1 en `settings.referral_source`.
    const pending = await prisma.workspace.findMany({
        where: {
            referred_by_workspace_id: null,
            settings: { path: ['referral_source', 'referrer_workspace_id'], not: null },
        },
        select: { id: true, name: true, settings: true },
    });
    for (const ws of pending) {
        const src = ws.settings?.referral_source;
        if (!src?.referrer_workspace_id || !src?.slug) continue;

        const referrer = await prisma.workspace.findUnique({
            where: { id: src.referrer_workspace_id },
            select: { id: true, is_partner: true, name: true },
        });
        if (!referrer) {
            console.log(`  • Skip ${ws.name}: referente ${src.referrer_workspace_id} no existe.`);
            continue;
        }

        // Evitar duplicados
        const exists = await prisma.referral.findUnique({
            where: { referred_workspace_id: ws.id },
            select: { id: true },
        });
        if (exists) continue;

        const rate = referrer.is_partner ? 0.300 : 0.200;
        const lifetime = referrer.is_partner;
        const endsAt = lifetime ? null : new Date(Date.now() + TWELVE_MONTHS_MS);

        await prisma.$transaction([
            prisma.referral.create({
                data: {
                    referrer_workspace_id: referrer.id,
                    referred_workspace_id: ws.id,
                    referral_slug: src.slug,
                    commission_rate: rate,
                    is_lifetime: lifetime,
                    ends_at: endsAt,
                    status: 'active',
                },
            }),
            prisma.workspace.update({
                where: { id: ws.id },
                data: { referred_by_workspace_id: referrer.id },
            }),
        ]);
        console.log(`  • Referral creado: ${referrer.name} → ${ws.name} (${rate * 100}% ${lifetime ? 'vitalicio' : '12m'})`);
    }

    console.log('[BACKFILL] Listo.');
}

main()
    .catch((err) => {
        console.error('[BACKFILL] Error:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
