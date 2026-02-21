
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

            // RESTART
            const cmd = `docker restart ${containerId}`;
            console.log(`🔄 Restarting container: ${cmd}`);

            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code) => {
                    console.log(`✅ Restart command finished with code ${code}`);

                    // Verify uptime
                    setTimeout(() => {
                        conn.exec(`docker ps --filter "id=${containerId}"`, (err, stream) => {
                            stream.pipe(process.stdout);
                            stream.on('close', () => conn.end());
                        });
                    }, 2000);
                });
                stream.stdout.on('data', d => process.stdout.write(d));
                stream.stderr.on('data', d => process.stderr.write(d));
            });
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
