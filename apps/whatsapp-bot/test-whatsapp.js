import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
// import qrcode from 'qrcode-terminal';

console.log('🧪 Starting standalone WhatsApp test...');

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'test-client' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('📱 QR RECEIVED!');
    console.log(qr);
    // qrcode.generate(qr, { small: true });
    console.log('✅ Test successful: QR generation works.');
    process.exit(0);
});

client.on('ready', () => {
    console.log('✅ Client is ready!');
    process.exit(0);
});

client.on('auth_failure', msg => {
    console.error('❌ Auth failure:', msg);
    process.exit(1);
});

console.log('🚀 Initializing client...');
client.initialize().catch(err => {
    console.error('❌ Initialization error:', err);
    process.exit(1);
});
