
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

    // Simple curl
    conn.exec('curl -v -X POST http://localhost:3010/api/auth/login -H "Content-Type: application/json" -d \'{"email":"motobkaker@gmail.com", "password":"wrongpassword"}\'', (err, stream) => {
        if (err) throw err;
        let stdout = '';
        let stderr = '';
        stream.on('data', d => stdout += d.toString());
        stream.stderr.on('data', d => stderr += d.toString());
        stream.on('close', (code) => {
            console.log(`Exit code: ${code}`);
            console.log('--- STDOUT ---');
            console.log(stdout);
            console.log('--- STDERR ---');
            console.log(stderr);
            conn.end();
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
