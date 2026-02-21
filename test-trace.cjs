// Monkey-patch whatsapp-web.js Client to trace where initialize() hangs
const { Client, LocalAuth } = require('whatsapp-web.js');

// Save original initialize
const origInit = Client.prototype.initialize;

// Override with instrumented version
Client.prototype.initialize = async function () {
    console.log('[TRACE] ===== Starting monkey-patched initialize =====');

    const puppeteer = require('puppeteer');
    const { WhatsWebURL, DefaultOptions } = require('whatsapp-web.js/src/util/Constants');

    let browser, page;

    try {
        console.log('[TRACE] Step A: beforeBrowserInitialized...');
        await this.authStrategy.beforeBrowserInitialized();
        console.log('[TRACE] Step A done');

        const puppeteerOpts = this.options.puppeteer;
        const browserArgs = [...(puppeteerOpts.args || [])];
        if (this.options.userAgent !== false && !browserArgs.find(arg => arg.includes('--user-agent'))) {
            browserArgs.push(`--user-agent=${this.options.userAgent}`);
        }
        browserArgs.push('--disable-blink-features=AutomationControlled');

        console.log('[TRACE] Step B: puppeteer.launch... headless =', puppeteerOpts.headless);
        console.log('[TRACE] userAgent =', this.options.userAgent?.substring(0, 80));
        console.log('[TRACE] args =', browserArgs.join(' '));

        browser = await puppeteer.launch({ ...puppeteerOpts, args: browserArgs });
        page = (await browser.pages())[0];
        console.log('[TRACE] Step B done: browser launched');

        if (this.options.userAgent !== false) {
            console.log('[TRACE] Step C: setUserAgent...');
            await page.setUserAgent(this.options.userAgent);
            console.log('[TRACE] Step C done');
        }

        if (this.options.bypassCSP) {
            console.log('[TRACE] Step D: setBypassCSP...');
            await page.setBypassCSP(true);
            console.log('[TRACE] Step D done');
        }

        this.pupBrowser = browser;
        this.pupPage = page;

        console.log('[TRACE] Step E: afterBrowserInitialized...');
        await this.authStrategy.afterBrowserInitialized();
        console.log('[TRACE] Step E done');

        console.log('[TRACE] Step F: initWebVersionCache...');
        await this.initWebVersionCache();
        console.log('[TRACE] Step F done');

        console.log('[TRACE] Step G: evaluateOnNewDocument (Error patch)...');
        await page.evaluateOnNewDocument(() => {
            window.originalError = Error;
            Error = ((message) => {
                const error = new window.originalError(message);
                error.stack = error.stack + '\n    at https://web.whatsapp.com/vendors~lazy_loaded_low_priority_components.05e98054dbd60f980427.js:2:44';
                return error;
            }).bind(Error);
        });
        console.log('[TRACE] Step G done');

        console.log('[TRACE] Step H: page.goto WhatsApp Web...');
        const startNav = Date.now();
        await page.goto(WhatsWebURL, {
            waitUntil: 'load',
            timeout: 60000, // 60s instead of 0 (infinite)
            referer: 'https://whatsapp.com/'
        });
        console.log(`[TRACE] Step H done: page loaded in ${Date.now() - startNav}ms`);
        console.log('[TRACE] URL:', page.url());
        console.log('[TRACE] Title:', await page.title());

        // Check Debug.VERSION
        const debugVer = await page.evaluate('window.Debug?.VERSION');
        const bodyLen = await page.evaluate('document.body?.innerHTML?.length || 0');
        console.log(`[TRACE] Debug.VERSION=${debugVer}, bodyLen=${bodyLen}`);

        console.log('[TRACE] Step I: inject()...');
        await this.inject();
        console.log('[TRACE] Step I done: inject completed');

    } catch (err) {
        console.error('[TRACE] ERROR:', err?.message || String(err));
        console.error('[TRACE] Stack:', err?.stack || 'no stack');

        // Try to get page info
        if (page) {
            try {
                console.log('[TRACE] Current URL:', page.url());
                const bodyLen = await page.evaluate('document.body?.innerHTML?.length || 0');
                console.log('[TRACE] bodyLen:', bodyLen);
            } catch (e) {
                console.log('[TRACE] Could not get page info:', e.message);
            }
        }
        throw err;
    }
};

// Now create a client and test
async function test() {
    console.log('Creating client...');
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'trace-test',
            dataPath: '/app/data/wwebjs_auth',
        }),
        webVersionCache: { type: 'none' },
        authTimeoutMs: 90000,
        bypassCSP: true,
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        puppeteer: {
            headless: 'new',
            executablePath: '/usr/bin/chromium',
            timeout: 120000,
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
        console.log('[EVENT] QR GENERATED! length:', qr.length);
    });
    client.on('ready', () => {
        console.log('[EVENT] READY');
    });
    client.on('auth_failure', (msg) => {
        console.log('[EVENT] AUTH FAILURE:', msg);
    });
    client.on('loading_screen', (pct) => {
        console.log('[EVENT] Loading:', pct + '%');
    });

    console.log('Calling initialize...');
    try {
        await Promise.race([
            client.initialize(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT 120s')), 120000))
        ]);
        console.log('Initialize completed!');
    } catch (err) {
        console.error('Initialize failed:', err.message || String(err));
    }

    process.exit(0);
}

test();
