const API_URL = 'https://motopartes.cloud/api';

const credentials = [
    { email: 'motoblaker91@gmail.com', password: 'admin123' },
    { email: 'admin_maestro_motopartes@gmail.com', password: 'AdminMaestroMotopartes123321*' },
    { email: 'maciel77@gmail.com', password: 'admin123' },
    { email: 'jairoaramires82@gmail.com', password: 'jairo123' },
    // Default seed user
    { email: 'admin@motopartes.com', password: 'admin123' }
];

async function testLogin(email, password) {
    console.log(`Testing ${email} ...`);
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (res.ok) {
            const data = await res.json();
            console.log(`✅ SUCCESS: ${email} (Role: ${data.user.role})`);
        } else {
            console.log(`❌ FAILED: ${email} (Status: ${res.status})`);
        }
    } catch (err) {
        console.log(`⚠️ ERROR: ${email} (${err.message})`);
    }
}

async function main() {
    console.log(`Target: ${API_URL}`);
    for (const cred of credentials) {
        await testLogin(cred.email, cred.password);
    }
}

main();
