const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const container = 'postgres-index-virtual-system-t2hbwn';
    const cmd = `docker exec ${container} psql -U motopartes -d motopartes -c "SELECT id, email, created_at FROM profiles; SELECT created_by, count(*) FROM clients GROUP BY created_by;"`;
    c.exec(cmd, (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
