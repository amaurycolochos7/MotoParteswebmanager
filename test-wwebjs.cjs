// Test script to debug what client.initialize() is doing
const { Client, LocalAuth } = require('whatsapp-web.js');

async function test() {
    console.log('Creating client...');
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'test-session',
            dataPath: '/app/data/wwebjs_auth',
        }),
        webVersionCache: {
            type: 'none',
        },
        puppeteer: {
            headless: true,
            executablePath: '/usr/bin/chromium',
            timeout: 90000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--no-first-run',
            ],
        },
    });

    client.on('qr', (qr) => {
        console.log('=== QR GENERATED ===');
        console.log('QR length:', qr.length);
        process.exit(0);
    });

    client.on('ready', () => {
        console.log('=== READY ===');
        process.exit(0);
    });

    client.on('auth_failure', (msg) => {
        console.log('=== AUTH FAILURE ===', msg);
        process.exit(1);
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`Loading: ${percent}% - ${message}`);
    });

    client.on('change_state', (state) => {
        console.log('State changed to:', state);
    });

    console.log('Calling client.initialize()...');

    try {
        await Promise.race([
            client.initialize(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT after 90s')), 90000)
            ),
        ]);
        console.log('initialize() resolved');
    } catch (err) {
        console.error('initialize() failed:', err.message);
        console.error(err.stack);
        // Try to get browser info
        try {
            if (client.pupBrowser) {
                const pages = await client.pupBrowser.pages();
                for (const p of pages) {
                    console.log('Page URL:', await p.url());
                    console.log('Page title:', await p.title());
                }
            }
        } catch (e) {
            console.error('Could not get browser info:', e.message);
        }
    }

    process.exit(1);
}

test();
