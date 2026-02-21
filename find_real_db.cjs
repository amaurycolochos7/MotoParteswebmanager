
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
    conn.exec('docker network inspect motopartes-manager_motopartes-network', (err, stream) => {
        let netInfo = '';
        stream.on('data', d => netInfo += d.toString());
        stream.on('close', () => {
            console.log('--- Network Info ---');
            // Parse JSON manually or just search for postgres
            try {
                const net = JSON.parse(netInfo);
                const containers = net[0].Containers;
                console.log(JSON.stringify(containers, null, 2));

                // Find the ID of the container named 'db' or 'postgres'
                const pgContainerId = Object.keys(containers).find(id => {
                    const name = containers[id].Name;
                    return name.includes('db') || name.includes('postgres');
                });

                if (pgContainerId) {
                    console.log(`\n🎯 REAL Database Container ID: ${pgContainerId}`);
                    // Now check users in THIS container
                    const sql = `SELECT email FROM profiles WHERE email LIKE '%moto%';`;
                    const cmd = `docker exec ${pgContainerId} psql -U postgres -d motopartes -c "${sql}"`;
                    console.log(`🔍 Checking users: ${cmd}`);
                    conn.exec(cmd, (err, stream) => {
                        stream.pipe(process.stdout);
                        stream.on('close', () => conn.end());
                    });
                } else {
                    console.log('❌ No postgres container found in network.');
                    conn.end();
                }
            } catch (e) {
                console.log(netInfo); // Fallback
                conn.end();
            }
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
