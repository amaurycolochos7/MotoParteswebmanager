
const { Client } = require('ssh2');

const config = {
    host: '187.77.11.79',
    port: 22,
    username: 'root',
    password: 'Jomoponse-1+',
    remotePath: '/root/motopartes-manager'
};

const conn = new Client();

conn.on('ready', () => {
    console.log('🔌 Connected to VPS');

    // Find container
    conn.exec('docker ps', (err, stream) => {
        if (err) throw err;
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.on('close', () => {
            const lines = output.split('\n');
            const apiLine = lines.find(l => (l.includes('motopartes-manager-api') || l.includes('api-1')) && l.includes('Up'));

            if (!apiLine) {
                console.error('❌ API container not found.');
                conn.end();
                return;
            }

            const containerId = apiLine.split(/\s+/)[0];
            console.log(`🎯 Found API Container ID: ${containerId}`);
            console.log(`info: ${apiLine}`); // Log line to check uptime

            // Check file location and content
            // Attempt 1: Check standard path
            const checkPath = '/app/apps/api/src/routes/auth.js'; // Adjust based on monorepo structure!
            // Wait, locally it's apps/api/src/routes/auth.js
            // If Dockerfile WORKDIR is /app, then it might be /app/apps/api/... or just /app/src/... depending on how it was built.

            // Let's first find the file
            const findCmd = `docker exec ${containerId} find / -name auth.js 2>/dev/null`;
            console.log(`🔍 Searching for auth.js: ${findCmd}`);

            conn.exec(findCmd, (err, stream) => {
                let findOutput = '';
                stream.on('data', d => findOutput += d.toString());
                stream.on('close', () => {
                    console.log(`📂 Found paths:\n${findOutput}`);

                    // Read the most likely file
                    const targetFile = findOutput.split('\n').find(p => p.includes('src/routes/auth.js'));

                    if (targetFile) {
                        console.log(`📖 Reading content of: ${targetFile}`);
                        conn.exec(`docker exec ${containerId} cat ${targetFile}`, (err, stream) => {
                            let fileContent = '';
                            stream.on('data', d => fileContent += d.toString());
                            stream.on('close', () => {
                                if (fileContent.includes('[LOGIN_DEBUG]')) {
                                    console.log('✅ File contains [LOGIN_DEBUG] tags.');
                                } else {
                                    console.log('❌ File DOES NOT contain [LOGIN_DEBUG] tags.');
                                }
                                console.log('--- First 500 chars ---');
                                console.log(fileContent.substring(0, 500));
                                conn.end();
                            });
                        });
                    } else {
                        console.log('❌ Could not identify auth.js path.');
                        conn.end();
                    }
                });
            });
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
