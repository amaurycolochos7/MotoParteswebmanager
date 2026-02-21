const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const id = 'c4786cb3c1b2';
    c.exec(`docker inspect --format "{{json .Config.Env}}" ${id}`, (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
