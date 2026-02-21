
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
    // We reuse the Container ID found previously: 7d785bebe8b7 (from Step 263... wait, no)
    // Step 365 showed: "Real Database Container ID: 7d78... (implied from logs)"
    // Actually, Step 365 output was garbled but showed a list of emails.
    // The trick is I didn't see the ID in the output clearly.

    // I will just FIND it again using the exact same logic but print ONLY the ID first.

    conn.exec('docker network inspect motopartes-manager_motopartes-network', (err, stream) => {
        let netInfo = '';
        stream.on('data', d => netInfo += d.toString());
        stream.on('close', () => {
            try {
                const net = JSON.parse(netInfo);
                const containers = net[0].Containers;
                const pgContainerId = Object.keys(containers).find(id => {
                    const name = containers[id].Name;
                    return name.includes('db') || name.includes('postgres');
                });

                if (pgContainerId) {
                    console.log(`🎯 DB ID: ${pgContainerId}`);
                    const sql = `SELECT email, password_hash, is_active FROM profiles WHERE email = 'motoblaker91@gmail.com';`;
                    const cmd = `docker exec ${pgContainerId} psql -U postgres -d motopartes -c "${sql}"`;

                    conn.exec(cmd, (err, stream) => {
                        let out = '';
                        stream.on('data', d => out += d.toString());
                        stream.on('close', () => {
                            console.log(out);
                            conn.end();
                        });
                    });
                } else {
                    conn.end();
                }
            } catch (e) {
                conn.end();
            }
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
