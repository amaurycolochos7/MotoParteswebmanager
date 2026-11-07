import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolveConfig, validateConfig, loadConfig, saveConfig, normalizeApiUrl } from '../src/config.js';
import { createPrinter, friendlyPrintError, parsePrinterList, RAW_PRINT_PS1 } from '../src/printers.js';
import { acquireLock, AlreadyRunningError } from '../src/lock.js';
import { createLogger } from '../src/log.js';
import { buildTestPage } from '../src/testpage.js';
import { createApiClient } from '../src/api.js';
import { tmpDir } from './helpers.js';

const isWin = process.platform === 'win32';

/* ------------------------------ config ------------------------------ */
test('config: normaliza la URL (barras y /api sobrantes)', () => {
    assert.equal(normalizeApiUrl('https://motopartes.cloud/'), 'https://motopartes.cloud');
    assert.equal(normalizeApiUrl('https://motopartes.cloud/api/'), 'https://motopartes.cloud');
});

test('config: valida modos y campos obligatorios en español', () => {
    const ok = resolveConfig({ key: 'mpp_abcdefgh', mode: 'usb', printerName: 'POS-80' });
    assert.deepEqual(validateConfig(ok), []);
    assert.match(validateConfig(resolveConfig({ mode: 'usb', printerName: 'X' })).join(' '), /clave/i);
    assert.match(validateConfig(resolveConfig({ key: 'mpp_x', mode: 'usb' })).join(' '), /nombre de la impresora/i);
    assert.match(validateConfig(resolveConfig({ key: 'mpp_x', mode: 'network' })).join(' '), /IP/);
    assert.match(validateConfig(resolveConfig({ key: 'mpp_x', mode: 'raro' })).join(' '), /modo/i);
    assert.deepEqual(validateConfig(resolveConfig({ key: 'mpp_x', mode: 'file' })), []);
});

test('config: guardar y cargar ida y vuelta; archivo dañado no revienta', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'config.json');
    assert.equal(loadConfig(file).exists, false);
    saveConfig(file, resolveConfig({ key: 'mpp_abcdefgh', mode: 'network', host: '192.168.1.50' }, dir));
    const back = loadConfig(file);
    assert.equal(back.config.host, '192.168.1.50');
    assert.equal(back.config.port, 9100);
    assert.deepEqual(back.problems, []);
    fs.writeFileSync(file, '{ esto no es json');
    assert.match(loadConfig(file).problems[0], /dañado/);
    fs.rmSync(dir, { recursive: true, force: true });
});

/* ------------------------------ errores ------------------------------ */
test('friendlyPrintError: mensajes cortos y en español', () => {
    assert.match(friendlyPrintError({ code: 'ECONNREFUSED', message: 'x' }), /rechazó/);
    assert.match(friendlyPrintError({ code: 'ETIMEDOUT', message: 'timeout' }), /no respondió/);
    assert.match(friendlyPrintError({ code: 'EHOSTUNREACH', message: 'x' }), /red/);
    assert.equal(friendlyPrintError({ userMessage: 'No existe una impresora llamada X' }), 'No existe una impresora llamada X');
    assert.ok(friendlyPrintError(new Error('boom')).length <= 200);
});

test('parsePrinterList: acepta objeto suelto, arreglo y basura', () => {
    assert.deepEqual(parsePrinterList('{"Name":"POS-80","DriverName":"Generic","PortName":"USB001"}'), [
        { name: 'POS-80', driver: 'Generic', port: 'USB001' },
    ]);
    assert.equal(parsePrinterList('[{"Name":"A"},{"Name":"B"}]').length, 2);
    assert.deepEqual(parsePrinterList(''), []);
    assert.deepEqual(parsePrinterList('no json'), []);
});

