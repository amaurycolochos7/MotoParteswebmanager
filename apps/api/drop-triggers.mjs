import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: { url: 'postgresql://postgres:postgres@187.77.11.79:5435/motopartes' }
    }
});

async function main() {
    try {
        console.log('Connecting to production DB...');

        // Drop stale triggers
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS update_order_totals_on_parts ON order_parts`);
        console.log('✅ Dropped trigger: update_order_totals_on_parts');

        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS update_order_totals_on_service ON order_services`);
        console.log('✅ Dropped trigger: update_order_totals_on_service');

        // Also check for any other triggers on these tables
        const triggers = await prisma.$queryRawUnsafe(`
            SELECT trigger_name, event_object_table 
            FROM information_schema.triggers 
            WHERE event_object_table IN ('order_parts', 'order_services', 'orders')
        `);
        console.log('Remaining triggers:', triggers);

        console.log('\n🎉 Done! Triggers dropped successfully.');
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
