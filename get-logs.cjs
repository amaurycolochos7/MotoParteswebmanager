const { Client } = require('ssh2');

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
    const fs = require('fs');
    // ...
    const cmd = `cd ${config.remotePath} && docker compose logs api --tail 200`;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        const logFile = fs.createWriteStream('remote_api.log');
        stream.on('close', (code, signal) => {
            conn.end();
            console.log('Logs saved to remote_api.log');
        }).on('data', (data) => {
            logFile.write(data);
        }).stderr.on('data', (data) => {
            logFile.write(data);
        });
    });
}).connect(config);
