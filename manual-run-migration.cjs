const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const apiId = '23157b9e7ffd';
    // Check if file exists
    c.exec(`docker exec ${apiId} ls -al /app/scripts/migrate-motos.js`, (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', (code) => {
            if (code === 0) {
                console.log('File found. Executing...');
                // Run with verbose output
                const supabaseUrl = 'https://evytpaczrwhrhgdkfxfk.supabase.co';
                const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eXRwYWN6cndocmhnZGtmeGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY2Mzk0MCwiZXhwIjoyMDgxMjM5OTQwfQ.zTF38VAvMboLbcuZJQ4324wcZP8U1F2Py1OF1i1Q-7M';

                const cmd = `docker exec -e SUPABASE_URL=${supabaseUrl} -e SUPABASE_SERVICE_KEY=${supabaseKey} ${apiId} node /app/scripts/migrate-motos.js`;

                c.exec(cmd, (err, stream) => {
                    stream.pipe(process.stdout);
                    stream.stderr.pipe(process.stderr);
                    stream.on('close', () => c.end());
                });
            } else {
                console.log('File not found inside container.');
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
