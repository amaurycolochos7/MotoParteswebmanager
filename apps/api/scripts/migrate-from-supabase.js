import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_ID = 'evytpaczrwhrhgdkfxfk';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eXRwYWN6cndocmhnZGtmeGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY2Mzk0MCwiZXhwIjoyMDgxMjM5OTQwfQ.zTF38VAvMboLbcuZJQ4324wcZP8U1F2Py1OF1i1Q-7M';
const BASE_URL = `https://${PROJECT_ID}.supabase.co/rest/v1`;

const headers = {
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`,
    'Content-Type': 'application/json'
};

async function fetchData(table) {
    console.log(`FETCH: ${table}...`);
    const res = await fetch(`${BASE_URL}/${table}?select=*`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.statusText}`);
    const data = await res.json();
    console.log(`FETCH: ${table} done. Found ${data.length} records.`);
    return data;
}

async function migrate() {
    try {
        console.log('MIGRATE: Starting...');

        // 1. Profiles
        const profiles = await fetchData('profiles');
        let profilesCount = 0;
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
                        role: p.role,
                        commission_percentage: p.commission_percentage,
                        is_active: p.is_active,
                        can_create_appointments: p.can_create_appointments,
                        can_send_messages: p.can_send_messages,
                        can_create_clients: p.can_create_clients,
                        can_edit_clients: p.can_edit_clients,
                        can_delete_orders: p.can_delete_orders,
                        can_create_services: p.can_create_services,
                        is_master_mechanic: p.is_master_mechanic,
                        requires_approval: p.requires_approval,
                        can_view_approved_orders: p.can_view_approved_orders,
                        created_at: new Date(p.created_at),
                        updated_at: new Date(p.updated_at)
                    }
                });
                profilesCount++;
            } catch (e) {
                console.error(`ERROR: Profile ${p.email}: ${e.message}`);
            }
        }
        console.log(`MIGRATE: Profiles done (${profilesCount}/${profiles.length})`);

        // 2. Clients
        const clients = await fetchData('clients');
        let clientsCount = 0;
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
                        created_at: new Date(c.created_at),
                        updated_at: new Date(c.updated_at)
                    }
                });
                clientsCount++;
            } catch (e) {
                console.error(`ERROR: Client ${c.full_name}: ${e.message}`);
            }
        }
        console.log(`MIGRATE: Clients done (${clientsCount}/${clients.length})`);

        // 3. Motorcycles
        const motorcycles = await fetchData('motorcycles');
        let motosCount = 0;
        for (const m of motorcycles) {
            try {
                const client = await prisma.client.findUnique({ where: { id: m.client_id } });
                if (!client) {
                    console.warn(`WARN: Moto ${m.id} skipped (Client ${m.client_id} missing)`);
                    continue;
                }

                await prisma.motorcycle.upsert({
                    where: { id: m.id },
                    update: {},
                    create: {
                        id: m.id,
                        client_id: m.client_id,
                        brand: m.brand,
                        model: m.model,
                        year: m.year,
                        plates: m.plates,
                        color: m.color,
                        vin: m.vin,
                        notes: m.notes,
                        created_at: new Date(m.created_at),
                        updated_at: new Date(m.updated_at)
                    }
                });
                motosCount++;
            } catch (e) {
                console.error(`ERROR: Moto ${m.id}: ${e.message}`);
            }
        }
        console.log(`MIGRATE: Motorcycles done (${motosCount}/${motorcycles.length})`);

        console.log('MIGRATE: SUCCESS!');

    } catch (err) {
        console.error('MIGRATE: FATAL ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
