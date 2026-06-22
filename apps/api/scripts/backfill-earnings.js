/**
 * One-shot backfill: recalculate labor_total for paid orders that have
 * services but labor_total = 0, and create missing MechanicEarning rows.
 *
 * Run from the API container:
 *   node scripts/backfill-earnings.js
 *
 * Safe to run multiple times (idempotent: deletes + recreates earnings per order).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Find paid orders with labor_total = 0 that have services
    const orders = await prisma.order.findMany({
        where: {
            is_paid: true,
            labor_total: { lte: 0 },
        },
        include: {
            services: true,
            parts: true,
            mechanic: {
                select: {
                    id: true,
                    commission_percentage: true,
                    requires_approval: true,
                    supervised_by: true,
                },
            },
        },
    });

    console.log(`Found ${orders.length} paid orders with labor_total = 0`);

    let fixed = 0;
    for (const order of orders) {
        // Recalculate labor from services
        const svcLaborTotal = order.services.reduce((sum, s) => {
            const price = Number(s.price) * s.quantity;
            const matCost = Number(s.cost) * s.quantity;
            return sum + (price - matCost);
        }, 0);
        const svcPartsTotal = order.services.reduce((sum, s) => sum + Number(s.cost) * s.quantity, 0);
        const orderPartsTotal = order.parts.reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);

        const laborTotal = svcLaborTotal;
        const partsTotal = svcPartsTotal + orderPartsTotal;

        if (laborTotal <= 0) {
            // No services with labor either — skip
            continue;
        }

        await prisma.$transaction(async (tx) => {
            // Update order totals
            await tx.order.update({
                where: { id: order.id },
                data: {
                    labor_total: laborTotal,
                    parts_total: partsTotal,
                    total_amount: laborTotal + partsTotal,
                },
            });

            // Recreate earnings
            if (order.mechanic) {
                await tx.mechanicEarning.deleteMany({ where: { order_id: order.id } });

                const rate = parseFloat(order.mechanic.commission_percentage || 0);
                const earned = laborTotal * (rate / 100);

                const now = new Date(order.paid_at || order.created_at);
                const dow = now.getDay();
                const offsetToMonday = dow === 0 ? -6 : 1 - dow;
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() + offsetToMonday);
                weekStart.setHours(0, 0, 0, 0);

                await tx.mechanicEarning.create({
                    data: {
                        workspace_id: order.workspace_id,
                        order_id: order.id,
                        mechanic_id: order.mechanic.id,
                        labor_amount: laborTotal,
                        commission_rate: rate,
                        earned_amount: earned,
                        is_paid: false,
                        week_start: weekStart,
                    },
                });
            }
        });

        fixed++;
        console.log(`  ✅ ${order.order_number}: labor_total ${0} → ${laborTotal}`);
    }

    console.log(`\nDone. Fixed ${fixed}/${orders.length} orders.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
