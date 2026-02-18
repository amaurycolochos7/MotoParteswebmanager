// Connect to production MotoPartes DB on external port 5433
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const url = 'postgresql://motopartes:MotoPartes2026Secure@187.77.11.79:5433/motopartes';
console.log('Connecting to production DB on port 5433...');

const p = new PrismaClient({ datasources: { db: { url } } });
try {
    await p.$connect();
    console.log('✅ Connected to production database!');

    // List all tables
    const tables = await p.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    console.log(`\nTables (${tables.length}): ${tables.map(t => t.tablename).join(', ')}`);

    // Check if profile table exists and has data
    try {
        const users = await p.profile.findMany({
            select: { id: true, email: true, full_name: true, role: true, is_active: true, password_hash: true }
        });
        console.log(`\n=== USERS (${users.length}) ===`);
        for (const u of users) {
            const pwType = u.password_hash?.startsWith('$2') ? 'BCRYPT' : 'PLAIN';
            const pwPreview = pwType === 'PLAIN' ? u.password_hash : u.password_hash?.substring(0, 15) + '...';
            console.log(`  ${(u.role || 'NULL').padEnd(15)} | ${(u.email || 'NULL').padEnd(45)} | active=${u.is_active} | pw_type=${pwType} | pw=${pwPreview}`);
        }

        // Reset all passwords
        console.log('\n=== RESETTING PASSWORDS ===');
        for (const user of users) {
            const newPassword = user.role === 'admin' ? 'admin123' : 'motopartes123';
            const hashed = await bcrypt.hash(newPassword, 10);
            await p.profile.update({
                where: { id: user.id },
                data: { password_hash: hashed, is_active: true }
            });
            console.log(`  ✅ ${user.email} → "${newPassword}"`);
        }
        console.log('\n🎉 All passwords reset!');
    } catch (e) {
        console.log('Profile table error:', e.message.split('\n')[0]);
        console.log('\n--- Tables might not be created yet. Listing raw tables:');
        for (const t of tables) console.log('  -', t.tablename);
    }
} catch (e) {
    console.error('❌ Connection error:', e.message.split('\n').slice(0, 3).join('\n'));
} finally {
    await p.$disconnect();
}
