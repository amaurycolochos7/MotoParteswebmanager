// Check puppeteer versions
try {
    const pc = require('puppeteer-core/package.json');
    console.log('puppeteer-core:', pc.version);
} catch (e) {
    console.log('puppeteer-core: NOT FOUND');
}

try {
    const p = require('puppeteer/package.json');
    console.log('puppeteer:', p.version);
} catch (e) {
    console.log('puppeteer: NOT FOUND');
}

try {
    const w = require('whatsapp-web.js/package.json');
    console.log('whatsapp-web.js:', w.version);
    // Check dependencies
    console.log('wweb deps:', JSON.stringify(w.dependencies));
} catch (e) {
    console.log('whatsapp-web.js: NOT FOUND');
}
