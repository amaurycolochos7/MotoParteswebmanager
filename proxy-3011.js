const net = require('net');

const SOURCE_PORT = 3011;
const TARGET_PORT = 3002;
const TARGET_HOST = '127.0.0.1';

const server = net.createServer((socket) => {
    const client = new net.Socket();

    client.connect(TARGET_PORT, TARGET_HOST, () => {
        socket.pipe(client);
        client.pipe(socket);
    });

    client.on('error', (err) => {
        console.error('Target connection error:', err.message);
        socket.end();
    });

    socket.on('error', (err) => {
        console.error('Source connection error:', err.message);
        client.end();
    });
});

server.listen(SOURCE_PORT, '0.0.0.0', () => {
    console.log(`TCP Proxy listening on port ${SOURCE_PORT} forwarding to ${TARGET_HOST}:${TARGET_PORT}`);
});
