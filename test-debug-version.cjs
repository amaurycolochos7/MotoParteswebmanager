// Test if WhatsApp Web's window.Debug.VERSION loads
const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium',
        timeout: 60000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
        ],
    });

    const page = (await browser.pages())[0];
    console.log('Navigating to WhatsApp Web...');

    await page.goto('https://web.whatsapp.com/', {
        waitUntil: 'load',
        timeout: 60000,
        referer: 'https://whatsapp.com/',
    });

    console.log('Page loaded. URL:', page.url());
    console.log('Title:', await page.title());

    // Check window.Debug.VERSION over time
    for (let i = 0; i < 60; i++) {
        const debugVersion = await page.evaluate('window.Debug?.VERSION');
        const hasStore = await page.evaluate('typeof window.Store');
        const hasRequire = await page.evaluate('typeof window.require');
        const docReady = await page.evaluate('document.readyState');
        const bodyLen = await page.evaluate('document.body?.innerHTML?.length || 0');
        console.log(`[${i * 2}s] Debug.VERSION=${debugVersion}, Store=${hasStore}, require=${hasRequire}, readyState=${docReady}, bodyLen=${bodyLen}`);

        if (debugVersion) {
            console.log('SUCCESS: Debug.VERSION =', debugVersion);
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    // Get page content for debugging
    const html = await page.content();
    console.log('Page HTML length:', html.length);
    console.log('Has canvas:', html.includes('canvas'));
    console.log('Has app wrapper:', html.includes('app-wrapper'));
    console.log('Has landing:', html.includes('landing'));

    // Check console errors
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });
    await new Promise(r => setTimeout(r, 2000));
    console.log('Console errors:', errors.length ? errors.join('\n') : 'none');

    await browser.close();
    console.log('Done');
}

test().catch(err => {
    console.error('Test failed:', err.message || String(err));
    process.exit(1);
});
