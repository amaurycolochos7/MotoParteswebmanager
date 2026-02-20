import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
}

const BASE_URL = `${SUPABASE_URL}/rest/v1`;

async function fetchFromSupabase(table) {
    console.log(`📡 Fetching ${table} from Supabase...`);
    const response = await fetch(`${BASE_URL}/${table}?select=*`, {
        headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${table}: ${response.statusText}`);
    }
    const data = await response.json();
    console.log(`✅ Fetched ${data.length} records from ${table}.`);
    return data;
}

async function migrate() {
    try {
        const motorcycles = await fetchFromSupabase('motorcycles');

        console.log('MIGRATE MOTOS: Starting...');
        let motosCount = 0;
        let skipCount = 0;

        for (const m of motorcycles) {
            try {
                // Verify client exists
                if (!m.client_id) {
                    console.log(`SKIP: Moto ${m.id} (No client_id)`);
                    skipCount++;
                    continue;
                }

                const client = await prisma.client.findUnique({ where: { id: m.client_id } });
                if (!client) {
                    // console.log(`SKIP: Moto ${m.id} (Client ${m.client_id} missing in DB)`);
                    skipCount++;
                    continue;
                }

                await prisma.motorcycle.upsert({
                    where: { id: m.id },
                    update: {}, // Don't overwrite if exists, or maybe we should? Assuming ID match is enough.
                    create: {
                        id: m.id,
                        client_id: m.client_id,
                        brand: m.brand || 'Unknown',
                        model: m.model || 'Unknown',
                        year: m.year ? parseInt(m.year) : 2020,
                        plates: m.plates || '',
                        color: m.color || '',
                        vin: m.vin || '',
                        notes: m.notes || '',
                        created_at: m.created_at ? new Date(m.created_at) : new Date()
                    }
                });
                motosCount++;
            } catch (e) {
                console.error(`ERROR: Moto ${m.id}: ${e.message}`);
            }
        }
        console.log(`MIGRATE MOTOS: Done. Imported: ${motosCount}. Skipped: ${skipCount}. Total: ${motorcycles.length}`);

    } catch (err) {
        console.error('MIGRATE: FATAL ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
