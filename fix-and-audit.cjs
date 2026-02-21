const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiId = '23157b9e7ffd';
    const dbId = '475b3426cc79'; // db swarm container

    // 1. Run migration
    console.log('--- MIGRATION OUTPUT ---');
    // Ensure script exists
    c.exec(`docker exec ${apiId} ls -l /app/scripts/migrate-motos.js`, (err, stream) => {
        stream.on('data', d => console.log(d.toString()));
        stream.on('close', () => {
            // Run it
            c.exec(`docker exec ${apiId} node /app/scripts/migrate-motos.js`, (err, stream) => {
                stream.pipe(process.stdout);
                stream.stderr.pipe(process.stderr);
                stream.on('close', () => {
                    // 2. Check ownership
                    console.log('\n--- CLIENT OWNERSHIP ---');
                    c.exec(`docker exec ${dbId} psql -U motopartes -d motopartes -c "SELECT id, email FROM profiles; SELECT id, full_name, created_by FROM clients LIMIT 5;"`, (err, stream) => {
                        stream.pipe(process.stdout);
                        stream.stderr.pipe(process.stderr);
                        stream.on('close', () => c.end());
                    });
                });
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
