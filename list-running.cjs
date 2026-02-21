const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // List strictly running containers with Ports info
    c.exec('docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Ports}}"', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
