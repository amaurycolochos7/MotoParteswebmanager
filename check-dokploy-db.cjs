// Diagnostic: Check all tables in Dokploy PostgreSQL
const { PrismaClient } = require('./apps/api/node_modules/@prisma/client');

const DATABASE_URL = 'postgresql://motopartes:MotoPartes2026Secure@187.77.11.79:5433/motopartes';

const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } }
});

async function main() {
    try {
        await prisma.$connect();
        console.log('✅ Connected to Dokploy PostgreSQL\n');

        // Check all tables
        const tables = [
            { name: 'profiles', query: () => prisma.profile.findMany() },
            { name: 'clients', query: () => prisma.client.findMany() },
            { name: 'motorcycles', query: () => prisma.motorcycle.findMany() },
            { name: 'services', query: () => prisma.service.findMany() },
            { name: 'order_statuses', queryToCount: () => prisma.orderStatus.findMany() },
            { name: 'orders', query: () => prisma.order.findMany() },
            { name: 'order_services', query: () => prisma.orderService.findMany() },
            { name: 'order_parts', query: () => prisma.orderPart.findMany() },
            { name: 'order_photos', query: () => prisma.orderPhoto.findMany() },
            { name: 'order_history', query: () => prisma.orderHistory.findMany() },
            { name: 'order_updates', query: () => prisma.orderUpdate.findMany() },
            { name: 'appointments', query: () => prisma.appointment.findMany() },
            { name: 'whatsapp_sessions', query: () => prisma.whatsappSession.findMany() },
            { name: 'order_requests', query: () => prisma.orderRequest.findMany() },
            { name: 'mechanic_earnings', query: () => prisma.mechanicEarning.findMany() },
            { name: 'payment_requests', query: () => prisma.paymentRequest.findMany() },
        ];

        console.log('TABLE                  | COUNT');
        console.log('-'.repeat(45));

        for (const t of tables) {
            try {
                const fn = t.query || t.queryToCount;
                const rows = await fn();
                console.log(`${t.name.padEnd(23)}| ${rows.length}`);
            } catch (e) {
                console.log(`${t.name.padEnd(23)}| ❌ ERROR: ${e.message.split('\n')[0]}`);
            }
        }

        // Show profiles detail
        console.log('\n=== PROFILES (detail) ===');
        const profiles = await prisma.profile.findMany({
            select: { id: true, email: true, full_name: true, role: true, is_active: true, password_hash: true }
        });
        for (const p of profiles) {
            const pwType = p.password_hash?.startsWith('$2') ? 'BCRYPT' : (p.password_hash ? 'PLAIN' : 'NULL');
            console.log(`  ${p.role.padEnd(18)} | ${p.email.padEnd(45)} | active=${p.is_active} | pw=${pwType}`);
        }

        // Show clients detail
        console.log('\n=== CLIENTS (first 10) ===');
        const clients = await prisma.client.findMany({ take: 10 });
        for (const c of clients) {
            console.log(`  ${c.full_name.padEnd(25)} | phone=${c.phone || 'N/A'}`);
        }

        // Show motorcycles detail
        console.log('\n=== MOTORCYCLES (first 10) ===');
        const motos = await prisma.motorcycle.findMany({ take: 10, include: { client: { select: { full_name: true } } } });
        for (const m of motos) {
            console.log(`  ${m.brand} ${m.model} ${m.year || ''} | plates=${m.plates || 'N/A'} | owner=${m.client?.full_name || 'N/A'}`);
        }

        // Show services
        console.log('\n=== SERVICES ===');
        const services = await prisma.service.findMany();
        for (const s of services) {
            console.log(`  ${s.name.padEnd(30)} | $${s.base_price} | active=${s.is_active}`);
        }

        // Show order statuses
        console.log('\n=== ORDER STATUSES ===');
        const statuses = await prisma.orderStatus.findMany({ orderBy: { display_order: 'asc' } });
        for (const s of statuses) {
            console.log(`  ${s.name.padEnd(20)} | color=${s.color} | terminal=${s.is_terminal}`);
        }

    } catch (e) {
        console.error('❌ Connection error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
