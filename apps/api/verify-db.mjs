// Verify production DB state
import { PrismaClient } from '@prisma/client';

const url = 'postgresql://motopartes:MotoPartes2026Secure@187.77.11.79:5433/motopartes';
const p = new PrismaClient({ datasources: { db: { url } } });

try {
    await p.$connect();
    console.log('✅ Connected');

    // Check tables
    const tables = await p.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    console.log(`\nTables (${tables.length}):`);
    for (const t of tables) console.log(`  - ${t.tablename}`);

    // Check user count
    const users = await p.profile.findMany({ select: { email: true, role: true, is_active: true } });
    console.log(`\nUsers (${users.length}):`);
    for (const u of users) console.log(`  ${u.role?.padEnd(15)} | ${u.email?.padEnd(40)} | active=${u.is_active}`);

} catch (e) {
    console.error('ERROR:', e.message.split('\n').slice(0, 3).join(' /// '));
} finally {
    await p.$disconnect();
}
