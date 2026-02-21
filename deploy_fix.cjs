
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const config = {
    host: '187.77.11.79',
    port: 22,
    username: 'root',
    password: 'Jomoponse-1+',
    remotePath: '/root/motopartes-manager'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('🔌 Connected to VPS');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        const localPath = path.join(__dirname, 'apps/api/src/routes/auth.js');
        const remoteTempPath = '/tmp/auth.js';

        console.log(`📤 Uploading ${localPath} to ${remoteTempPath}...`);

        sftp.fastPut(localPath, remoteTempPath, (err) => {
            if (err) throw err;
            console.log('✅ Upload successful.');

            // Now Find Container and CP
            conn.exec('docker ps', (err, stream) => {
                if (err) throw err;
                let output = '';
                stream.on('data', d => output += d.toString());
                stream.on('close', () => {
                    const lines = output.split('\n');
                    const apiLine = lines.find(l => (l.includes('motopartes-manager-api') || l.includes('api-1')) && l.includes('Up'));

                    if (!apiLine) {
                        console.error('❌ API container not found.');
                        conn.end();
                        return;
                    }

                    const containerId = apiLine.split(/\s+/)[0];
                    console.log(`🎯 Found API Container ID: ${containerId}`);

                    // Copy to container and restart
                    // Path in container is likely /app/src/routes/auth.js based on standard Dockerfile
                    const cmd = `docker cp ${remoteTempPath} ${containerId}:/app/src/routes/auth.js && docker restart ${containerId}`;
                    console.log(`🚀 Executing: ${cmd}`);

                    conn.exec(cmd, (err, stream) => {
                        if (err) throw err;
                        stream.on('close', (code) => {
                            console.log(`✅ Deployment finished with code ${code}`);
                            conn.end();
                        });
                        stream.on('data', d => process.stdout.write(d));
                        stream.stderr.on('data', d => process.stdout.write(d));
                    });
                });
            });
        });
    });
}).connect(config);
