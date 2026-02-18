const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const dbId = '475b3426cc79';
    c.exec(`docker exec ${dbId} psql -U motopartes -d motopartes -c "SELECT count(*) FROM clients;"`, (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
