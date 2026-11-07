#!/usr/bin/env node
// Asistente de instalación: 3 pasos cortos (clave → impresora → prueba) y guarda config.json.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { CONFIG_FILE, DEFAULTS, loadConfig, resolveConfig, saveConfig, validateConfig, normalizeApiUrl } from './src/config.js';
import { createApiClient } from './src/api.js';
import { createPrinter, friendlyPrintError, listWindowsPrinters } from './src/printers.js';
import { buildTestPage } from './src/testpage.js';

const RECOMMENDED = /pos|thermal|termic|receipt|ticket|hostech|xprinter|epson tm|star |rongta|bixolon|80|generic \/ text/i;

// Se crea al iniciar el asistente (no al importar el archivo: el .exe lo importa siempre).
let rl;
let TARGET_CONFIG = CONFIG_FILE;
const say = (s = '') => console.log(s);

async function ask(question, def = '') {
    const suffix = def ? ` [${def}]` : '';
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer || def;
}

async function yesNo(question, defYes = true) {
    const a = (await rl.question(`${question} (${defYes ? 'S/n' : 's/N'}): `)).trim().toLowerCase();
    if (!a) return defYes;
    return ['s', 'si', 'sí', 'y', 'yes'].includes(a);
}

function title(text) {
    say();
    say('='.repeat(60));
    say('  ' + text);
    say('='.repeat(60));
}

