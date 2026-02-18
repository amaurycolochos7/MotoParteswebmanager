const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    // Get container ID and Status
    c.exec(`docker ps --filter name=app-calculate-cross-platform-monitor --format "{{.ID}} {{.Status}} {{.Image}}"`, (err, stream) => {
        let containerInfo = '';
        stream.on('data', d => containerInfo += d.toString());
        stream.on('close', () => {
            console.log(`Container Info: ${containerInfo.trim()}`);
            const id = containerInfo.split(' ')[0];
            if (id) {
                // Get Env vars to check PUPPETEER_EXECUTABLE_PATH
                c.exec(`docker inspect ${id} --format "{{json .Config.Env}}"`, (err, stream) => {
                    stream.pipe(process.stdout);
                    stream.on('close', () => {
                        // Get Logs
                        console.log('\n--- LOGS ---');
                        c.exec(`docker logs --tail 50 ${id} 2>&1`, (err, stream) => {
                            stream.pipe(process.stdout);
                            stream.on('close', () => c.end());
                        });
                    });
                });
            } else {
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
