const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiId = '23157b9e7ffd';
    const localPath = path.join(__dirname, 'apps/api/scripts/migrate-motos.js');
    const remotePath = '/tmp/migrate-motos.js';

    c.sftp((err, sftp) => {
        if (err) throw err;
        const readStream = fs.createReadStream(localPath);
        const writeStream = sftp.createWriteStream(remotePath);
        writeStream.on('close', () => {
            console.log('Uploaded to /tmp');
            // Copy to container
            c.exec(`docker exec ${apiId} mkdir -p /app/scripts && docker cp ${remotePath} ${apiId}:/app/scripts/migrate-motos.js`, (err, stream) => {
                stream.on('close', () => {
                    console.log('Copied to container. Executing...');
                    c.exec(`docker exec ${apiId} node /app/scripts/migrate-motos.js`, (err, stream) => {
                        stream.pipe(process.stdout);
                        stream.stderr.pipe(process.stderr);
                        stream.on('close', () => c.end());
                    });
                });
            });
        });
        readStream.pipe(writeStream);
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
