import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

console.log('Client is:', Client);
try {
    console.log('Initializing with LocalAuth...');
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'test-session',
            dataPath: './.wwebjs_auth_test'
        }),
        puppeteer: { headless: true, args: ['--no-sandbox'] }
    });

    client.initialize().then(() => {
        console.log('Initialized!');
        process.exit(0);
    }).catch(err => {
        console.error('Initialization failed:', err);
        process.exit(1);
    });
} catch (err) {
    console.error('Error instantiating:', err);
}
