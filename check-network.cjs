const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // 1. Inspect service ports
    c.exec('docker service inspect app-calculate-cross-platform-monitor-n39v21 --format "{{json .Endpoint.Ports}}"', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('clone', () => { });
    });

    // 2. Check netstat
    c.exec('netstat -tulpn | grep 3002', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
