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

    // 1. List containers (raw output)
    conn.exec('docker ps', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', (d) => output += d.toString());
        stream.on('close', () => {
            console.log('--- Docker PS ---');
            // console.log(output);

            const lines = output.split('\n');
            // Look for container with name containing 'api' and ensure it is Up
            const apiLine = lines.find(l => (l.includes('motopartes-manager-api') || l.includes('api-1')) && l.includes('Up'));

            if (!apiLine) {
                console.error('❌ API container not found or not running.');
                console.log('Full Output:\n' + output);
                conn.end();
                return;
            }

            const containerId = apiLine.split(/\s+/)[0];
            console.log(`🎯 Found API Container ID: ${containerId}`);

            // 2. Execute Seed
            const cmd = `docker exec ${containerId} node prisma/seed.js`;
            console.log(`🌱 Running: ${cmd}`);

            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code) => {
                    console.log(`✅ Seed finished with code ${code}`);
                    conn.end();
                });
                stream.on('data', d => console.log('STDOUT: ' + d));
                stream.stderr.on('data', d => console.log('STDERR: ' + d));
            });
        });
    });
}).connect(config);
