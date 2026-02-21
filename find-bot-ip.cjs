const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // List all containers with ID/Image/Names
    c.exec('docker ps --format "{{.ID}} {{.Image}} {{.Names}}"', (err, stream) => {
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.on('close', () => {
            const lines = output.trim().split('\n');
            // flexible search for 'whatsapp' or 'monitor' or specific image name
            const target = lines.find(l => l.includes('whatsapp') || l.includes('monitor'));
            console.log(`Target Container Line: ${target}`);

            if (target) {
                const id = target.split(' ')[0];
                c.exec(`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${id}`, (err, stream) => {
                    stream.pipe(process.stdout);
                    stream.on('close', () => c.end());
                });
            } else {
                console.log('No container found'); // Should not happen if app is running
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
