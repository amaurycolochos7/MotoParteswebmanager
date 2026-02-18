const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const serviceName = 'app-calculate-cross-platform-monitor-n39v21';
    c.exec(`docker service update --publish-add 3002:3002 ${serviceName}`, (err, stream) => {
        if (err) { console.error(err); c.end(); return; }
        stream.pipe(process.stdout);
        stream.on('close', () => {
            console.log('\nPort published.');
            c.end();
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
