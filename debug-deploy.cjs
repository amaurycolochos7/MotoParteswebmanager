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
    // Run explicit build to see errors
    const cmd = `cd ${config.remotePath} && docker compose build --no-cache --progress=plain`;

    console.log('🏗️ Executing build...');
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Build finished with code ' + code);
            conn.end();
        }).on('data', (data) => {
            console.log(data.toString());
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data.toString());
        });
    });
}).connect(config);
