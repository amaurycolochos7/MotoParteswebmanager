const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Check compose file on VPS used by dokploy
    // Dokploy usually stores projects in /etc/dokploy/projects or similar?
    // Or just check docker inspect again to see port bindings.
    // The previous output of diagnose-bot ONLY showed Env vars.
    // I need PORTS.

    c.exec(`docker ps --filter name=app-calculate-cross-platform-monitor --format "{{.Ports}}"`, (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
