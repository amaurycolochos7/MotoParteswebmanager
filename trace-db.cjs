const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Find API container
    c.exec('docker ps --filter name=motopartes-api --format "{{.ID}}"', (err, stream) => {
        let apiId = '';
        stream.on('data', d => apiId += d.toString().trim());
        stream.on('close', () => {
            console.log(`API ID: ${apiId}`);
            if (apiId) {
                // Inspect API Env
                c.exec(`docker inspect --format "{{json .Config.Env}}" ${apiId}`, (err, stream) => {
                    stream.pipe(process.stdout);
                    stream.on('close', () => {
                        // Resolve 'postgres' host from API container
                        // We assume hostname is 'postgres' from previous knowledge, but let's check env.
                        // Then ping it to get IP.
                        c.exec(`docker exec ${apiId} getent hosts postgres`, (err, stream) => {
                            stream.pipe(process.stdout);
                            stream.on('close', () => c.end());
                        });
                    });
                });
            } else {
                console.log('API container not found');
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
