const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiContainerName = 'app-reboot-neural-alarm-2wz9br';

    c.exec(`docker ps --filter name=${apiContainerName} --format "{{.ID}}"`, (err, stream) => {
        let containerId = '';
        stream.on('data', d => containerId += d.toString().trim());
        stream.on('close', () => {
            console.log(`API Container ID: ${containerId}`);
            if (!containerId) { c.end(); return; }

            const scriptPath = path.join(__dirname, 'apps/api/scripts/migrate-from-supabase.js');
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');
            const b64 = Buffer.from(scriptContent).toString('base64');

            // Limit output length for debugging
            console.log(`Script size: ${scriptContent.length} bytes`);

            // Use node inside container to write file
            const cmd = `docker exec ${containerId} node -e "const fs=require('fs'); fs.mkdirSync('/app/scripts', {recursive:true}); fs.writeFileSync('/app/scripts/migrate-from-supabase.js', Buffer.from('${b64}', 'base64')); console.log('File written');"`;

            c.exec(cmd, (err, stream) => {
                stream.pipe(process.stdout);
                stream.stderr.pipe(process.stderr);
                stream.on('close', () => {
                    console.log('Running script...');
                    c.exec(`docker exec ${containerId} node scripts/migrate-from-supabase.js`, (err, stream) => {
                        stream.pipe(process.stdout);
                        stream.stderr.pipe(process.stderr);
                        stream.on('close', () => c.end());
                    });
                });
            });
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