/* ----------------------------- impresoras ---------------------------- */
test('modo file: guarda un .bin por impresión con los bytes exactos', async () => {
    const dir = tmpDir();
    const p = createPrinter(resolveConfig({ mode: 'file', outputDir: dir }, dir));
    await p.print(Buffer.from('uno'));
    await p.print(Buffer.from('dos'));
    const files = fs.readdirSync(dir).sort();
    assert.equal(files.length, 2);
    assert.equal(fs.readFileSync(path.join(dir, files[0]), 'utf8'), 'uno');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('modo network: manda los bytes por TCP a host:puerto', async () => {
    const received = [];
    const server = net.createServer((s) => s.on('data', (d) => received.push(d)));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const p = createPrinter(resolveConfig({ mode: 'network', host: '127.0.0.1', port }));
    await p.print(Buffer.from([0x1b, 0x40, 0x41, 0x0a]));
    assert.deepEqual(Buffer.concat(received), Buffer.from([0x1b, 0x40, 0x41, 0x0a]));
    server.close();
});

test('modo network: impresora apagada → error claro', async () => {
    const server = net.createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    await new Promise((r) => server.close(r)); // puerto cerrado
    const p = createPrinter(resolveConfig({ mode: 'network', host: '127.0.0.1', port, printTimeoutMs: 2000 }));
    await assert.rejects(p.print(Buffer.from('x')), (e) => {
        assert.match(friendlyPrintError(e), /rechazó|no respondió/);
        return true;
    });
});

test('raw-print.ps1: el script PowerShell no tiene errores de sintaxis', { skip: !isWin }, () => {
    const cmd =
        `$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${RAW_PRINT_PS1}',[ref]$t,[ref]$e);` +
        `if($e.Count){$e|%{$_.Message};exit 1}else{exit 0}`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('los demás .ps1 tampoco tienen errores de sintaxis', { skip: !isWin }, () => {
    for (const f of ['install-autostart.ps1', 'uninstall-autostart.ps1']) {
        const file = path.resolve(path.dirname(RAW_PRINT_PS1), f);
        const cmd =
            `$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${file}',[ref]$t,[ref]$e);` +
            `if($e.Count){$e|%{$_.Message};exit 1}else{exit 0}`;
        const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
        assert.equal(r.status, 0, f + ': ' + r.stdout + r.stderr);
    }
});

test('raw-print.ps1: impresora inexistente → código 2 y mensaje claro (no imprime nada)', { skip: !isWin }, () => {
    const dir = tmpDir();
    const bin = path.join(dir, 't.bin');
    fs.writeFileSync(bin, Buffer.from([0x1b, 0x40]));
    const r = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', RAW_PRINT_PS1, '-Printer', 'Impresora-Que-No-Existe-XYZ', '-File', bin],
        { encoding: 'utf8' }
    );
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /No existe una impresora llamada/);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('modo usb: impresora inexistente → mensaje claro desde el agente', { skip: !isWin }, async () => {
    const p = createPrinter(resolveConfig({ mode: 'usb', printerName: 'Impresora-Que-No-Existe-XYZ' }));
    await assert.rejects(p.print(Buffer.from([0x1b, 0x40])), (e) => {
        assert.match(friendlyPrintError(e), /No existe una impresora llamada/);
        return true;
    });
});

/* -------------------------------- lock -------------------------------- */
test('lock: una segunda instancia es rechazada; un lock viejo se considera abandonado', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'agent.lock');
    const l1 = acquireLock(file);
    // Simula otro proceso vivo: el PID del proceso padre de este test existe.
    fs.writeFileSync(file, String(process.ppid));
    assert.throws(() => acquireLock(file), AlreadyRunningError);
    // Lock viejo (nadie lo actualiza) → se toma.
    const old = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(file, old, old);
    const l2 = acquireLock(file);
    l2.release();
    assert.equal(fs.existsSync(file), false);
    l1.release();
    fs.rmSync(dir, { recursive: true, force: true });
});

test('lock: pid muerto no bloquea', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'agent.lock');
    fs.writeFileSync(file, '99999999');
    const l = acquireLock(file);
    l.release();
    fs.rmSync(dir, { recursive: true, force: true });
});

/* -------------------------------- log --------------------------------- */
test('log: escribe archivo y rota al pasar el tamaño máximo', () => {
    const dir = tmpDir();
    const log = createLogger({ dir, maxBytes: 300, keep: 2, console: false });
    for (let i = 0; i < 30; i++) log.info('mensaje de prueba número ' + i);
    const files = fs.readdirSync(dir).sort();
    assert.ok(files.includes('agente.log') && files.includes('agente.log.1'), files.join(','));
    assert.ok(files.length <= 3);
    fs.rmSync(dir, { recursive: true, force: true });
});

/* ----------------------------- página de prueba ----------------------- */
test('página de prueba: empieza con ESC @ y termina con corte GS V 0', () => {
    const b = buildTestPage();
    assert.deepEqual([...b.subarray(0, 2)], [0x1b, 0x40]);
    assert.deepEqual([...b.subarray(-3)], [0x1d, 0x56, 0x00]);
    assert.ok(b.toString('latin1').includes('PAGINA DE PRUEBA'));
});

/* ------------------------------ api client ---------------------------- */
test('api: errores de red y 401 se clasifican bien', async () => {
    const down = createApiClient({ apiUrl: 'http://127.0.0.1:1', key: 'mpp_x', timeoutMs: 500 });
    await assert.rejects(down.poll('x'), (e) => e.kind === 'network');

    const fake401 = createApiClient({
        apiUrl: 'http://x',
        key: 'mpp_x',
        fetchImpl: async () => new Response('{"error":"Clave inválida"}', { status: 401 }),
    });
    await assert.rejects(fake401.poll('x'), (e) => e.kind === 'auth' && e.status === 401);

    const html502 = createApiClient({
        apiUrl: 'http://x',
        key: 'mpp_x',
        fetchImpl: async () => new Response('<html>Bad gateway</html>', { status: 502 }),
    });
    await assert.rejects(html502.poll('x'), (e) => e.kind === 'http' && e.status === 502);
});
