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
        console.log('MIGRATE MOTOS: Starting...');

        // 3. Motorcycles
        const motorcycles = await fetchData('motorcycles');
        let motosCount = 0;
        for (const m of motorcycles) {
            try {
                // Verify client exists
                const client = await prisma.client.findUnique({ where: { id: m.client_id } });
                if (!client) {
                    console.log(`SKIP: Moto ${m.id} (Client ${m.client_id} missing)`);
                    continue; // Skip if client not found
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
        console.log(`MIGRATE MOTOS: Done (${motosCount}/${motorcycles.length})`);

    } catch (err) {
        console.error('MIGRATE: FATAL ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
