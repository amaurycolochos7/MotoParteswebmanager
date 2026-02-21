
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

    // Inspect API container to see its network
    conn.exec('docker inspect --format="{{json .NetworkSettings.Networks}}" motopartes-manager-api-1', (err, stream) => {
        let apiNet = '';
        stream.on('data', d => apiNet += d.toString());
        stream.on('close', () => {
            console.log('--- API Networks ---');
            console.log(apiNet);

            // List all postgres containers with their IDs and Networks
            conn.exec('docker ps --filter "ancestor=postgres:16" --format "{{.ID}} {{.Names}}"', (err, stream) => {
                let pgContainers = '';
                stream.on('data', d => pgContainers += d.toString());
                stream.on('close', () => {
                    const lines = pgContainers.trim().split('\n');
                    console.log('\n--- Postgres Containers ---');
                    console.log(pgContainers);

                    lines.forEach(line => {
                        const [id, name] = line.split(' ');
                        const cmd = `docker inspect --format="{{json .NetworkSettings.Networks}}" ${id}`;
                        conn.exec(cmd, (err, stream) => {
                            stream.pipe(process.stdout);
                        });
                    });

                    setTimeout(() => conn.end(), 2000);
                });
            });
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
