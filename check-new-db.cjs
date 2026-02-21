const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const id = 'c4786cb3c1b2'; // New candidate
    // Try motopartes user first, if fail try postgres
    c.exec(`docker exec ${id} psql -U motopartes -d motopartes -c "SELECT count(*) FROM clients;" || docker exec ${id} psql -U postgres -d motopartes -c "SELECT count(*) FROM clients;"`, (err, stream) => {
        stream.pipe(process.stdout);
        stream.stderr.pipe(process.stderr);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
