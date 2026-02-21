const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // 1. Check API Logs to see if clients are being requested
    console.log('--- API LOGS ---');
    c.exec('docker logs --tail 50 app-reboot-neural-alarm-2wz9br', (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => {
            // 2. Check if migrate-motos.js exists and run it properly
            console.log('\n--- RUNNING MIGRATION ---');
            c.exec('docker exec app-reboot-neural-alarm-2wz9br ls -l /app/scripts/migrate-motos.js', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => {
                    // Exec run
                    c.exec('docker exec app-reboot-neural-alarm-2wz9br node /app/scripts/migrate-motos.js', (err, stream) => {
                        stream.pipe(process.stdout);
                        stream.stderr.pipe(process.stderr);
                        stream.on('close', () => c.end());
                    });
                });
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
