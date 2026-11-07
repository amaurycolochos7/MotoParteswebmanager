// Lectura, validación y guardado de config.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_FILE = path.join(HOME_DIR, 'config.json');

export const DEFAULTS = Object.freeze({
    apiUrl: 'https://motopartes.cloud',
    key: '',
    mode: 'usb', // usb | network | file
    printerName: '',
    host: '',
    port: 9100,
    outputDir: 'salida',
    pollMs: 3000,
    timeoutMs: 15000, // tiempo máximo de cada llamada a la API
    printTimeoutMs: 30000, // tiempo máximo para mandar un ticket a la impresora
    copyDelayMs: 400, // pausa entre copias
    maxBackoffMs: 30000, // espera máxima cuando no hay internet
    authRetryMs: 30000, // espera cuando la clave no sirve
});

export const MODES = ['usb', 'network', 'file'];

/** Quita barras finales y un "/api" sobrante para que la URL base quede limpia. */
export function normalizeApiUrl(url) {
    let u = String(url || '').trim().replace(/\/+$/, '');
    if (/\/api$/i.test(u)) u = u.replace(/\/api$/i, '');
    return u;
}

/** Mezcla con los valores por defecto y normaliza tipos. */
export function resolveConfig(raw = {}, homeDir = HOME_DIR) {
    const cfg = { ...DEFAULTS, ...raw };
    cfg.apiUrl = normalizeApiUrl(cfg.apiUrl);
    cfg.key = String(cfg.key || '').trim();
    cfg.mode = String(cfg.mode || '').toLowerCase().trim();
    cfg.printerName = String(cfg.printerName || '').trim();
    cfg.host = String(cfg.host || '').trim();
    for (const k of [
        'port', 'pollMs', 'timeoutMs', 'printTimeoutMs', 'copyDelayMs', 'maxBackoffMs', 'authRetryMs',
    ]) {
        const n = Number(cfg[k]);
        cfg[k] = Number.isFinite(n) && n >= 0 ? n : DEFAULTS[k];
    }
    // pollMs = 0 convertiría el agente en un bucle sin pausa: usar el valor por defecto.
    if (cfg.pollMs === 0) cfg.pollMs = DEFAULTS.pollMs;
    cfg.homeDir = homeDir;
    cfg.outputDirAbs = path.isAbsolute(cfg.outputDir) ? cfg.outputDir : path.join(homeDir, cfg.outputDir);
    return cfg;
}

/** Devuelve una lista de problemas en español (vacía = todo bien). */
export function validateConfig(cfg) {
    const problems = [];
    if (!cfg.apiUrl || !/^https?:\/\//i.test(cfg.apiUrl)) {
        problems.push('La dirección del servidor (apiUrl) debe empezar con https://');
    }
    if (!cfg.key) {
        problems.push('Falta la clave del agente (key). Se genera en MotoPartes → Impresión.');
    }
    if (!MODES.includes(cfg.mode)) {
        problems.push(`El modo "${cfg.mode}" no es válido. Usa: ${MODES.join(', ')}.`);
    } else if (cfg.mode === 'usb' && !cfg.printerName) {
        problems.push('Falta el nombre de la impresora (printerName). Ejecuta INSTALAR.bat para elegirla.');
    } else if (cfg.mode === 'network') {
        if (!cfg.host) problems.push('Falta la dirección IP de la impresora (host).');
        if (!(cfg.port > 0 && cfg.port < 65536)) problems.push('El puerto de la impresora no es válido.');
    }
    return problems;
}

/** Carga config.json. Si no existe devuelve { exists:false }. */
export function loadConfig(file = CONFIG_FILE, homeDir = path.dirname(file)) {
    if (!fs.existsSync(file)) {
        return { exists: false, config: resolveConfig({}, homeDir), problems: ['No existe config.json. Ejecuta INSTALAR.bat.'] };
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
        return {
            exists: true,
            config: resolveConfig({}, homeDir),
            problems: [`config.json está dañado (${e.message}). Ejecuta INSTALAR.bat de nuevo.`],
        };
    }
    const config = resolveConfig(raw, homeDir);
    return { exists: true, config, problems: validateConfig(config) };
}

/** Guarda solo los campos "de usuario" (no los calculados). */
export function saveConfig(file, cfg) {
    const out = {
        apiUrl: cfg.apiUrl,
        key: cfg.key,
        mode: cfg.mode,
        printerName: cfg.printerName,
        host: cfg.host,
        port: cfg.port,
        outputDir: cfg.outputDir,
        pollMs: cfg.pollMs,
    };
    fs.writeFileSync(file, JSON.stringify(out, null, 4) + '\n', 'utf8');
}
