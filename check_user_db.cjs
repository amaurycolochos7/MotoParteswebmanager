
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

    // Find DB container
    conn.exec('docker ps', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.on('close', () => {
            const lines = output.split('\n');
            const dbLine = lines.find(l => l.includes('postgres'));

            if (dbLine) {
                const containerId = dbLine.split(/\s+/)[0];
                console.log(`🎯 Found Postgres Container ID: ${containerId}`);

                const sql = `SELECT email, password_hash FROM profiles WHERE email = 'motobkaker@gmail.com';`;
                const cmd = `docker exec ${containerId} psql -U postgres -d motopartes -c "${sql}"`;

                console.log(`🔍 Executing SQL: ${cmd}`);
                conn.exec(cmd, (err, stream) => {
                    let sqlOutput = '';
                    stream.on('data', d => sqlOutput += d.toString());
                    stream.on('close', () => {
                        console.log('\n--- SQL Result ---');
                        console.log(sqlOutput);
                        conn.end();
                    });
                });
            } else {
                console.log('❌ No Postgres container found.');
                conn.end();
            }
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
