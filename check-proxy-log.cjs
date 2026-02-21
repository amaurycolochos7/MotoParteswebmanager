const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Check running process
    c.exec('ps aux | grep proxy-3011', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log('--- LOGS ---');
            c.exec('cat /root/proxy.log', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => c.end());
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
