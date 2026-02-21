const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Check migration log
    c.exec('cat /root/migration.log', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => {
            // Check DB as postgres
            c.exec('docker exec motopartes-manager-postgres-1 psql -U postgres -d motopartes -c "SELECT count(*) FROM clients; SELECT count(*) FROM motorcycles;"', (err, stream) => {
                stream.pipe(process.stdout);
                stream.stderr.pipe(process.stderr);
                stream.on('close', () => c.end());
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
