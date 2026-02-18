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
    const cmd = `
        cd ${config.remotePath} && \
        echo "=== Docker Compose PS ===" && \
        docker compose ps && \
        echo "\n=== API Logs ===" && \
        docker compose logs api --tail 100 && \
        echo "\n=== Bot Logs ===" && \
        docker compose logs whatsapp-bot --tail 20 && \
        echo "\n=== Netstat ===" && \
        netstat -tulpn | grep 3010 || echo "Port 3010 not found" && \
        netstat -tulpn | grep 3002 || echo "Port 3002 not found"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
            conn.end();
        }).on('data', (data) => {
            console.log(data.toString());
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).connect(config);
