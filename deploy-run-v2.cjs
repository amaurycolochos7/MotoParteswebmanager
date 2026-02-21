const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiId = '23157b9e7ffd';
    const localPath = path.join(__dirname, 'apps/api/scripts/migrate-motos.js');
    const remotePath = '/tmp/migrate-motos-v2.js';
    const supabaseUrl = 'https://evytpaczrwhrhgdkfxfk.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eXRwYWN6cndocmhnZGtmeGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY2Mzk0MCwiZXhwIjoyMDgxMjM5OTQwfQ.zTF38VAvMboLbcuZJQ4324wcZP8U1F2Py1OF1i1Q-7M';

    c.sftp((err, sftp) => {
        if (err) throw err;
        const readStream = fs.createReadStream(localPath);
        const writeStream = sftp.createWriteStream(remotePath);
        writeStream.on('close', () => {
            console.log('Uploaded v2 to /tmp');
            // Copy to container
            c.exec(`docker exec ${apiId} mkdir -p /app/scripts && docker cp ${remotePath} ${apiId}:/app/scripts/migrate-motos.js`, (err, stream) => {
                stream.on('close', () => {
                    console.log('Copied. Executing...');
                    const cmd = `docker exec -e SUPABASE_URL=${supabaseUrl} -e SUPABASE_SERVICE_KEY=${supabaseKey} ${apiId} node /app/scripts/migrate-motos.js`;
                    c.exec(cmd, (err, stream) => {
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
