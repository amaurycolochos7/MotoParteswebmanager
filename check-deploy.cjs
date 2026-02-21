const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Check if port 3011 is listening
    c.exec('netstat -tulpn | grep 3011', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log('--- Container Info ---');
            c.exec('docker ps --filter name=whatsapp-bot --format "{{.ID}} {{.Status}} {{.Ports}}"', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => c.end());
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
