process.env.DATABASE_URL = "postgresql://motopartes:MotoPartes2026Secure@187.77.11.79:5432/motopartes";
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('Resetting password for admin_maestro_motopartes@gmail.com...');

    try {
        const user = await prisma.profile.update({
            where: { email: 'admin_maestro_motopartes@gmail.com' },
            data: { password_hash: 'admin123' } // Plaintext - auth.js will upgrade it
        });
        console.log(`✅ Password reset for ${user.email} (Role: ${user.role})`);
    } catch (e) {
        console.error('Error resetting password:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
