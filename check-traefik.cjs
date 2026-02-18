const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Check Traefik
    c.exec('docker ps --filter name=traefik --format "{{.ID}} {{.Names}} {{.Ports}}"', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => {
            // Check compose file again
            c.exec('cat c:\\Users\\Amaury\\.gemini\\antigravity\\scratch\\motopartes-manager\\docker-compose.dokploy.yml', (err, stream) => { // wait, no, I have it locally? 
                // I have it locally. I will check local file.
                // Just exit.
                c.end();
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
