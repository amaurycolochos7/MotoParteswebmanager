const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const id = 'av27saha98ou'; // WhatsApp bot service name part... wait, I need the container ID.
    // Let's find the container for 'app-calculate-cross-platform-monitor'
    c.exec(`docker ps --filter name=app-calculate-cross-platform-monitor --format "{{.ID}}"`, (err, stream) => {
        let containerId = '';
        stream.on('data', d => containerId += d.toString().trim());
        stream.on('close', () => {
            console.log(`Container ID: ${containerId}`);
            if (containerId) {
                c.exec(`docker logs --tail 100 ${containerId} 2>&1`, (err, stream) => {
                    stream.pipe(process.stdout);
                    stream.on('close', () => c.end());
                });
            } else {
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
