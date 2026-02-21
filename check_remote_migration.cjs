
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

    // Find API container
    conn.exec('docker ps', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', (d) => output += d.toString());
        stream.on('close', () => {
            const lines = output.split('\n');
            // Look for motopartes-manager-api-1
            const apiLine = lines.find(l => l.includes('motopartes-manager-api-1')); // Specific name

            if (!apiLine) {
                console.error('❌ API container not found.');
                conn.end();
                return;
            }

            const containerId = apiLine.split(/\s+/)[0];
            console.log(`🎯 Found API Container ID: ${containerId}`);

            // Run migrate status
            const cmd = `docker exec ${containerId} npx prisma migrate status`;
            console.log(`🔍 Running: ${cmd}`);

            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code) => {
                    console.log(`✅ Command finished with code ${code}`);
                    conn.end();
                });
                stream.on('data', d => process.stdout.write(d));
                stream.stderr.on('data', d => process.stdout.write(d));
            });
        });
    });
}).connect(config);
