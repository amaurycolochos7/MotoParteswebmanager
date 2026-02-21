const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Get container ID for bot
    c.exec('docker ps --filter name=whatsapp-bot --format "{{.ID}}"', (err, stream) => {
        let id = '';
        stream.on('data', d => id += d.toString().trim());
        stream.on('close', () => {
            console.log(`Container ID: ${id}`);
            if (id) {
                // Inspect IP
                c.exec(`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${id}`, (err, stream) => {
                    stream.pipe(process.stdout);
                    stream.on('close', () => c.end());
                });
            } else {
                console.log('No container found');
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
