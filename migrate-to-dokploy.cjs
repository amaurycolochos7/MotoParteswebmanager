/**
 * Migration script: Push cached Supabase data to Dokploy PostgreSQL
 * Uses the MotoPartes API on port 3010 since direct DB access is firewalled
 * 
 * Data sources: migration_profiles.json, migration_clients.json
 * Strategy: 
 *   1. Login as admin to get a token
 *   2. Push profiles via POST /api/auth/users (with password)
 *   3. Push clients via POST /api/clients
 *   4. Fetch motorcycles from Supabase REST API (if reachable) and push via API
 */

const fs = require('fs');
const path = require('path');

function readJsonFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Strip BOM if present
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    return JSON.parse(content);
}

const API_BASE = 'http://187.77.11.79:3010/api';
const SUPABASE_PROJECT = 'evytpaczrwhrhgdkfxfk';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eXRwYWN6cndocmhnZGtmeGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY2Mzk0MCwiZXhwIjoyMDgxMjM5OTQwfQ.zTF38VAvMboLbcuZJQ4324wcZP8U1F2Py1OF1i1Q-7M';

let TOKEN = '';

async function apiCall(method, endpoint, body) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`
        }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
}

async function supabaseFetch(table) {
    console.log(`  📡 Fetching ${table} from Supabase...`);
    try {
        const res = await fetch(`https://${SUPABASE_PROJECT}.supabase.co/rest/v1/${table}?select=*`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            signal: AbortSignal.timeout(15000)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log(`  ✅ Got ${data.length} records from ${table}`);
        return data;
    } catch (e) {
        console.log(`  ⚠️ Supabase unreachable for ${table}: ${e.message}`);
        return null;
    }
}

async function login() {
    console.log('=== LOGIN ===');
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@motopartes.com', password: 'admin123' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Login failed: ${JSON.stringify(data)}`);
    TOKEN = data.token;
    console.log(`✅ Logged in as ${data.user.email} (role: ${data.user.role})\n`);
}

async function migrateProfiles() {
    console.log('=== MIGRATING PROFILES ===');
    const profiles = readJsonFile(path.join(__dirname, 'migration_profiles.json'));

    // First check existing
    const { data: existing } = await apiCall('GET', '/auth/users');
    const existingEmails = new Set((existing || []).map(u => u.email));
    console.log(`  Existing users: ${existingEmails.size} (${[...existingEmails].join(', ')})`);

    let created = 0, skipped = 0, errors = 0;

    for (const p of profiles) {
        if (existingEmails.has(p.email)) {
            console.log(`  ⏩ SKIP: ${p.email} (already exists)`);
            // But update with correct permissions
            const existingUser = (existing || []).find(u => u.email === p.email);
            if (existingUser) {
                const updateRes = await apiCall('PUT', `/auth/users/${existingUser.id}`, {
                    full_name: p.full_name,
                    phone: p.phone,
                    role: p.role,
                    commission_percentage: p.commission_percentage,
                    is_master_mechanic: p.is_master_mechanic,
                    requires_approval: p.requires_approval,
                    can_create_services: p.can_create_services,
                    can_create_appointments: p.can_create_appointments,
                    can_send_messages: p.can_send_messages,
                    can_create_clients: p.can_create_clients,
                    can_edit_clients: p.can_edit_clients,
                    can_delete_orders: p.can_delete_orders,
                    can_view_approved_orders: p.can_view_approved_orders,
                    is_active: p.is_active,
                    password: p.password_hash // Set original password
                });
                if (updateRes.ok) {
                    console.log(`    ✅ Updated permissions for ${p.email}`);
                }
            }
            skipped++;
            continue;
        }

        const res = await apiCall('POST', '/auth/users', {
            email: p.email,
            password: p.password_hash, // The original plain text password
            full_name: p.full_name,
            phone: p.phone,
            role: p.role,
            commission_percentage: p.commission_percentage,
            is_master_mechanic: p.is_master_mechanic || false,
            requires_approval: p.requires_approval || false,
            can_create_services: p.can_create_services || false,
            can_create_appointments: p.can_create_appointments !== false,
            can_send_messages: p.can_send_messages !== false,
            can_create_clients: p.can_create_clients !== false,
            can_edit_clients: p.can_edit_clients || false,
            can_delete_orders: p.can_delete_orders || false,
        });

        if (res.ok) {
            console.log(`  ✅ Created: ${p.email} (${p.role})`);
            created++;
        } else {
            console.log(`  ❌ Error ${p.email}: ${JSON.stringify(res.data)}`);
            errors++;
        }
    }

    console.log(`  PROFILES: Created=${created}, Skipped=${skipped}, Errors=${errors}\n`);
}

