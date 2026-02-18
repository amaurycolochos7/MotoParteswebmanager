import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking users from WhatsApp Bot context...');
    const users = await prisma.profile.findMany();

    console.log(JSON.stringify(users.map(u => ({
        email: u.email,
        hash: u.password_hash, // Show full hash to see if it's bcrypt or plain
        role: u.role
    })), null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
