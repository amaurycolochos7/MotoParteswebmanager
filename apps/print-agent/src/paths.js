// Dónde viven los archivos del agente, tanto corriendo con Node ("node agent.js")
// como empaquetado en un solo .exe (Node SEA, ver build/build-exe.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

function loadSea() {
    try {
        const req = typeof require === 'function' ? require : createRequire(import.meta.url);
        return req('node:sea');
    } catch {
        return null; // Node < 20.12: no existe node:sea
    }
}

const sea = loadSea();

/** true cuando corre como MotoPartes-Impresion.exe */
export const IS_EXE = !!(sea && typeof sea.isSea === 'function' && sea.isSea());

/** Carpeta donde se guardan config.json, logs y el candado: junto al .exe o junto al código. */
export const APP_DIR = IS_EXE ? path.dirname(process.execPath) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Archivos incrustados en el .exe (scripts de PowerShell). En modo Node devuelve null. */
export function getAsset(name) {
    if (!IS_EXE) return null;
    try {
        return sea.getAsset(name, 'utf8');
    } catch {
        return null;
    }
}

/**
 * Devuelve la ruta real de un script de PowerShell. En modo .exe lo extrae a la carpeta
 * temporal (PowerShell necesita un archivo); en modo Node usa el que está en la carpeta.
 */
export function scriptPath(name) {
    if (!IS_EXE) return path.join(APP_DIR, name);
    const content = getAsset(name);
    if (content == null) throw new Error(`Falta el archivo incrustado ${name}`);
    const dir = path.join(os.tmpdir(), 'motopartes-impresion');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, name);
    // BOM para que PowerShell 5.1 lea bien los acentos.
    const data = '﻿' + content.replace(/^﻿/, '');
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== data) fs.writeFileSync(target, data, 'utf8');
    return target;
}
