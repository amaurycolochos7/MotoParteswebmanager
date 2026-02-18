// Test different database connection strings
import { PrismaClient } from '@prisma/client';

const urls = [
    ['motopartes@187-MotoPartes2026!', 'postgresql://motopartes:MotoPartes2026!@187.77.11.79:5432/motopartes'],
    ['motopartes@local-MotoPartes2026!', 'postgresql://motopartes:MotoPartes2026!@localhost:5432/motopartes'],
    ['motopartes@187-MotoPartes2026Secure', 'postgresql://motopartes:MotoPartes2026Secure@187.77.11.79:5432/motopartes'],
    ['motopartes@local-MotoPartes2026Secure', 'postgresql://motopartes:MotoPartes2026Secure@localhost:5432/motopartes'],
    ['kingice@187', 'postgresql://kingice:kingice2026@187.77.11.79:5432/kingicegold'],
    ['kingice@local', 'postgresql://kingice:kingice2026@localhost:5432/kingicegold'],
];

for (const [label, url] of urls) {
    const p = new PrismaClient({ datasources: { db: { url } } });
    try {
        await p.$connect();
        const tables = await p.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' LIMIT 5`;
        console.log(`OK ${label} → ${tables.map(t => t.tablename).join(', ')}`);
    } catch (e) {
        const msg = e.message.replace(/\n/g, ' ').substring(0, 100);
        console.log(`FAIL ${label} → ${msg}`);
    } finally {
        await p.$disconnect();
    }
}
console.log('DONE');
