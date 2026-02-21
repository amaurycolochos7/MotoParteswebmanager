const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // We need to find the correct container first or assume name is stable
    const container = 'postgres-index-virtual-system-t2hbwn';
    // Use PGPASSWORD to ensure non-interactive auth if needed (though usually trusted for root local)
    // We'll just try to cat specific columns
    const cmd = `docker exec ${container} psql -U motopartes -d motopartes -c "SELECT id, email FROM profiles;" && docker exec ${container} psql -U motopartes -d motopartes -c "SELECT id, full_name, created_by FROM clients LIMIT 5;"`;
    c.exec(cmd, (err, stream) => {
        stream.pipe(process.stdout);
        stream.stderr.pipe(process.stderr);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
