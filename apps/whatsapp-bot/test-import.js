import pkg from 'whatsapp-web.js';
console.log('pkg:', pkg);
console.log('pkg.default:', pkg.default);
console.log('Client on pkg:', pkg.Client);
console.log('Client on pkg.default:', pkg.default?.Client);

import * as namespace from 'whatsapp-web.js';
console.log('namespace:', namespace);
