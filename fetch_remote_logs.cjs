
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

    conn.exec('docker ps', (err, stream) => {
        if (err) {
            console.error('Error executing docker ps:', err);
            conn.end();
            return;
        }

        let output = '';
        stream.on('data', (d) => output += d.toString());
        stream.on('close', (code) => {
            const lines = output.split('\n');
            // Look for any container that looks like the API
            const apiLine = lines.find(l => (l.includes('motopartes-manager-api') || l.includes('api-1')) && l.includes('Up'));

            if (!apiLine) {
                console.error('❌ API container not found or not running.');
                console.log('Docker PS Output:', output);
                conn.end();
                return;
            }

            const containerId = apiLine.split(/\s+/)[0];
            console.log(`🎯 Found API Container ID: ${containerId}`);

            // Fetch Logs - increased tail to catch more context
            const cmd = `docker logs --tail 500 ${containerId}`;
            console.log(`📜 Fetching logs...`);

            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                const fs = require('fs');
                fs.writeFileSync('remote_logs.txt', '');

                stream.on('close', (code) => {
                    console.log(`✅ Logs fetched to remote_logs.txt`);
                    conn.end();
                });
                stream.on('data', d => fs.appendFileSync('remote_logs.txt', d));
                stream.stderr.on('data', d => fs.appendFileSync('remote_logs.txt', d));
            });
        });
        stream.stderr.on('data', (d) => {
            console.error('Docker PS stderr:', d.toString());
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
