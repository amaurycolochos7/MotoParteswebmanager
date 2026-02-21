const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    c.exec('node -v', (err, stream) => {
        stream.on('data', d => console.log('Node:', d.toString().trim()));
        stream.stderr.on('data', d => console.log('Stderr:', d.toString().trim()));
        stream.on('close', (code) => {
            console.log('Exit code:', code);
            c.end();
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
