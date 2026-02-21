const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Run migration and capture output to file
    c.exec('docker exec app-reboot-neural-alarm-2wz9br node /app/scripts/migrate-motos.js > /root/migration.log 2>&1', (err, stream) => {
        stream.on('close', () => {
            console.log('Migration finished (or failed). Reading log...');
            c.exec('cat /root/migration.log', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => c.end());
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
