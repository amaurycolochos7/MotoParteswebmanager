// Empaqueta el agente en UN solo .exe (Node "Single Executable Application") y arma el ZIP
// que se copia a la laptop del taller.
//
//   cd apps/print-agent/build
//   npm install            (solo la primera vez: esbuild + postject)
//   npm run build              (genera el ZIP)
//   npm run build -- --publish (además lo copia a la web para descargarlo desde el panel)
//
// Salida: build/dist/MotoPartes-Impresion/ (carpeta lista) y build/dist/MotoPartes-Impresion.zip
// El ZIP lleva SOLO el .exe y LEEME.txt (sin .bat/.vbs/.ps1, que los antivirus y el correo suelen bloquear).
// El .exe incluye el runtime de Node de ESTA computadora (v22+ requerido), así que en la laptop
// del taller no hay que instalar Node.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..'); // apps/print-agent
const DIST = path.join(HERE, 'dist');
const OUT = path.join(DIST, 'MotoPartes-Impresion');
const EXE = path.join(OUT, 'MotoPartes-Impresion.exe');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) throw new Error(`Se necesita Node 22 o más nuevo para generar el .exe (tienes ${process.versions.node}).`);

const esbuild = await import('esbuild');
const { inject } = await import('postject');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1) Un solo archivo JS (CommonJS) con todo el código del agente.
console.log('1/5 Empaquetando el código…');
const bundle = path.join(DIST, 'agent.cjs');
await esbuild.build({
    entryPoints: [path.join(ROOT, 'exe-entry.js')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: bundle,
    logLevel: 'warning',
    define: {
        'import.meta.url': '"file:///C:/__bundled__/agent.js"',
        __APP_VERSION__: JSON.stringify(version),
    },
});

// 2) Blob de la aplicación (código + scripts de PowerShell incrustados).
console.log('2/5 Preparando el blob SEA…');
const blob = path.join(DIST, 'sea-prep.blob');
const seaConfig = path.join(DIST, 'sea-config.json');
fs.writeFileSync(
    seaConfig,
    JSON.stringify({
        main: bundle,
        output: blob,
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
        assets: {
            'raw-print.ps1': path.join(ROOT, 'raw-print.ps1'),
        },
    })
);
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });

// 3) Copia de node.exe + blob inyectado = el .exe del agente.
console.log('3/5 Creando el .exe…');
fs.copyFileSync(process.execPath, EXE);
await inject(EXE, 'NODE_SEA_BLOB', fs.readFileSync(blob), {
    sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
});

// 4) Archivos de apoyo para la laptop.
console.log('4/5 Copiando la guía…');
for (const f of fs.readdirSync(path.join(HERE, 'exe-package'))) {
    fs.copyFileSync(path.join(HERE, 'exe-package', f), path.join(OUT, f));
}

// 5) ZIP.
console.log('5/5 Comprimiendo…');
const zip = path.join(DIST, 'MotoPartes-Impresion.zip');
execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zip}' -Force`],
    { stdio: 'inherit' }
);

// Con --publish también se copia a la web (apps/frontend/public/descargas) para que el panel
// lo ofrezca con un clic: después hay que hacer commit y push para desplegarlo.
if (process.argv.includes('--publish')) {
    const pub = path.resolve(ROOT, '..', 'frontend', 'public', 'descargas');
    fs.mkdirSync(pub, { recursive: true });
    fs.copyFileSync(zip, path.join(pub, 'MotoPartes-Impresion.zip'));
    console.log(`Publicado en ${pub}`);
}

const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1);
console.log(`\nListo (v${version}):\n  ${EXE}  (${mb(EXE)} MB)\n  ${zip}  (${mb(zip)} MB)`);
