
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

    // We know the port is 3010 from previous logs (0.0.0.0:3010->3000/tcp)
    const cmd = `curl -v -X POST http://localhost:3010/api/auth/login -H "Content-Type: application/json" -d '{"email":"motobkaker@gmail.com", "password":"wrongpassword"}'`;
    console.log(`🚀 Sending request from HOST: ${cmd}`);

    conn.exec(cmd, (err, stream) => {
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.stderr.on('data', d => output += d.toString()); // Capture verbose curl output

        stream.on('close', (code) => {
            console.log(`\n📬 Response:\n${output}`);

            // Get container ID again to fetch logs
            conn.exec('docker ps -q --filter "ancestor=motopartes-manager-api" --filter "status=running"', (err, stream) => { // Try to get ID more reliably
                let id = '';
                stream.on('data', d => id += d.toString().trim());
                stream.on('close', () => {
                    if (id) {
                        console.log(`\n📜 Logs for ${id}:`);
                        conn.exec(`docker logs --tail 50 ${id}`, (err, stream) => {
                            stream.pipe(process.stdout);
                            stream.on('close', () => conn.end());
                        });
                    } else {
                        console.log('❌ Could not find container ID for logs.');
                        // Fallback to name
                        conn.exec(`docker logs --tail 50 motopartes-manager-api-1`, (err, stream) => {
                            stream.pipe(process.stdout);
                            stream.on('close', () => conn.end());
                        });
                    }
                });
            });
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