/** Limpia lo que llega al pegar: espacios, comillas y saltos de línea. */
export function cleanKey(raw) {
    return String(raw || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
}

/**
 * Paso 1: pide la clave y la comprueba con el servidor.
 * @returns {Promise<string|null>} la clave, o null si el usuario prefiere salir
 */
async function askKey(apiUrl, current) {
    say('Abre MotoPartes en el navegador:  menú "Impresión"  →  botón "Generar clave".');
    say('Copia la clave (empieza con mpp_) y PÉGALA AQUÍ:');
    say('  (clic derecho dentro de esta ventana = pegar; luego presiona Enter)');
    for (;;) {
        const key = cleanKey(await ask('Clave', current));
        if (/^https?:\/\//i.test(key)) {
            say('  ✗ Eso es una dirección de internet, no la clave. La clave empieza con mpp_');
            continue;
        }
        if (!/^mpp_\S{8,}$/.test(key)) {
            say('  ✗ Esa no parece la clave. Debe empezar con mpp_ y estar completa, sin espacios.');
            continue;
        }
        process.stdout.write('  Comprobando la clave con MotoPartes… ');
        try {
            await createApiClient({ apiUrl, key, timeoutMs: 15000 }).ping();
            say('✓ Clave correcta.');
            return key;
        } catch (e) {
            if (e.kind === 'auth') {
                say('✗');
                say('  MotoPartes no reconoce esa clave (puede estar incompleta, o ya generaste otra más nueva).');
                say('  Genera una clave nueva en el panel y pégala completa.');
                continue;
            }
            if (e.kind === 'http' && e.status === 404) {
                // Servidor sin el endpoint de comprobación (versión anterior): no es culpa de la clave ni de internet.
                say('(no se pudo comprobar, la guardo)');
                return key;
            }
            say('✗');
            say(`  No pude conectar con MotoPartes (${e.message}). Revisa que haya internet.`);
            if (await yesNo('  ¿Guardar esta clave de todos modos y seguir?', false)) return key;
        }
    }
}

/** Paso 2: devuelve { mode, printerName } o { mode:'network', host, port }, o null para salir. */
async function askPrinter(cfg) {
    say('Buscando las impresoras instaladas en esta computadora…');
    const printers = await listWindowsPrinters();
    say();
    if (printers.length === 0) {
        say('  No encontré impresoras instaladas. Instala la tuya en Windows (mira el LEEME, paso 2)');
        say('  y vuelve a abrir este programa.');
    } else {
        printers.forEach((p, i) => {
            const star = RECOMMENDED.test(`${p.name} ${p.driver}`) ? '   ← parece la de tickets' : '';
            say(`  ${i + 1}) ${p.name}${star}`);
        });
    }
    say('  R) Mi impresora está conectada por cable de red (tiene una dirección IP)');
    say('  S) Salir');
    say();
    for (;;) {
        const pick = (await ask('Escribe el número de tu impresora de tickets (o R o S)')).toLowerCase();
        if (pick === 's') return null;
        if (pick === 'r') {
            const host = await ask('Dirección IP de la impresora (sale en su hoja de prueba)', cfg.host);
            const port = Number(await ask('Puerto', String(cfg.port || 9100))) || 9100;
            return { mode: 'network', host, port };
        }
        const idx = Number(pick) - 1;
        if (Number.isInteger(idx) && printers[idx]) return { mode: 'usb', printerName: printers[idx].name };
        say('  Escribe solo el número que aparece en la lista (por ejemplo 1), o R, o S.');
    }
}

/**
 * Corre el asistente. Devuelve el código de salida (0 = listo, 1 = no se completó).
 * Opciones para pruebas:  --config RUTA   --url https://otro-servidor
 */
export async function runSetup(argv = process.argv.slice(2)) {
    const arg = (name) => {
        const i = argv.indexOf(name);
        return i > -1 && argv[i + 1] ? argv[i + 1] : '';
    };
    TARGET_CONFIG = arg('--config') ? path.resolve(arg('--config')) : CONFIG_FILE;
    rl = readline.createInterface({ input, output });
    try {
        return await wizard(arg('--url'));
    } catch (e) {
        console.error('\nError en el asistente:', e.message);
        return 1;
    } finally {
        rl.close();
    }
}

async function wizard(urlOverride) {
    title('MotoPartes · Instalación del agente de impresión');
    say('Son 3 pasos cortos: la CLAVE, tu IMPRESORA y una PRUEBA.');

    const prev = loadConfig(TARGET_CONFIG).config;
    const cfg = { ...DEFAULTS, ...prev };
    // La dirección de MotoPartes ya viene lista; solo cambia si se pide a propósito.
    cfg.apiUrl = normalizeApiUrl(urlOverride || prev.apiUrl || DEFAULTS.apiUrl);

    /* 1. Clave */
    title('Paso 1 de 3 · La clave');
    cfg.key = await askKey(cfg.apiUrl, prev.key || '');

    /* 2. Impresora */
    title('Paso 2 de 3 · Tu impresora');
    const choice = await askPrinter(cfg);
    if (!choice) {
        say('No se guardó nada. Cuando tengas la impresora lista, vuelve a abrir este programa.');
        return 1;
    }
    Object.assign(cfg, choice);

    const resolved = resolveConfig(cfg);
    const problems = validateConfig(resolved);
    if (problems.length > 0) {
        say();
        problems.forEach((p) => say('  ✗ ' + p));
        say('No se guardó nada. Vuelve a abrir el programa para intentarlo otra vez.');
        return 1;
    }

    /* 3. Prueba */
    title('Paso 3 de 3 · Página de prueba');
    const printer = createPrinter(resolved);
    let okTest = false;
    if (await yesNo(`Voy a imprimir una página de prueba en "${printer.label}". ¿La imprimo ahora?`, true)) {
        for (;;) {
            try {
                await printer.print(buildTestPage({ printer: printer.label }));
                okTest = await yesNo('¿Salió el ticket de prueba en la impresora?', true);
            } catch (e) {
                say('  ✗ ' + friendlyPrintError(e));
            }
            if (okTest) break;
            if (!(await yesNo('¿Quieres intentar otra vez?', true))) break;
        }
    }

    saveConfig(TARGET_CONFIG, resolved);
    say();
    say(okTest ? '✓ Todo listo: la impresora funciona.' : '! Guardé la configuración, pero la prueba no quedó confirmada.');
    say(`  Configuración guardada en ${path.basename(TARGET_CONFIG)}`);
    return 0;
}

// Ejecución directa:  node setup.js
const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) runSetup().then((code) => process.exit(code));
