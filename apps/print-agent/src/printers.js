// Salidas de impresión: usb (cola de Windows en modo RAW), network (TCP 9100) y file (pruebas).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { scriptPath } from './paths.js';

// Ruta de raw-print.ps1 (en el .exe se extrae del interior a la carpeta temporal).
export const RAW_PRINT_PS1 = scriptPath('raw-print.ps1');

/** Traduce cualquier error de impresión a un mensaje corto y claro para el panel. */
export function friendlyPrintError(err) {
    const msg = String(err?.userMessage || err?.message || err || '').trim();
    const code = err?.code;
    if (err?.userMessage) return msg.slice(0, 200);
    if (code === 'ECONNREFUSED') return 'La impresora rechazó la conexión (¿está encendida y con esa IP?)';
    if (code === 'ETIMEDOUT' || /timeout|timed out/i.test(msg)) return 'La impresora no respondió a tiempo (¿está encendida y conectada?)';
    if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'No se encuentra la impresora en la red';
    if (code === 'ENOTFOUND') return 'No se encontró la dirección de la impresora';
    if (code === 'ENOENT' && /powershell/i.test(msg)) return 'No se pudo usar PowerShell en esta computadora';
    if (code === 'ENOENT' || code === 'EACCES') return 'No se pudo guardar el ticket en la carpeta de salida';
    return msg ? `No se pudo imprimir: ${msg}`.slice(0, 200) : 'No se pudo imprimir (error desconocido)';
}

class PrintError extends Error {
    constructor(userMessage, extra = {}) {
        super(userMessage);
        this.userMessage = userMessage;
        Object.assign(this, extra);
    }
}

let seq = 0;
function stampForFile(d = new Date()) {
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return (
        `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
        `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`
    );
}

/* ---------------------------- modo "file" ---------------------------- */
function createFilePrinter(cfg) {
    const dir = cfg.outputDirAbs || path.resolve(cfg.outputDir || 'salida');
    return {
        mode: 'file',
        label: 'archivo',
        async print(buf) {
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `ticket-${stampForFile()}-${String(++seq).padStart(4, '0')}.bin`);
            fs.writeFileSync(file, buf);
            return { file };
        },
    };
}

/* --------------------------- modo "network" -------------------------- */
function createNetworkPrinter(cfg) {
    const host = cfg.host;
    const port = cfg.port || 9100;
    const timeoutMs = cfg.printTimeoutMs || 30000;
    return {
        mode: 'network',
        label: `${host}:${port}`,
        print(buf) {
            return new Promise((resolve, reject) => {
                let settled = false;
                const done = (err) => {
                    if (settled) return;
                    settled = true;
                    socket.destroy();
                    err ? reject(err) : resolve({});
                };
                const socket = net.createConnection({ host, port });
                socket.setTimeout(timeoutMs);
                socket.once('connect', () => {
                    socket.write(buf, (err) => {
                        if (err) return done(err);
                        socket.end();
                    });
                });
                socket.once('close', (hadError) => {
                    if (!hadError) done();
                });
                socket.once('timeout', () => done(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
                socket.once('error', (e) => done(e));
            });
        },
    };
}

/* ----------------------------- modo "usb" ---------------------------- */
function runPowerShell(args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', RAW_PRINT_PS1, ...args],
            { windowsHide: true }
        );
        let stderr = '';
        let stdout = '';
        let killed = false;
        const timer = setTimeout(() => {
            killed = true;
            child.kill();
        }, timeoutMs);
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        child.once('error', (e) => {
            clearTimeout(timer);
            reject(e);
        });
        child.once('close', (code) => {
            clearTimeout(timer);
            if (killed) {
                return reject(new PrintError('La impresora no respondió a tiempo (¿está encendida y conectada?)', { code: 'ETIMEDOUT' }));
            }
            if (code === 0) return resolve();
            const line = (stderr || stdout).split(/\r?\n/).map((s) => s.trim()).find(Boolean);
            reject(new PrintError(line || `No se pudo imprimir (código ${code})`, { exitCode: code }));
        });
    });
}

function createUsbPrinter(cfg) {
    const name = cfg.printerName;
    const timeoutMs = cfg.printTimeoutMs || 30000;
    return {
        mode: 'usb',
        label: name,
        async print(buf) {
            const tmp = path.join(os.tmpdir(), `mp-ticket-${process.pid}-${Date.now()}-${++seq}.bin`);
            fs.writeFileSync(tmp, buf);
            try {
                await runPowerShell(['-Printer', name, '-File', tmp], timeoutMs);
                return {};
            } finally {
                fs.rm(tmp, { force: true }, () => {});
            }
        },
    };
}

/** @param {object} cfg config ya resuelta (ver config.js) */
export function createPrinter(cfg) {
    switch (cfg.mode) {
        case 'usb':
            return createUsbPrinter(cfg);
        case 'network':
            return createNetworkPrinter(cfg);
        case 'file':
            return createFilePrinter(cfg);
        default:
            throw new Error(`Modo de impresión desconocido: ${cfg.mode}`);
    }
}

/** Lista las impresoras instaladas en Windows (para el asistente). */
export function listWindowsPrinters() {
    return new Promise((resolve) => {
        const cmd =
            'Get-Printer | Select-Object Name,DriverName,PortName | ConvertTo-Json -Compress';
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.once('error', () => resolve([]));
        child.once('close', () => resolve(parsePrinterList(out)));
    });
}

/** Acepta la salida de ConvertTo-Json (objeto suelto o arreglo) y devuelve un arreglo limpio. */
export function parsePrinterList(jsonText) {
    try {
        const data = JSON.parse(String(jsonText || '').trim() || '[]');
        const arr = Array.isArray(data) ? data : [data];
        return arr
            .filter((p) => p && p.Name)
            .map((p) => ({ name: String(p.Name), driver: String(p.DriverName || ''), port: String(p.PortName || '') }));
    } catch {
        return [];
    }
}
