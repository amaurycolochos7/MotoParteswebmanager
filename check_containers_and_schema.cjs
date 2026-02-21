
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

    // 1. List ALL containers to detect duplicates or confusion
    conn.exec('docker ps -a --format "table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', (d) => output += d.toString());
        stream.on('close', () => {
            console.log('\n--- 🐳 Docker Containers ---');
            console.log(output);

            // 2. Read Schema from inside the container (to be sure what code has)
            // We'll pick the first 'motopartes-manager-api' found
            const lines = output.split('\n');
            const apiLine = lines.find(l => (l.includes('motopartes-manager-api') || l.includes('api-1')) && l.includes('Up'));

            if (apiLine) {
                const containerId = apiLine.split(/\s+/)[0];
                console.log(`\n--- 📜 Checking Schema in Container ${containerId} ---`);
                const cmd = `docker exec ${containerId} cat apps/api/prisma/schema.prisma`;

                conn.exec(cmd, (err, stream) => {
                    let schemaOutput = '';
                    stream.on('data', d => schemaOutput += d.toString());
                    stream.on('close', () => {
                        console.log(schemaOutput.substring(0, 2000)); // First 2000 chars should cover Profile
                        // specifically look for is_active
                        if (schemaOutput.includes('is_active')) {
                            console.log('\n✅ "is_active" field FOUND in schema.');
                        } else {
                            console.log('\n❌ "is_active" field NOT FOUND in schema.');
                        }
                        conn.end();
                    });
                });
            } else {
                console.log('❌ No running API container found.');
                conn.end();
            }
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
