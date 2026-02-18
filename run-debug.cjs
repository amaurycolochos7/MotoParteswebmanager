const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiContainerName = 'app-reboot-neural-alarm-2wz9br';

    c.exec(`docker ps --filter name=${apiContainerName} --format "{{.ID}}"`, (err, stream) => {
        let containerId = '';
        stream.on('data', d => containerId += d.toString().trim());
        stream.on('close', () => {
            console.log(`API Container ID: ${containerId}`);
            if (!containerId) { c.end(); return; }

            const scriptPath = path.join(__dirname, 'apps/api/scripts/debug-migration.js');
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');

            c.sftp((err, sftp) => {
                const remoteTmp = '/tmp/debug-migration.js';
                const writeStream = sftp.createWriteStream(remoteTmp);
                writeStream.write(scriptContent);
                writeStream.end();
                writeStream.on('close', () => {
                    c.exec(`docker cp ${remoteTmp} ${containerId}:/app/scripts/debug-migration.js && docker exec ${containerId} node scripts/debug-migration.js`, (err, stream) => {
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
