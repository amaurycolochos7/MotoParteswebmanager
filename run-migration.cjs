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

            const scriptPath = path.join(__dirname, 'apps/api/scripts/migrate-from-supabase.js');
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');

            c.sftp((err, sftp) => {
                if (err) { console.error('SFTP Error:', err); c.end(); return; }
                const remoteTmp = '/tmp/migrate-from-supabase.js';
                const writeStream = sftp.createWriteStream(remoteTmp);
                writeStream.write(scriptContent);
                writeStream.end();
                writeStream.on('close', () => {
                    console.log('Uploaded to host /tmp');
                    // Ensure target directory exists
                    c.exec(`docker exec ${containerId} mkdir -p /app/scripts`, (err, stream) => {
                        stream.on('close', () => {
                            // Copy file
                            c.exec(`docker cp ${remoteTmp} ${containerId}:/app/scripts/migrate-from-supabase.js`, (err, stream) => {
                                stream.on('close', () => {
                                    console.log('Copied to container');
                                    // Verify and Run
                                    c.exec(`docker exec ${containerId} ls -l /app/scripts/migrate-from-supabase.js && docker exec ${containerId} node scripts/migrate-from-supabase.js`, (err, stream) => {
                                        stream.pipe(process.stdout);
                                        stream.stderr.pipe(process.stderr);
                                        stream.on('close', () => c.end());
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
