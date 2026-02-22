// Quick test: try to delete an order and see the exact error
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['query', 'error', 'warn'] });

async function testDelete() {
    try {
        // Get any order
        const orders = await prisma.order.findMany({
            take: 1,
            orderBy: { created_at: 'desc' },
            select: { id: true, order_number: true }
        });

        if (orders.length === 0) {
            console.log('No orders found');
            return;
        }

        const testId = orders[0].id;
        console.log(`\n🔍 Testing delete for order: ${orders[0].order_number} (${testId})`);

        // Check what child records exist
        const [services, parts, photos, history, updates, earnings, requests] = await Promise.all([
            prisma.orderService.count({ where: { order_id: testId } }),
            prisma.orderPart.count({ where: { order_id: testId } }),
            prisma.orderPhoto.count({ where: { order_id: testId } }),
            prisma.orderHistory.count({ where: { order_id: testId } }),
            prisma.orderUpdate.count({ where: { order_id: testId } }),
            prisma.mechanicEarning.count({ where: { order_id: testId } }),
            prisma.orderRequest.count({ where: { created_order_id: testId } }),
        ]);

        console.log('\n📊 Child records:');
        console.log(`  Services: ${services}`);
        console.log(`  Parts: ${parts}`);
        console.log(`  Photos: ${photos}`);
        console.log(`  History: ${history}`);
        console.log(`  Updates: ${updates}`);
        console.log(`  Earnings: ${earnings}`);
        console.log(`  Requests: ${requests}`);

        // Now check ALL tables for any FK references we might be missing
        // Check if there are any OTHER tables with order_id columns
        const result = await prisma.$queryRaw`
            SELECT tc.table_name, kcu.column_name, 
                   ccu.table_name AS foreign_table_name,
                   ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' 
              AND ccu.table_name = 'orders'
            ORDER BY tc.table_name;
        `;

        console.log('\n🔗 ALL FK references to orders table:');
        result.forEach(r => {
            console.log(`  ${r.table_name}.${r.column_name} → orders.${r.foreign_column_name}`);
        });

        // Also check for any tables that have data referencing this order
        // that we might not know about
        for (const ref of result) {
            const tableName = ref.table_name;
            const colName = ref.column_name;
            try {
                const count = await prisma.$queryRawUnsafe(
                    `SELECT COUNT(*) as cnt FROM "${tableName}" WHERE "${colName}" = $1::uuid`,
                    testId
                );
                if (count[0].cnt > 0) {
                    console.log(`  ⚠️  ${tableName} has ${count[0].cnt} rows referencing this order!`);
                }
            } catch (e) {
                console.log(`  ❌ Error checking ${tableName}: ${e.message}`);
            }
        }

        // DON'T actually delete — just show what would happen
        console.log('\n✅ Analysis complete (no delete performed)');

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

testDelete();
