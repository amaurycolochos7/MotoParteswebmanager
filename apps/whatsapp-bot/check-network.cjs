const https = require('http');

const hosts = [
    'api',
    'motopartes-api',
    'app-reboot-neural-alarm-2wz9br', // From original nginx.conf
    'host.docker.internal'
];

async function checkHost(host) {
    return new Promise((resolve) => {
        const req = https.get(`http://${host}:3000/api/health`, (res) => {
            console.log(`✅ ${host}: ${res.statusCode} ${res.statusMessage}`);
            resolve(true);
        });

        req.on('error', (e) => {
            console.log(`❌ ${host}: ${e.message}`);
            resolve(false);
        });

        // Timeout in case it hangs
        req.setTimeout(2000, () => {
            console.log(`❌ ${host}: Timeout`);
            req.destroy();
            resolve(false);
        });
    });
}

async function main() {
    console.log('Probing internal hosts...');
    for (const host of hosts) {
        await checkHost(host);
    }
}

main();
