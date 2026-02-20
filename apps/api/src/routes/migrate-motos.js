import prisma from '../lib/prisma.js';

/**
 * COMPREHENSIVE Migration endpoint — imports ALL missing data from Supabase.
 * Tables migrated (in dependency order):
 *   1. profiles (if missing)
 *   2. clients (if missing)
 *   3. motorcycles
 *   4. services
 *   5. order_statuses
 *   6. orders
 *   7. order_services
 *   8. order_parts
 *   9. order_history
 *  10. mechanic_earnings
 *  11. appointments
 *
 * POST /api/admin/migrate-motos → triggers full migration
 * GET  /api/admin/migrate-motos → shows current DB counts
 */

const PROJECT_ID = 'evytpaczrwhrhgdkfxfk';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eXRwYWN6cndocmhnZGtmeGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY2Mzk0MCwiZXhwIjoyMDgxMjM5OTQwfQ.zTF38VAvMboLbcuZJQ4324wcZP8U1F2Py1OF1i1Q-7M';
const BASE = `https://${PROJECT_ID}.supabase.co/rest/v1`;
const HEADERS = {
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`,
    'Content-Type': 'application/json'
};

async function fetchAll(table) {
    const res = await fetch(`${BASE}/${table}?select=*&limit=1000`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.statusText}`);
    return res.json();
}

// Helper: safe date parse
function safeDate(d) { return d ? new Date(d) : new Date(); }
function safeDateNull(d) { return d ? new Date(d) : null; }

