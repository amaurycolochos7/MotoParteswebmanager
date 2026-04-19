// Marca a amaury.colochos7@gmail.com como is_super_admin=true.
// Idempotente — se puede correr en cada deploy sin riesgo.
// Valida que el hash existente sea bcrypt válido (prefix $2, length 60)
// para evitar el bug de 2026-04-19 donde shell interpretaba $2 como variable.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SUPER_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'amaury.colochos7@gmail.com').toLowerCase();

function isValidBcrypt(hash) {
    return typeof hash === 'string' && hash.length === 60 && hash.startsWith('$2');
}

async function main() {
    const profile = await prisma.profile.findUnique({
        where: { email: SUPER_EMAIL },
        select: { id: true, email: true, is_super_admin: true, password_hash: true },
    });
    if (!profile) {
        console.log(`[seed-super] profile ${SUPER_EMAIL} no existe todavía — se marcará cuando se registre.`);
        return;
    }

    if (!isValidBcrypt(profile.password_hash)) {
        console.warn(`[seed-super] ⚠ password_hash de ${SUPER_EMAIL} NO es bcrypt válido (length=${profile.password_hash?.length}, prefix=${profile.password_hash?.slice(0,3)}). Corre manualmente fix-super-password para rehashear.`);
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
