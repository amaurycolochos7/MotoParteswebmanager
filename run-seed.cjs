const { Client } = require('ssh2');
const fs = require('fs');

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
    // Grep specifically for our containers
    conn.exec('docker ps -a | grep motopartes', (err, stream) => {
        if (err) throw err;
        const outFile = fs.createWriteStream('vps_motopartes_containers.txt');
        stream.pipe(outFile);
        stream.on('close', () => {
            console.log('Saved vps_containers.txt');
            conn.end();
        });
    });
}).connect(config);