async function migrateClients() {
    console.log('=== MIGRATING CLIENTS ===');
    const clients = readJsonFile(path.join(__dirname, 'migration_clients.json'));

    // Check existing
    const { data: existing } = await apiCall('GET', '/clients');
    const existingPhones = new Set((existing || []).map(c => c.phone));
    console.log(`  Existing clients: ${existingPhones.size}`);

    let created = 0, skipped = 0, errors = 0;

    for (const c of clients) {
        if (existingPhones.has(c.phone)) {
            console.log(`  ⏩ SKIP: ${c.full_name} (phone ${c.phone} already exists)`);
            skipped++;
            continue;
        }

        const res = await apiCall('POST', '/clients', {
            phone: c.phone,
            full_name: c.full_name,
            email: c.email || null,
            notes: c.notes || null
        });

        if (res.ok) {
            console.log(`  ✅ Created: ${c.full_name} (${c.phone})`);
            created++;
        } else if (res.status === 409) {
            console.log(`  ⏩ SKIP: ${c.full_name} (duplicate phone)`);
            skipped++;
        } else {
            console.log(`  ❌ Error ${c.full_name}: ${JSON.stringify(res.data)}`);
            errors++;
        }
    }

    console.log(`  CLIENTS: Created=${created}, Skipped=${skipped}, Errors=${errors}\n`);
}

async function migrateMotorcycles() {
    console.log('=== MIGRATING MOTORCYCLES ===');

    // Try to get from Supabase
    const motos = await supabaseFetch('motorcycles');
    if (!motos || motos.length === 0) {
        console.log('  ⚠️ No motorcycles data available (Supabase unreachable)\n');
        console.log('  💡 To migrate motorcycles, you need to either:');
        console.log('     1. Cache the motorcycles data like clients/profiles');
        console.log('     2. Run the migration from the VPS where Supabase is reachable');
        return;
    }

    // Get current clients to map phone numbers
    const { data: currentClients } = await apiCall('GET', '/clients');
    const clientByPhone = {};
    for (const c of (currentClients || [])) {
        clientByPhone[c.phone] = c;
    }

    // We need the original client mapping from Supabase to match motorcycles
    const supClients = await supabaseFetch('clients');
    const supClientById = {};
    if (supClients) {
        for (const c of supClients) {
            supClientById[c.id] = c;
        }
    }

    let created = 0, skipped = 0, errors = 0;

    for (const m of motos) {
        // Find the original client, then match to our new client by phone
        const origClient = supClientById[m.client_id];
        if (!origClient) {
            console.log(`  ⏩ SKIP: ${m.brand} ${m.model} (original client ${m.client_id} not found)`);
            skipped++;
            continue;
        }

        const newClient = clientByPhone[origClient.phone];
        if (!newClient) {
            console.log(`  ⏩ SKIP: ${m.brand} ${m.model} (client ${origClient.full_name} not in new DB)`);
            skipped++;
            continue;
        }

        // Check if motorcycle already exists for this client
        const existingMotos = newClient.motorcycles || [];
        const duplicate = existingMotos.find(em =>
            em.brand === m.brand && em.model === m.model &&
            (em.plates === m.plates || (!em.plates && !m.plates))
        );
        if (duplicate) {
            console.log(`  ⏩ SKIP: ${m.brand} ${m.model} (already exists for ${newClient.full_name})`);
            skipped++;
            continue;
        }

        const res = await apiCall('POST', '/motorcycles', {
            client_id: newClient.id,
            brand: m.brand || 'Unknown',
            model: m.model || 'Unknown',
            year: m.year || null,
            plates: m.plates || null,
            color: m.color || null,
            vin: m.vin || null,
            notes: m.notes || null
        });

        if (res.ok) {
            console.log(`  ✅ Created: ${m.brand} ${m.model} → ${newClient.full_name}`);
            created++;
        } else {
            console.log(`  ❌ Error ${m.brand} ${m.model}: ${JSON.stringify(res.data)}`);
            errors++;
        }
    }

    console.log(`  MOTORCYCLES: Created=${created}, Skipped=${skipped}, Errors=${errors}\n`);
}

async function verifyFinal() {
    console.log('=== FINAL VERIFICATION ===');
    const { data: users } = await apiCall('GET', '/auth/users');
    const { data: clients } = await apiCall('GET', '/clients');
    const { data: services } = await apiCall('GET', '/services');
    const { data: statuses } = await apiCall('GET', '/statuses');
    const { data: orders } = await apiCall('GET', '/orders');

    console.log(`  Profiles:     ${(users || []).length}`);
    console.log(`  Clients:      ${(clients || []).length}`);
    console.log(`  Services:     ${(services || []).length}`);
    console.log(`  Statuses:     ${(statuses || []).length}`);
    console.log(`  Orders:       ${(orders || []).length}`);

    console.log('\n  Users:');
    for (const u of (users || [])) {
        console.log(`    ${u.role.padEnd(18)} | ${u.email.padEnd(45)} | active=${u.is_active} | master=${u.is_master_mechanic}`);
    }

    console.log(`\n  Clients (first 5):`);
    for (const c of (clients || []).slice(0, 5)) {
        const motoCount = (c.motorcycles || []).length;
        console.log(`    ${c.full_name.padEnd(25)} | phone=${c.phone} | motos=${motoCount}`);
    }
}

async function main() {
    console.log('🚀 MotoPartes Migration: Supabase Cache → Dokploy PostgreSQL\n');

    await login();
    await migrateProfiles();
    await migrateClients();
    await migrateMotorcycles();
    await verifyFinal();

    console.log('\n✅ Migration complete!');
}

main().catch(e => {
    console.error('💥 Fatal error:', e);
    process.exit(1);
});
