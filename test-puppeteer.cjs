// Quick test: can Puppeteer launch Chromium?
const puppeteer = require('puppeteer-core');

async function test() {
    console.log('puppeteer-core loaded OK');
    console.log('PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH);

    try {
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
            timeout: 30000,
        });
        console.log('Browser launched OK!');
        const version = await browser.version();
        console.log('Browser version:', version);

        const page = await browser.newPage();
        await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        console.log('WhatsApp page loaded, title:', await page.title());

        await browser.close();
        console.log('Test PASSED');
    } catch (err) {
        console.error('Test FAILED:', err.message);
        console.error('Stack:', err.stack);
    }
}

test();
