
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
    conn.exec('docker ps -q --filter "ancestor=motopartes-manager-api" --filter "status=running"', (err, stream) => {
        let id = '';
        stream.on('data', d => id += d.toString().trim());
        stream.on('close', () => {
            if (id) {
                console.log(`🎯 API ID: ${id}`);
                conn.exec(`docker logs --tail 100 ${id}`, (err, stream) => {
                    let logs = '';
                    stream.on('data', d => logs += d.toString());
                    stream.on('close', () => {
                        console.log('--- LOGS START ---');
                        console.log(logs);
                        console.log('--- LOGS END ---');
                        conn.end();
                    });
                });
            } else {
                console.log('❌ API container not found');
                conn.end();
            }
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
