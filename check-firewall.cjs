const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Check UFW
    c.exec('ufw status', (err, stream) => {
        stream.on('data', d => console.log('UFW:', d.toString()));
        stream.on('close', () => {
            // Check IPTables
            c.exec('iptables -L INPUT -n --line-numbers | grep 3002', (err, stream) => {
                stream.pipe(process.stdout);
                stream.on('close', () => c.end());
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
