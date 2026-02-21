
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

    // We already know the port is 3010 from previous logs
    const cmd = `curl -v -X POST http://localhost:3010/api/auth/login -H "Content-Type: application/json" -d '{"email":"motoblaker91@gmail.com", "password":"wrongpassword"}'`;
    console.log(`🚀 Sending request from HOST: ${cmd}`);

    conn.exec(cmd, (err, stream) => {
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.stderr.on('data', d => output += d.toString());

        stream.on('close', (code) => {
            console.log(`\n📬 Response Code: ${code}`);
            console.log(output);

            // Fetch logs immediately for container 31bc5a1b88cc (API)
            conn.exec('docker logs --tail 20 31bc5a1b88cc', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => conn.end());
            });
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
