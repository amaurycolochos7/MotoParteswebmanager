const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    c.exec('ps aux | grep migrate-motos', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
