#!/usr/bin/env node
// Asistente de instalación (se ejecuta desde INSTALAR.bat). Pregunta, prueba y guarda config.json.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { CONFIG_FILE, DEFAULTS, loadConfig, resolveConfig, saveConfig, validateConfig, normalizeApiUrl } from './src/config.js';
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

async function checkServer(apiUrl) {
    try {
        const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(10000) });
        return res.ok;
    } catch {
        return false;
    }
}

async function chooseUsbPrinter(current) {
    say('Buscando las impresoras instaladas en esta computadora…');
    const printers = await listWindowsPrinters();
    if (printers.length === 0) {
        say('No encontré impresoras. Primero instala la impresora en Windows (mira el README, paso 2).');
        return ask('Si sabes el nombre exacto, escríbelo aquí (o deja vacío para cancelar)', current);
    }
    say();
    printers.forEach((p, i) => {
        const star = RECOMMENDED.test(`${p.name} ${p.driver}`) ? '  ← parece la de tickets' : '';
        say(`  ${i + 1}) ${p.name}   (${p.port})${star}`);
    });
    say();
    for (;;) {
        const pick = await ask('Escribe el NÚMERO de tu impresora de tickets');
        const idx = Number(pick) - 1;
        if (Number.isInteger(idx) && printers[idx]) return printers[idx].name;
        say('  Escribe solo el número de la lista, por favor.');
    }
}

/**
 * Corre el asistente. Devuelve el código de salida (0 = listo, 1 = no se completó).
 * Permite probarlo sin tocar el config.json real:  node setup.js --config RUTA
 */
export async function runSetup(argv = process.argv.slice(2)) {
    const cfgArgIdx = argv.indexOf('--config');
    TARGET_CONFIG = cfgArgIdx > -1 && argv[cfgArgIdx + 1] ? path.resolve(argv[cfgArgIdx + 1]) : CONFIG_FILE;
    rl = readline.createInterface({ input, output });
    try {
        return await wizard();
    } catch (e) {
        console.error('\nError en el asistente:', e.message);
        return 1;
    } finally {
        rl.close();
    }
}

async function wizard() {
    title('MotoPartes · Instalación del agente de impresión');
    say('Te voy a hacer unas preguntas cortas. Casi todo ya viene listo:');
    say('solo necesitas la CLAVE del panel y elegir tu impresora.');

    const prev = loadConfig(TARGET_CONFIG).config;
    const cfg = { ...DEFAULTS, ...prev };

    /* 1. Servidor */
    title('Paso 1 de 4 · Servidor');
    cfg.apiUrl = normalizeApiUrl(await ask('Dirección de MotoPartes', cfg.apiUrl || DEFAULTS.apiUrl));
    process.stdout.write('Probando conexión… ');
    if (await checkServer(cfg.apiUrl)) say('¡Conectado!');
    else say('No pude conectar. Revisa que haya internet. (Puedes continuar y se reintenta solo.)');

    /* 2. Clave */
    title('Paso 2 de 4 · Clave del agente');
    say('En MotoPartes entra a  Impresión  y presiona  "Generar clave".');
    say('Copia la clave (empieza con mpp_) y pégala aquí.');
    for (;;) {
        const key = await ask('Clave', cfg.key);
        if (/^mpp_\S{8,}$/.test(key)) {
            cfg.key = key;
            break;
        }
        say('  Esa clave no parece correcta: debe empezar con mpp_ y no tener espacios.');
    }

    /* 3. Impresora */
    title('Paso 3 de 4 · Impresora');
    say('  1) Impresora conectada por USB (lo más común)');
    say('  2) Impresora conectada por cable de red (IP)');
    const modeAnswer = await ask('Elige 1 o 2', cfg.mode === 'network' ? '2' : '1');
    if (modeAnswer === '2') {
        cfg.mode = 'network';
        cfg.host = await ask('Dirección IP de la impresora (sale en su hoja de prueba)', cfg.host);
        cfg.port = Number(await ask('Puerto', String(cfg.port || 9100))) || 9100;
    } else {
        cfg.mode = 'usb';
        cfg.printerName = await chooseUsbPrinter(cfg.printerName);
    }

    const resolved = resolveConfig(cfg);
    const problems = validateConfig(resolved);
    if (problems.length > 0) {
        say();
        problems.forEach((p) => say('  ✗ ' + p));
        say('No se guardó nada. Vuelve a ejecutar INSTALAR.bat.');
        return 1;
    }

    /* 4. Prueba */
    title('Paso 4 de 4 · Prueba de impresión');
    const printer = createPrinter(resolved);
    let okTest = false;
    if (await yesNo('¿Imprimir una página de prueba ahora?', true)) {
        for (;;) {
            try {
                await printer.print(buildTestPage({ printer: printer.label }));
                okTest = await yesNo('¿Salió el ticket de prueba?', true);
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
