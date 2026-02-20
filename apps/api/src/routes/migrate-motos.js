import prisma from '../lib/prisma.js';

/**
 * Migration API endpoint to import motorcycles from Supabase into the local database.
 * This is a one-time migration endpoint that should be removed after successful execution.
 * 
 * Usage: POST /api/admin/migrate-motos (no auth required for this one-time migration)
 */

const SUPABASE_PROJECT_ID = 'evytpaczrwhrhgdkfxfk';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eXRwYWN6cndocmhnZGtmeGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY2Mzk0MCwiZXhwIjoyMDgxMjM5OTQwfQ.zTF38VAvMboLbcuZJQ4324wcZP8U1F2Py1OF1i1Q-7M';
const BASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1`;

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

async function fetchFromSupabase(table) {
    const response = await fetch(`${BASE_URL}/${table}?select=*`, { headers });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${table}: ${response.statusText}`);
    }
    return response.json();
}

export default async function migrateMotosRoute(fastify) {
    // GET endpoint to check current state
    fastify.get('/', async (request, reply) => {
        const motorcycleCount = await prisma.motorcycle.count();
        const clientCount = await prisma.client.count();
        return {
            status: 'ready',
            localMotorcycles: motorcycleCount,
            localClients: clientCount,
            message: motorcycleCount > 0
                ? `Already have ${motorcycleCount} motorcycles in DB. POST to force re-migrate.`
                : `No motorcycles found. POST to migrate from Supabase.`
        };
    });

    // POST endpoint to trigger migration
    fastify.post('/', async (request, reply) => {
        const logs = [];
        const log = (msg) => {
            console.log(msg);
            logs.push(msg);
        };

        try {
            log('📡 Fetching motorcycles from Supabase...');
            const motorcycles = await fetchFromSupabase('motorcycles');
            log(`✅ Found ${motorcycles.length} motorcycles in Supabase`);

            let imported = 0;
            let skipped = 0;
            let errors = 0;
            const errorDetails = [];

            for (const m of motorcycles) {
                try {
                    // Verify client exists in local DB
                    if (!m.client_id) {
                        log(`SKIP: Moto ${m.id} - ${m.brand} ${m.model} (no client_id)`);
                        skipped++;
                        continue;
                    }

                    const client = await prisma.client.findUnique({
                        where: { id: m.client_id }
                    });

                    if (!client) {
                        log(`SKIP: Moto ${m.id} - ${m.brand} ${m.model} (client ${m.client_id} not found in local DB)`);
                        skipped++;
                        continue;
                    }

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
                            created_at: m.created_at ? new Date(m.created_at) : new Date()
                        }
                    });

                    log(`✅ Imported: ${m.brand} ${m.model} (${m.year}) → client: ${client.full_name}`);
                    imported++;
                } catch (e) {
                    log(`❌ ERROR: Moto ${m.id} - ${m.brand} ${m.model}: ${e.message}`);
                    errorDetails.push({ id: m.id, brand: m.brand, model: m.model, error: e.message });
                    errors++;
                }
            }

            // Verify final state
            const finalCount = await prisma.motorcycle.count();

            const summary = {
                status: 'completed',
                supabaseTotal: motorcycles.length,
                imported,
                skipped,
                errors,
                finalMotorcycleCount: finalCount,
                errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
                logs
            };

            log(`\n📊 Migration Summary: ${imported} imported, ${skipped} skipped, ${errors} errors. Total in DB: ${finalCount}`);

            return summary;
        } catch (err) {
            log(`❌ FATAL ERROR: ${err.message}`);
            return reply.status(500).send({
                status: 'error',
                message: err.message,
                logs
            });
        }
    });
}
