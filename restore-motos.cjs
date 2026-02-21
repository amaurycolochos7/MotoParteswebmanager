const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiId = '23157b9e7ffd';

    // Read local migrate-motos.js
    const scriptPath = path.join(__dirname, 'apps/api/scripts/migrate-motos.js');
    const content = fs.readFileSync(scriptPath, 'utf8');

    // Encode base64
    const b64 = Buffer.from(content).toString('base64');

    // Write to container
    const writeCmd = `docker exec ${apiId} node -e "const fs = require('fs'); fs.mkdirSync('/app/scripts', {recursive:true}); fs.writeFileSync('/app/scripts/migrate-motos.js', Buffer.from('${b64}', 'base64'))"`;

    c.exec(writeCmd, (err, stream) => {
        stream.on('close', () => {
            console.log('Uploaded script. Executing...');
            // Run
            c.exec(`docker exec ${apiId} node /app/scripts/migrate-motos.js`, (err, stream) => {
                stream.pipe(process.stdout);
                stream.stderr.pipe(process.stderr);
                stream.on('close', () => c.end());
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
