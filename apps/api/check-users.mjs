// Diagnostic script: Check users and reset passwords
// Uses the same DATABASE_URL from environment
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

console.log('DB URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));

const p = new PrismaClient();
try {
    await p.$connect();
    console.log('✅ Connected to database');

    const users = await p.profile.findMany({
        select: {
            id: true,
            email: true,
            full_name: true,
            role: true,
            is_active: true,
            password_hash: true
        }
    });

    console.log(`\n=== ALL USERS (${users.length}) ===`);
    for (const x of users) {
        const pwType = x.password_hash?.startsWith('$2') ? 'BCRYPT' : 'PLAIN';
        const pwPreview = pwType === 'PLAIN' ? x.password_hash : x.password_hash?.substring(0, 15) + '...';
        console.log(`  ${(x.role || 'NULL').padEnd(15)} | ${(x.email || 'NULL').padEnd(45)} | active=${x.is_active} | pw_type=${pwType} | pw=${pwPreview}`);
    }

    // Reset ALL user passwords to plaintext so they can login
    // The auth.js code will auto-upgrade to bcrypt on first login
    console.log('\n=== RESETTING ALL PASSWORDS ===');
    for (const user of users) {
        let newPassword;
        if (user.role === 'admin') {
            newPassword = 'admin123';
        } else {
            newPassword = 'motopartes123';
        }

        // Hash with bcrypt directly so they work with the bcrypt check
        const hashed = await bcrypt.hash(newPassword, 10);

        await p.profile.update({
            where: { id: user.id },
            data: { password_hash: hashed, is_active: true }
        });

        console.log(`  ✅ ${user.email} → password set to "${newPassword}" (bcrypt hashed)`);
    }

    console.log('\n🎉 All passwords reset successfully!');
    console.log('Admin users → password: admin123');
    console.log('Mechanic users → password: motopartes123');

} catch (e) {
    console.error('❌ ERROR:', e.message);
} finally {
    await p.$disconnect();
}
