// Pruebas de punta a punta: se ejecuta el agente y el asistente como procesos reales
// contra el servidor falso (sin impresoras reales ni producción).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { startFakeApi, job, tmpDir, filesIn, waitFor, KEY } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT = path.join(ROOT, 'agent.js');
const SETUP = path.join(ROOT, 'setup.js');

function writeConfig(dir, extra = {}) {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(
        file,
        JSON.stringify({ apiUrl: 'http://127.0.0.1:1', key: KEY, mode: 'file', outputDir: 'salida', pollMs: 50, ...extra })
    );
    return file;
}

function runAgent(args) {
    return spawnSync(process.execPath, [AGENT, ...args], { encoding: 'utf8', timeout: 20000 });
}

test('--version imprime la versión', () => {
    const r = runAgent(['--version']);
    assert.equal(r.status, 0);
    assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('--check: configuración correcta → 0; sin config o incompleta → 1 con mensaje claro', () => {
    const dir = tmpDir();
    const ok = runAgent(['--check', '--config', writeConfig(dir)]);
    assert.equal(ok.status, 0, ok.stderr + ok.stdout);

    const missing = runAgent(['--check', '--config', path.join(dir, 'no-existe.json')]);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /INSTALAR\.bat/);

    const bad = runAgent(['--check', '--config', writeConfig(dir, { key: '' })]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /clave/i);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('--test-print: guarda la página de prueba (modo file)', () => {
    const dir = tmpDir();
    const r = runAgent(['--test-print', '--config', writeConfig(dir)]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const files = filesIn(path.join(dir, 'salida'));
    assert.equal(files.length, 1);
    assert.ok(fs.readFileSync(path.join(dir, 'salida', files[0])).toString('latin1').includes('PAGINA DE PRUEBA'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('agente real: imprime un trabajo del servidor, reporta, y una 2ª instancia sale con código 3', async () => {
    const api = await startFakeApi();
    const dir = tmpDir();
    const cfg = writeConfig(dir, { apiUrl: api.url });
    const child = spawn(process.execPath, [AGENT, '--config', cfg], { stdio: 'ignore' });
    try {
        await waitFor(() => api.state.polls.length >= 1);
        api.state.queue.push(job({ id: 'e2e-1', copies: 2 }));
        await waitFor(() => api.state.results.length === 1, { timeout: 8000 });
        assert.deepEqual(api.state.results[0], { id: 'e2e-1', ok: true });
        assert.equal(filesIn(path.join(dir, 'salida')).length, 2);

        const second = runAgent(['--config', cfg]);
        assert.equal(second.status, 3, second.stderr + second.stdout);
        assert.match(second.stderr, /Ya hay un agente/);
    } finally {
        child.kill();
        await new Promise((r) => child.once('exit', r));
        await api.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('asistente (setup.js): guía por los pasos, imprime la prueba y guarda config.json', async () => {
    const api = await startFakeApi();
    const dir = tmpDir();
    const cfgPath = path.join(dir, 'config.json');

    // "Impresora" de red falsa que recibe la página de prueba.
    const received = [];
    const printer = net.createServer((s) => s.on('data', (d) => received.push(d)));
    await new Promise((r) => printer.listen(0, '127.0.0.1', r));
    const printerPort = printer.address().port;

    const child = spawn(process.execPath, [SETUP, '--config', cfgPath, '--url', api.url], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let consumed = 0;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const exited = new Promise((r) => child.once('exit', r));

    const answer = async (promptRe, text) => {
        await waitFor(() => promptRe.test(out.slice(consumed)), { timeout: 8000 });
        consumed = out.length;
        child.stdin.write(text + '\n');
    };

    try {
        await answer(/Clave: $/, api.url); // pegó una dirección en vez de la clave → lo explica y vuelve a preguntar
        await answer(/Clave: $/, 'mala'); // clave con formato incorrecto → vuelve a preguntar
        await answer(/Clave: $/, 'mpp_clave_equivocada_999'); // formato bueno pero el servidor no la reconoce
        await answer(/Clave: $/, KEY);
        await answer(/\(o R o S\): $/, 'r');
        await answer(/Dirección IP de la impresora.*: $/, '127.0.0.1');
        await answer(/Puerto.*: $/, String(printerPort));
        await answer(/¿La imprimo ahora\? \(S\/n\): $/, 's');
        await answer(/¿Salió el ticket de prueba en la impresora\? \(S\/n\): $/, 's');
        const code = await exited;
        assert.equal(code, 0, out);

        const saved = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        assert.equal(saved.key, KEY);
        assert.equal(saved.mode, 'network');
        assert.equal(saved.host, '127.0.0.1');
        assert.equal(saved.port, printerPort);
        assert.equal(saved.apiUrl, api.url);
        assert.match(out, /Todo listo/);
        assert.match(out, /no es la clave|dirección de internet/);
        assert.match(out, /no reconoce esa clave/);
        assert.match(out, /Clave correcta/);
        assert.ok(Buffer.concat(received).toString('latin1').includes('PAGINA DE PRUEBA'));
    } finally {
        child.kill();
        printer.close();
        await api.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
