const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const c = new Client();
c.on('ready', () => {
    console.log('Connected');

    const scriptPath = path.join(__dirname, 'proxy-3011.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    c.sftp((err, sftp) => {
        const remotePath = '/root/proxy-3011.js';
        const stream = sftp.createWriteStream(remotePath);
        stream.write(scriptContent);
        stream.end();
        stream.on('close', () => {
            console.log('Uploaded proxy script');
            // Check if running first
            c.exec('pkill -f "node /root/proxy-3011.js"', (err, stream) => {
                stream.on('close', () => {
                    // Run in background
                    c.exec('nohup node /root/proxy-3011.js > /root/proxy.log 2>&1 &', (err, stream) => {
                        console.log('Started proxy');
                        c.end();
                    });
                });
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
