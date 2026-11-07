// Utilidades de prueba: servidor HTTP falso que imita el contrato de la API de impresión.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveConfig } from '../src/config.js';
import { createApiClient } from '../src/api.js';
import { createPrinter } from '../src/printers.js';
import { Runner } from '../src/runner.js';

export const KEY = 'mpp_test_key_1234567890';

export function silentLog() {
    const lines = [];
    const push = (level) => (m) => lines.push(`[${level}] ${m}`);
    return { info: push('INFO'), warn: push('WARN'), error: push('ERROR'), lines };
}

export function job(overrides = {}) {
    return {
        id: 'job-1',
        kind: 'ticket',
        copies: 1,
        title: 'MP-26-099 · Juan Perez',
        attempts: 1,
        payload_b64: Buffer.from([0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a, 0x1d, 0x56, 0x00]).toString('base64'),
        ...overrides,
    };
}

/**
 * Servidor falso. Se controla con el objeto `state`:
 *   state.queue          trabajos por entregar (se entrega uno por poll)
 *   state.pollStatus     si es un número (ej. 401) responde eso en el poll
 *   state.dropPolls      cuántos polls cortar la conexión (simula caída de red)
 *   state.resultStatus   si es un número responde eso en /result
 *   state.polls/results  lo recibido
 */
export async function startFakeApi() {
    const state = {
        queue: [],
        pollStatus: null,
        dropPolls: 0,
        resultStatus: null,
        polls: [],
        results: [],
    };
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const send = (code, obj) => {
            res.writeHead(code, { 'content-type': 'application/json' });
            res.end(JSON.stringify(obj));
        };
        if (url.pathname === '/api/health') return send(200, { status: 'ok' });
        if (req.headers['x-print-key'] !== KEY) return send(401, { error: 'Clave inválida' });

        if (req.method === 'GET' && url.pathname === '/api/print-agent/poll') {
            state.polls.push({
                version: url.searchParams.get('version'),
                printer: url.searchParams.get('printer'),
                key: req.headers['x-print-key'],
            });
            if (state.dropPolls > 0) {
                state.dropPolls--;
                return req.socket.destroy();
            }
            if (state.pollStatus) return send(state.pollStatus, { error: 'forzado' });
            return send(200, { job: state.queue.shift() || null });
        }

        const m = url.pathname.match(/^\/api\/print-agent\/jobs\/([^/]+)\/result$/);
        if (req.method === 'POST' && m) {
            let body = '';
            req.on('data', (d) => (body += d));
            req.on('end', () => {
                if (state.resultStatus) return send(state.resultStatus, { error: 'forzado' });
                state.results.push({ id: decodeURIComponent(m[1]), ...JSON.parse(body || '{}') });
                send(200, { ok: true });
            });
            return;
        }
        send(404, { error: 'no existe' });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    return {
        state,
        url,
        close: () =>
            new Promise((r) => {
                server.closeAllConnections?.();
                server.close(r);
            }),
    };
}

export function tmpDir(prefix = 'mp-agent-test-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function filesIn(dir) {
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.bin')).sort() : [];
}

/** Arma un Runner contra el servidor falso usando la impresora de archivo. */
export function makeRunner(api, { outDir, printer, config = {}, log = silentLog() } = {}) {
    const cfg = resolveConfig(
        {
            apiUrl: api.url,
            key: KEY,
            mode: 'file',
            outputDir: outDir,
            pollMs: 20,
            timeoutMs: 2000,
            copyDelayMs: 0,
            maxBackoffMs: 120,
            authRetryMs: 60,
            ...config,
        },
        outDir
    );
    const client = createApiClient({ apiUrl: cfg.apiUrl, key: cfg.key, version: '1.0.0-test', timeoutMs: cfg.timeoutMs });
    const runner = new Runner({ config: cfg, api: client, printer: printer || createPrinter(cfg), log });
    return { runner, cfg, log };
}

export async function waitFor(fn, { timeout = 4000, step = 15 } = {}) {
    const t0 = Date.now();
    for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() - t0 > timeout) throw new Error('waitFor: se agotó el tiempo');
        await new Promise((r) => setTimeout(r, step));
    }
}
