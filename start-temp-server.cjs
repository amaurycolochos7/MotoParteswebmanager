const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Start python server in background
    c.exec('nohup python3 -m http.server 3011 > server.log 2>&1 & echo $!', (err, stream) => {
        stream.on('data', d => {
            const pid = d.toString().trim();
            console.log(`Server PID: ${pid}`);
            // Wait 2s then exit (server keeps running)
            setTimeout(() => c.end(), 2000);
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
