
const { Client } = require('ssh2');

const config = {
    host: '187.77.11.79',
    port: 22,
    username: 'root',
    password: 'Jomoponse-1+',
    remotePath: '/root/motopartes-manager'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('🔌 Connected to VPS');

    // 1. Register
    const registerCmd = `curl -v -X POST http://localhost:3010/api/auth/users -H "Content-Type: application/json" -H "Authorization: Bearer ADMIN_TOKEN_NEEDED?" -d '{"email":"debug_test_${Date.now()}@gmail.com", "password":"testpassword123", "full_name":"Debug User"}'`;

    // Wait, register endpoint requires authentication?
    // apps/api/src/routes/auth.js: fastify.post('/users', { preHandler: [authenticate] } ...
    // YES. Using /api/auth/users requires auth.
    // So I cannot register without being logged in.

    // Log message
    console.log('⚠️ Registration requires auth. Skipping registration check via API.');
    console.log('⚠️ Will try to login with a NON-EXISTENT user to confirm 401/500 behavior.');

    // We already confirmed 401 for wrong password.
    // We already confirmed 401 for non-existent user?
    // Let's verify non-existent user.

    const loginCmd = `curl -v -X POST http://localhost:3010/api/auth/login -H "Content-Type: application/json" -d '{"email":"nonexistent_${Date.now()}@gmail.com", "password":"test"}'`;

    conn.exec(loginCmd, (err, stream) => {
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.on('close', (code) => {
            console.log(`\n📬 Response Code: ${code}`);
            console.log(output);
            conn.end();
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
