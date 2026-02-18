import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking users...');
    const users = await prisma.profile.findMany();

    console.log(JSON.stringify(users.map(u => ({
        email: u.email,
        id: u.id,
        active: u.is_active,
        hashStart: u.password_hash ? u.password_hash.substring(0, 7) : 'NULL',
        role: u.role
    })), null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
