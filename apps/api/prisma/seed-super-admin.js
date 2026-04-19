// Marca a amaury.colochos7@gmail.com como is_super_admin=true.
// Idempotente — se puede correr en cada deploy sin riesgo.
// Se ejecuta automáticamente desde el entrypoint del API tras prisma db push.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SUPER_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'amaury.colochos7@gmail.com').toLowerCase();

async function main() {
    const profile = await prisma.profile.findUnique({
        where: { email: SUPER_EMAIL },
        select: { id: true, email: true, is_super_admin: true },
    });
    if (!profile) {
        console.log(`[seed-super] profile ${SUPER_EMAIL} no existe todavía — se marcará cuando se registre.`);
        return;
    }
    if (profile.is_super_admin) {
        console.log(`[seed-super] ${SUPER_EMAIL} ya es super-admin.`);
        return;
    }
    await prisma.profile.update({
        where: { id: profile.id },
        data: {
            is_super_admin: true,
            super_admin_added_at: new Date(),
        },
    });
    console.log(`[seed-super] ${SUPER_EMAIL} marcado como super-admin.`);
}

main()
    .catch((e) => { console.error('[seed-super]', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
