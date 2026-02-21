const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const id = '475b3426cc79';
    c.exec(`docker exec ${id} psql -U motopartes -d motopartes -c "SELECT count(*) FROM motorcycles;"`, (err, stream) => {
        stream.pipe(process.stdout);
        stream.stderr.pipe(process.stderr);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
