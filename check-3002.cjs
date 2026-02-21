const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    c.exec('netstat -tulpn | grep 3002', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => {
            // also check ipv4 forwarding?
            c.end();
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
