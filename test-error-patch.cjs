// Test: does the Error override from wweb.js kill Debug.VERSION?
const puppeteer = require('puppeteer');

async function test() {
    console.log('Test 1: WITH Error override (like wweb.js does)...');
    {
        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
        });
        const page = (await browser.pages())[0];
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        await page.setBypassCSP(true);

        // This is the exact code from wweb.js Client.js line 341-348
        await page.evaluateOnNewDocument(() => {
            window.originalError = Error;
            Error = ((message) => {
                const error = new window.originalError(message);
                error.stack = error.stack + '\n    at https://web.whatsapp.com/vendors~lazy_loaded_low_priority_components.05e98054dbd60f980427.js:2:44';
                return error;
            }).bind(Error);
        });

        await page.goto('https://web.whatsapp.com/', { waitUntil: 'load', timeout: 60000, referer: 'https://whatsapp.com/' });
        console.log('Page loaded. bodyLen:', await page.evaluate('document.body?.innerHTML?.length || 0'));

        for (let i = 0; i < 30; i++) {
            const v = await page.evaluate('window.Debug?.VERSION');
            if (v) { console.log(`WITH Error patch: Debug.VERSION=${v} after ${i * 2}s`); break; }
            if (i === 29) console.log('WITH Error patch: Debug.VERSION NEVER appeared (60s)');
            await new Promise(r => setTimeout(r, 2000));
        }
        await browser.close();
    }

    console.log('\nTest 2: WITHOUT Error override...');
    {
        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
        });
        const page = (await browser.pages())[0];
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        await page.setBypassCSP(true);
        // NO evaluateOnNewDocument

        await page.goto('https://web.whatsapp.com/', { waitUntil: 'load', timeout: 60000, referer: 'https://whatsapp.com/' });
        console.log('Page loaded. bodyLen:', await page.evaluate('document.body?.innerHTML?.length || 0'));

        for (let i = 0; i < 30; i++) {
            const v = await page.evaluate('window.Debug?.VERSION');
            if (v) { console.log(`WITHOUT Error patch: Debug.VERSION=${v} after ${i * 2}s`); break; }
            if (i === 29) console.log('WITHOUT Error patch: Debug.VERSION NEVER appeared (60s)');
            await new Promise(r => setTimeout(r, 2000));
        }
        await browser.close();
    }

    process.exit(0);
}

test().catch(err => { console.error('Failed:', err.message); process.exit(1); });