export default async function migrateMotosRoute(fastify) {

    // GET — show current DB state
    fastify.get('/', async () => {
        const [profiles, clients, motorcycles, services, statuses, orders, orderServices, orderParts] = await Promise.all([
            prisma.profile.count(),
            prisma.client.count(),
            prisma.motorcycle.count(),
            prisma.service.count(),
            prisma.orderStatus.count(),
            prisma.order.count(),
            prisma.orderService.count(),
            prisma.orderPart.count(),
        ]);
        return {
            status: 'ready',
            counts: { profiles, clients, motorcycles, services, statuses, orders, orderServices, orderParts },
            message: 'POST to this endpoint to trigger full migration from Supabase'
        };
    });

    // POST — run full migration
    fastify.post('/', async (request, reply) => {
        const logs = [];
        const log = (msg) => { console.log(msg); logs.push(msg); };
        const summary = {};

        try {
            // ==========================================
            // 1. PROFILES
            // ==========================================
            log('━━━ 1/9 PROFILES ━━━');
            const profiles = await fetchAll('profiles');
            let pOk = 0, pSkip = 0;
            for (const p of profiles) {
                try {
                    await prisma.profile.upsert({
                        where: { id: p.id },
                        update: {},
                        create: {
                            id: p.id,
                            email: p.email,
                            password_hash: p.password_hash || 'motopartes2026',
                            full_name: p.full_name,
                            phone: p.phone,
                            role: p.role || 'mechanic',
                            commission_percentage: p.commission_percentage ?? 10,
                            is_active: p.is_active ?? true,
                            can_create_appointments: p.can_create_appointments ?? true,
                            can_send_messages: p.can_send_messages ?? true,
                            can_create_clients: p.can_create_clients ?? true,
                            can_edit_clients: p.can_edit_clients ?? false,
                            can_delete_orders: p.can_delete_orders ?? false,
                            can_create_services: p.can_create_services ?? false,
                            is_master_mechanic: p.is_master_mechanic ?? false,
                            requires_approval: p.requires_approval ?? false,
                            can_view_approved_orders: p.can_view_approved_orders ?? true,
                            created_at: safeDate(p.created_at),
                            updated_at: safeDate(p.updated_at)
                        }
                    });
                    pOk++;
                } catch (e) {
                    pSkip++;
                    log(`  SKIP profile ${p.email}: ${e.message}`);
                }
            }
            summary.profiles = { total: profiles.length, imported: pOk, skipped: pSkip };
            log(`✅ Profiles: ${pOk}/${profiles.length}`);

            // ==========================================
            // 2. CLIENTS
            // ==========================================
            log('━━━ 2/9 CLIENTS ━━━');
            const clients = await fetchAll('clients');
            let cOk = 0, cSkip = 0;
            for (const c of clients) {
                try {
                    let creatorId = c.created_by;
                    if (creatorId) {
                        const creator = await prisma.profile.findUnique({ where: { id: creatorId } });
                        if (!creator) creatorId = null;
                    }
                    await prisma.client.upsert({
                        where: { id: c.id },
                        update: {},
                        create: {
                            id: c.id,
                            phone: c.phone,
                            full_name: c.full_name,
                            email: c.email,
                            notes: c.notes,
                            created_by: creatorId,
                            created_at: safeDate(c.created_at),
                            updated_at: safeDate(c.updated_at)
                        }
                    });
                    cOk++;
                } catch (e) {
                    cSkip++;
                    log(`  SKIP client ${c.full_name}: ${e.message}`);
                }
            }
            summary.clients = { total: clients.length, imported: cOk, skipped: cSkip };
            log(`✅ Clients: ${cOk}/${clients.length}`);

            // ==========================================
            // 3. MOTORCYCLES
            // ==========================================
            log('━━━ 3/9 MOTORCYCLES ━━━');
            const motos = await fetchAll('motorcycles');
            let mOk = 0, mSkip = 0;
            for (const m of motos) {
                try {
                    if (!m.client_id) { mSkip++; continue; }
                    const client = await prisma.client.findUnique({ where: { id: m.client_id } });
                    if (!client) { mSkip++; log(`  SKIP moto ${m.brand} ${m.model} (client missing)`); continue; }
                    await prisma.motorcycle.upsert({
                        where: { id: m.id },
                        update: {
                            brand: m.brand || 'Unknown',
                            model: m.model || 'Unknown',
                            year: m.year ? parseInt(m.year) : null,
                            plates: m.plates || '',
                            color: m.color || '',
                            vin: m.vin || '',
                            notes: m.notes || '',
                        },
                        create: {
                            id: m.id,
                            client_id: m.client_id,
                            brand: m.brand || 'Unknown',
                            model: m.model || 'Unknown',
                            year: m.year ? parseInt(m.year) : null,
                            plates: m.plates || '',
                            color: m.color || '',
                            vin: m.vin || '',
                            mileage: m.mileage || 0,
                            notes: m.notes || '',
                            created_at: safeDate(m.created_at)
                        }
                    });
                    mOk++;
                } catch (e) {
                    mSkip++;
                    log(`  ERROR moto ${m.id}: ${e.message}`);
                }
            }
            summary.motorcycles = { total: motos.length, imported: mOk, skipped: mSkip };
            log(`✅ Motorcycles: ${mOk}/${motos.length}`);

            // ==========================================
            // 4. SERVICES (catálogo)
            // ==========================================
            log('━━━ 4/9 SERVICES ━━━');
            const services = await fetchAll('services');
            let sOk = 0, sSkip = 0;
            for (const s of services) {
                try {
                    await prisma.service.upsert({
                        where: { id: s.id },
                        update: {
                            name: s.name,
                            description: s.description || null,
                            base_price: s.base_price ?? 0,
                            category: s.category || 'general',
                            is_active: s.is_active ?? true,
                            display_order: s.display_order ?? 0,
                        },
                        create: {
                            id: s.id,
                            name: s.name,
                            description: s.description || null,
                            base_price: s.base_price ?? 0,
                            category: s.category || 'general',
                            is_active: s.is_active ?? true,
                            display_order: s.display_order ?? 0,
                            created_at: safeDate(s.created_at)
                        }
                    });
                    sOk++;
                } catch (e) {
                    sSkip++;
                    log(`  ERROR service ${s.name}: ${e.message}`);
                }
            }
            summary.services = { total: services.length, imported: sOk, skipped: sSkip };
            log(`✅ Services: ${sOk}/${services.length}`);

            // ==========================================
            // 5. ORDER_STATUSES
            // ==========================================
            log('━━━ 5/9 ORDER STATUSES ━━━');
            const statuses = await fetchAll('order_statuses');
            let stOk = 0, stSkip = 0;
            for (const st of statuses) {
                try {
                    await prisma.orderStatus.upsert({
                        where: { id: st.id },
                        update: {
                            name: st.name,
                            description: st.description,
                            color: st.color || '#3b82f6',
                            display_order: st.display_order ?? 0,
                            is_terminal: st.is_terminal ?? false,
                        },
                        create: {
                            id: st.id,
                            name: st.name,
                            description: st.description,
                            color: st.color || '#3b82f6',
                            display_order: st.display_order ?? 0,
                            is_terminal: st.is_terminal ?? false,
                            created_at: safeDate(st.created_at)
                        }
                    });
                    stOk++;
                } catch (e) {
                    stSkip++;
                    log(`  ERROR status ${st.name}: ${e.message}`);
                }
            }
            summary.orderStatuses = { total: statuses.length, imported: stOk, skipped: stSkip };
            log(`✅ Order Statuses: ${stOk}/${statuses.length}`);

            // ==========================================
            // 6. ORDERS
            // ==========================================
            log('━━━ 6/9 ORDERS ━━━');
            const orders = await fetchAll('orders');
            let oOk = 0, oSkip = 0;
            for (const o of orders) {
                try {
                    // Validate foreign keys exist
                    if (o.client_id) {
                        const cl = await prisma.client.findUnique({ where: { id: o.client_id } });
                        if (!cl) { o.client_id = null; }
                    }
                    if (o.motorcycle_id) {
                        const mc = await prisma.motorcycle.findUnique({ where: { id: o.motorcycle_id } });
                        if (!mc) { o.motorcycle_id = null; }
                    }
                    if (o.mechanic_id) {
                        const pr = await prisma.profile.findUnique({ where: { id: o.mechanic_id } });
                        if (!pr) { o.mechanic_id = null; }
                    }
                    if (o.approved_by) {
                        const ap = await prisma.profile.findUnique({ where: { id: o.approved_by } });
                        if (!ap) { o.approved_by = null; }
                    }
                    if (o.status_id) {
                        const st = await prisma.orderStatus.findUnique({ where: { id: o.status_id } });
                        if (!st) { o.status_id = null; }
                    }

                    await prisma.order.upsert({
                        where: { id: o.id },
                        update: {},
                        create: {
                            id: o.id,
                            order_number: o.order_number,
                            client_id: o.client_id || null,
                            motorcycle_id: o.motorcycle_id || null,
                            mechanic_id: o.mechanic_id || null,
                            approved_by: o.approved_by || null,
                            status_id: o.status_id || null,
                            customer_complaint: o.customer_complaint || null,
                            initial_diagnosis: o.initial_diagnosis || null,
                            mechanic_notes: o.mechanic_notes || null,
                            labor_total: o.labor_total ?? 0,
                            parts_total: o.parts_total ?? 0,
                            total_amount: o.total_amount ?? 0,
                            advance_payment: o.advance_payment ?? 0,
                            payment_method: o.payment_method || null,
                            is_paid: o.is_paid ?? false,
                            paid_at: safeDateNull(o.paid_at),
                            public_token: o.public_token || null,
                            client_link: o.client_link || null,
                            created_at: safeDate(o.created_at),
                            updated_at: safeDate(o.updated_at),
                            completed_at: safeDateNull(o.completed_at),
                        }
                    });
                    oOk++;
                } catch (e) {
                    oSkip++;
                    log(`  ERROR order ${o.order_number}: ${e.message}`);
                }
            }
            summary.orders = { total: orders.length, imported: oOk, skipped: oSkip };
            log(`✅ Orders: ${oOk}/${orders.length}`);

            // ==========================================
            // 7. ORDER_SERVICES
            // ==========================================
            log('━━━ 7/9 ORDER SERVICES ━━━');
            const orderServices = await fetchAll('order_services');
            let osOk = 0, osSkip = 0;
            for (const os of orderServices) {
                try {
                    const order = await prisma.order.findUnique({ where: { id: os.order_id } });
                    if (!order) { osSkip++; continue; }
                    // Check if service_id exists
                    if (os.service_id) {
                        const svc = await prisma.service.findUnique({ where: { id: os.service_id } });
                        if (!svc) { os.service_id = null; }
                    }
                    await prisma.orderService.upsert({
                        where: { id: os.id },
                        update: {},
                        create: {
                            id: os.id,
                            order_id: os.order_id,
                            service_id: os.service_id || null,
                            name: os.name,
                            price: os.price ?? 0,
                            cost: os.cost ?? 0,
                            quantity: os.quantity ?? 1,
                            notes: os.notes || null,
                            created_at: safeDate(os.created_at)
                        }
                    });
                    osOk++;
                } catch (e) {
                    osSkip++;
                    log(`  ERROR order_service ${os.id}: ${e.message}`);
                }
            }
            summary.orderServices = { total: orderServices.length, imported: osOk, skipped: osSkip };
            log(`✅ Order Services: ${osOk}/${orderServices.length}`);

            // ==========================================
            // 8. ORDER_PARTS
            // ==========================================
            log('━━━ 8/9 ORDER PARTS ━━━');
            const orderParts = await fetchAll('order_parts');
            let opOk = 0, opSkip = 0;
            for (const op of orderParts) {
                try {
                    const order = await prisma.order.findUnique({ where: { id: op.order_id } });
                    if (!order) { opSkip++; continue; }
                    await prisma.orderPart.upsert({
                        where: { id: op.id },
                        update: {},
                        create: {
                            id: op.id,
                            order_id: op.order_id,
                            name: op.name,
                            part_number: op.part_number || null,
                            cost: op.cost ?? 0,
                            price: op.price ?? 0,
                            quantity: op.quantity ?? 1,
                            notes: op.notes || null,
                            created_at: safeDate(op.created_at)
                        }
                    });
                    opOk++;
                } catch (e) {
                    opSkip++;
                    log(`  ERROR order_part ${op.id}: ${e.message}`);
                }
            }
            summary.orderParts = { total: orderParts.length, imported: opOk, skipped: opSkip };
            log(`✅ Order Parts: ${opOk}/${orderParts.length}`);

            // ==========================================
            // 9. MECHANIC_EARNINGS
            // ==========================================
            log('━━━ 9/9 MECHANIC EARNINGS ━━━');
            const earnings = await fetchAll('mechanic_earnings');
            let eOk = 0, eSkip = 0;
            for (const e of earnings) {
                try {
                    const order = await prisma.order.findUnique({ where: { id: e.order_id } });
                    if (!order) { eSkip++; continue; }
                    const mechanic = await prisma.profile.findUnique({ where: { id: e.mechanic_id } });
                    if (!mechanic) { eSkip++; continue; }
                    await prisma.mechanicEarning.upsert({
                        where: { id: e.id },
                        update: {},
                        create: {
                            id: e.id,
                            order_id: e.order_id,
                            mechanic_id: e.mechanic_id,
                            labor_amount: e.labor_amount ?? 0,
                            commission_rate: e.commission_rate ?? 0,
                            earned_amount: e.earned_amount ?? 0,
                            is_paid: e.is_paid ?? false,
                            paid_at: safeDateNull(e.paid_at),
                            week_start: safeDateNull(e.week_start),
                            created_at: safeDate(e.created_at)
                        }
                    });
                    eOk++;
                } catch (err) {
                    eSkip++;
                    log(`  ERROR earning ${e.id}: ${err.message}`);
                }
            }
            summary.mechanicEarnings = { total: earnings.length, imported: eOk, skipped: eSkip };
            log(`✅ Mechanic Earnings: ${eOk}/${earnings.length}`);

            // ==========================================
            // FINAL COUNTS
            // ==========================================
            log('━━━ FINAL DB COUNTS ━━━');
            const finalCounts = {
                profiles: await prisma.profile.count(),
                clients: await prisma.client.count(),
                motorcycles: await prisma.motorcycle.count(),
                services: await prisma.service.count(),
                orderStatuses: await prisma.orderStatus.count(),
                orders: await prisma.order.count(),
                orderServices: await prisma.orderService.count(),
                orderParts: await prisma.orderPart.count(),
                mechanicEarnings: await prisma.mechanicEarning.count(),
            };
            log(`📊 Final: ${JSON.stringify(finalCounts)}`);

            return {
                status: 'completed',
                summary,
                finalCounts,
                logs
            };

        } catch (err) {
            log(`❌ FATAL: ${err.message}`);
            return reply.status(500).send({ status: 'error', message: err.message, logs });
        }
    });

    // POST — clear ALL non-terminal orders (Por Atender) to start fresh
    // Keeps: profiles, clients, motorcycles, services, order_statuses
    // Deletes: orders + order_services + order_parts + mechanic_earnings for non-terminal orders
    fastify.post('/clear-pending', async (request, reply) => {
        const logs = [];
        const log = (msg) => { console.log(msg); logs.push(msg); };

        try {
            // Find non-terminal statuses
            const nonTerminalStatuses = await prisma.orderStatus.findMany({
                where: { is_terminal: false }
            });
            const nonTerminalIds = nonTerminalStatuses.map(s => s.id);
            log(`📋 Non-terminal statuses: ${nonTerminalStatuses.map(s => s.name).join(', ')}`);

            // Find orders with non-terminal statuses
            const pendingOrders = await prisma.order.findMany({
                where: { status_id: { in: nonTerminalIds } },
                select: { id: true, order_number: true }
            });
            const pendingIds = pendingOrders.map(o => o.id);
            log(`📦 Found ${pendingOrders.length} pending orders to clear`);

            if (pendingIds.length === 0) {
                return { status: 'ok', message: 'No pending orders to clear', logs };
            }

            // Delete related records first (FK constraints)
            const delServices = await prisma.orderService.deleteMany({ where: { order_id: { in: pendingIds } } });
            log(`🗑️ Deleted ${delServices.count} order_services`);

            const delParts = await prisma.orderPart.deleteMany({ where: { order_id: { in: pendingIds } } });
            log(`🗑️ Deleted ${delParts.count} order_parts`);

            const delEarnings = await prisma.mechanicEarning.deleteMany({ where: { order_id: { in: pendingIds } } });
            log(`🗑️ Deleted ${delEarnings.count} mechanic_earnings`);

            // Try to delete order_photos if table exists
            try {
                const delPhotos = await prisma.orderPhoto.deleteMany({ where: { order_id: { in: pendingIds } } });
                log(`🗑️ Deleted ${delPhotos.count} order_photos`);
            } catch { log('ℹ️ No order_photos table or no records'); }

            // Try to delete order_history if table exists
            try {
                const delHistory = await prisma.orderHistory.deleteMany({ where: { order_id: { in: pendingIds } } });
                log(`🗑️ Deleted ${delHistory.count} order_history`);
            } catch { log('ℹ️ No order_history table or no records'); }

            // Now delete the orders themselves
            const delOrders = await prisma.order.deleteMany({ where: { id: { in: pendingIds } } });
            log(`🗑️ Deleted ${delOrders.count} orders`);

            // Final counts
            const remaining = await prisma.order.count();
            log(`📊 Remaining orders in DB: ${remaining}`);

            return {
                status: 'completed',
                deletedOrders: delOrders.count,
                deletedServices: delServices.count,
                deletedParts: delParts.count,
                remainingOrders: remaining,
                logs
            };
        } catch (err) {
            log(`❌ ERROR: ${err.message}`);
            return reply.status(500).send({ status: 'error', message: err.message, logs });
        }
    });

    // POST — clear ALL orders (complete reset, keeps reference data)
    fastify.post('/clear-all-orders', async (request, reply) => {
        const logs = [];
        const log = (msg) => { console.log(msg); logs.push(msg); };

        try {
            // Delete all related records first
            const delServices = await prisma.orderService.deleteMany({});
            log(`🗑️ Deleted ${delServices.count} order_services`);

            const delParts = await prisma.orderPart.deleteMany({});
            log(`🗑️ Deleted ${delParts.count} order_parts`);

            const delEarnings = await prisma.mechanicEarning.deleteMany({});
            log(`🗑️ Deleted ${delEarnings.count} mechanic_earnings`);

            try { const d = await prisma.orderPhoto.deleteMany({}); log(`🗑️ Deleted ${d.count} order_photos`); } catch { log('ℹ️ No order_photos'); }
            try { const d = await prisma.orderHistory.deleteMany({}); log(`🗑️ Deleted ${d.count} order_history`); } catch { log('ℹ️ No order_history'); }

            const delOrders = await prisma.order.deleteMany({});
            log(`🗑️ Deleted ${delOrders.count} orders`);

            return {
                status: 'completed',
                message: 'All orders cleared. Ready to start fresh.',
                deletedOrders: delOrders.count,
                logs
            };
        } catch (err) {
            log(`❌ ERROR: ${err.message}`);
            return reply.status(500).send({ status: 'error', message: err.message, logs });
        }
    });
}
