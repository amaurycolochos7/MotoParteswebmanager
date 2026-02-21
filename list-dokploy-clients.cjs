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

async function listClients() {
    console.log('🔍 LISTADO COMPLETO DE CLIENTES EN DOKPLOY...\n');

    if (!await login()) return;

    try {
        const res = await fetch(`${API_BASE}/clients`, {
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });
        const clients = await res.json();
        const sorted = clients.sort((a, b) => a.full_name.localeCompare(b.full_name));

        console.log(`✅ TOTAL CLIENTES: ${clients.length}`);
        console.log('----------------------------------------');
        sorted.forEach((c, i) => {
            console.log(`${(i + 1).toString().padStart(2)}. ${c.full_name.padEnd(30)} (${c.phone})`);
        });
        console.log('----------------------------------------');
    } catch (e) {
        console.log(`❌ Error obteniendo clientes: ${e.message}`);
    }
}

listClients();
