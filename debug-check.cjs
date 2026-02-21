const https = require('https');

const o = {
    hostname: 'motopartes.cloud',
    path: '/api/whatsapp-bot/debug',
    method: 'GET'
};

const r = https.request(o, res => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => {
        const data = JSON.parse(b);
        // Write raw JSON to file
        const fs = require('fs');
        fs.writeFileSync('debug-output.json', JSON.stringify(data, null, 2));

        // Print only error-related logs
        const errLogs = data.logs.filter(l =>
            l.l === 'ERR' ||
            l.m.includes('Error') ||
            l.m.includes('error') ||
            l.m.includes('Step') ||
            l.m.includes('Chrome') ||
            l.m.includes('chrome') ||
            l.m.includes('❌') ||
            l.m.includes('✅') ||
            l.m.includes('🔍') ||
            l.m.includes('🔧') ||
            l.m.includes('🚀') ||
            l.m.includes('📂')
        );

        errLogs.forEach(l => {
            console.log(`[${l.l}] ${l.m}`);
        });

        console.log('\n--- SESSION DATA ---');
        data.sessions.forEach(s => {
            console.log('lastError:', s.lastError);
        });
    });
});

r.on('error', e => console.error(e));
r.end();
