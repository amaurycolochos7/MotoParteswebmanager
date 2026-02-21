const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const cmd = `docker rm -f proxy-3011 || true; docker run -d --name proxy-3011 --net dokploy-network -p 3011:3011 alpine sh -c "apk add --no-cache socat && socat TCP-LISTEN:3011,fork TCP:10.0.1.221:3002"`;
    c.exec(cmd, (err, stream) => {
        stream.pipe(process.stdout);
        stream.stderr.pipe(process.stderr);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
