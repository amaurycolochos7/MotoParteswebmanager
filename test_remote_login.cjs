
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

    // Find container
    conn.exec('docker ps', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.on('close', () => {
            const lines = output.split('\n');
            const apiLine = lines.find(l => (l.includes('motopartes-manager-api') || l.includes('api-1')) && l.includes('Up'));

            if (!apiLine) {
                console.error('❌ API container not found.');
                conn.end();
                return;
            }

            const containerId = apiLine.split(/\s+/)[0];
            console.log(`🎯 Found API Container ID: ${containerId}`);

            // Run curl INSIDE the container to bypass Nginx
            // We'll try to hit the login endpoint with missing creds to force a 400/401 log
            // OR with the target email to see if it triggers the debug log

            const curlCmd = `docker exec ${containerId} curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"motobkaker@gmail.com", "password":"test"}'`;
            console.log(`🚀 Sending test request: ${curlCmd}`);

            conn.exec(curlCmd, (err, stream) => {
                let curlOutput = '';
                stream.on('data', d => curlOutput += d.toString());
                stream.on('close', (code) => {
                    console.log(`\n📬 Response Code: ${code}`);
                    console.log(`📄 Response Body: ${curlOutput}`);

                    // Now fetch the logs immediately
                    console.log('\n📜 Checking logs again...');
                    conn.exec(`docker logs --tail 20 ${containerId}`, (err, stream) => {
                        stream.pipe(process.stdout);
                        stream.on('close', () => conn.end());
                    });
                });
            });
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
