const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiId = '23157b9e7ffd';
    c.exec(`docker exec ${apiId} node -e "fetch('https://google.com').then(r=>console.log('STATUS:'+r.status)).catch(e=>console.error(e))"`, (err, stream) => {
        stream.pipe(process.stdout);
        stream.stderr.pipe(process.stderr);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
