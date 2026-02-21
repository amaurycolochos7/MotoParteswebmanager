const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiId = '23157b9e7ffd';
    // Try to resolve common hostnames or just check /etc/hosts?
    // Or check full env again?
    // Let's print full env properly with less truncation risk (split lines)
    c.exec(`docker exec ${apiId} env`, (err, stream) => {
        let env = '';
        stream.on('data', d => env += d.toString());
        stream.on('close', () => {
            const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='));
            console.log(dbUrl);
            if (dbUrl) {
                const host = dbUrl.match(/@([^:]+):/)[1];
                console.log(`DB Host: ${host}`);
                c.exec(`docker exec ${apiId} ping -c 1 ${host}`, (err, stream) => {
                    stream.pipe(process.stdout);
                    stream.on('close', () => c.end());
                });
            } else {
                console.log('No DATABASE_URL found');
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
