const fs = require('fs');

const API_BASE = 'http://187.77.11.79:3010/api';
let TOKEN = '';

async function login() {
    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@motopartes.com', password: 'admin123' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(data));
        TOKEN = data.token;
        return true;
    } catch (e) {
        console.error('Login failed:', e.message);
        return false;
    }
}

async function getCount(endpoint, name) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });
        const data = await res.json();
        const count = Array.isArray(data) ? data.length : (data.count || '?');
        console.log(`✅ ${name.padEnd(20)}: ${count} records`);
        return data; // Return data for potential detail display
    } catch (e) {
        console.log(`❌ ${name.padEnd(20)}: Error (${e.message})`);
        return null;
    }
}

async function verify() {
    console.log('🔍 VERIFICANDO DATOS EN DOKPLOY (vía API)...\n');

    if (!await login()) return;

    await getCount('/auth/users', 'Usuarios (Perfiles)');
    await getCount('/clients', 'Clientes');
    const motos = await getCount('/motorcycles', 'Motocicletas');
    await getCount('/orders', 'Órdenes');
    await getCount('/services', 'Servicios');

    if (motos && motos.length > 0) {
        console.log('\n📋 Muestra de Motocicletas (primeras 5):');
        motos.slice(0, 5).forEach(m => {
            console.log(`   - ${m.brand} ${m.model} (${m.plates || 'S/P'})`);
        });
    }
}

verify();
