// Test with anti-detection measures
const puppeteer = require('puppeteer');

async function test() {
    console.log('Launching browser with stealth settings...');
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: '/usr/bin/chromium',
        timeout: 60000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const page = (await browser.pages())[0];

    // Set a realistic user agent
    const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    await page.setUserAgent(userAgent);

    // Remove webdriver property
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Bypass CSP
    await page.setBypassCSP(true);

    console.log('Navigating to WhatsApp Web...');

    await page.goto('https://web.whatsapp.com/', {
        waitUntil: 'networkidle0',
        timeout: 60000,
        referer: 'https://whatsapp.com/',
    });

    console.log('Page loaded. URL:', page.url());
    console.log('Title:', await page.title());

    // Check window.Debug.VERSION over time
    for (let i = 0; i < 30; i++) {
        const debugVersion = await page.evaluate('window.Debug?.VERSION');
        const bodyLen = await page.evaluate('document.body?.innerHTML?.length || 0');
        console.log(`[${i * 2}s] Debug.VERSION=${debugVersion}, bodyLen=${bodyLen}`);

        if (debugVersion) {
            console.log('SUCCESS: Debug.VERSION =', debugVersion);
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    // Get a snippet of the page content
    const bodyText = await page.evaluate('document.body?.innerText?.substring(0, 500)');
    console.log('Body text:', bodyText);

    await browser.close();
    console.log('Done');
}

test().catch(err => {
    console.error('Test failed:', err.message || String(err));
    process.exit(1);
});
