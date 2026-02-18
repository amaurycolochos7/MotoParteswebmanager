const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Kill python server
    c.exec('pkill -f "python3 -m http.server 3011"', (err, stream) => {
        stream.on('close', () => {
            console.log('Killed python server');
            c.end();
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
