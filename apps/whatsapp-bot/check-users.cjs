process.env.DATABASE_URL = "postgresql://motopartes:MotoPartes2026Secure@187.77.11.79:5432/motopartes";
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('Checking users (commonjs)...');
    try {
        const users = await prisma.profile.findMany();
        console.log(JSON.stringify(users.map(u => ({
            id: u.id,
            email: u.email,
            hash: u.password_hash,
            role: u.role
        })), null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
