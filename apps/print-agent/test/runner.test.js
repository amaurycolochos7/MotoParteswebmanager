import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { startFakeApi, job, tmpDir, filesIn, makeRunner, waitFor, KEY } from './helpers.js';

async function withRunner(opts, body) {
    const api = await startFakeApi();
    const outDir = tmpDir();
    const ctx = makeRunner(api, { outDir, ...opts });
    const running = ctx.runner.start();
    try {
        await body({ api, outDir, ...ctx });
    } finally {
        await ctx.runner.stop();
        await running;
        await api.close();
        fs.rmSync(outDir, { recursive: true, force: true });
    }
}

test('sin trabajos: manda latido con clave, versión e impresora y no imprime nada', async () => {
    await withRunner({}, async ({ api, outDir }) => {
        await waitFor(() => api.state.polls.length >= 3);
        const p = api.state.polls[0];
        assert.equal(p.key, KEY);
        assert.equal(p.version, '1.0.0-test');
        assert.equal(p.printer, 'archivo');
        assert.deepEqual(filesIn(outDir), []);
        assert.equal(api.state.results.length, 0);
    });
});

test('con un trabajo: imprime los bytes exactos y reporta ok:true', async () => {
    await withRunner({}, async ({ api, outDir }) => {
        const j = job();
        api.state.queue.push(j);
        await waitFor(() => api.state.results.length === 1);
        assert.deepEqual(api.state.results[0], { id: 'job-1', ok: true });
        const files = filesIn(outDir);
        assert.equal(files.length, 1);
        assert.deepEqual(fs.readFileSync(path.join(outDir, files[0])), Buffer.from(j.payload_b64, 'base64'));
    });
});

test('respeta copies: imprime N veces y reporta una sola vez', async () => {
    await withRunner({}, async ({ api, outDir }) => {
        api.state.queue.push(job({ id: 'job-2', copies: 3 }));
        await waitFor(() => api.state.results.length === 1);
        assert.equal(filesIn(outDir).length, 3);
        assert.deepEqual(api.state.results, [{ id: 'job-2', ok: true }]);
    });
});

test('no reimprime un trabajo ya impreso aunque el servidor lo entregue otra vez', async () => {
    await withRunner({}, async ({ api, outDir }) => {
        api.state.queue.push(job({ id: 'dup' }));
        await waitFor(() => api.state.results.length === 1);
        api.state.queue.push(job({ id: 'dup' })); // el servidor lo reclamó de nuevo
        await waitFor(() => api.state.results.length === 2);
        assert.equal(filesIn(outDir).length, 1, 'solo una impresión');
        assert.deepEqual(api.state.results.map((r) => r.ok), [true, true]);
    });
});

test('si imprimir falla: reporta ok:false con mensaje claro y reintenta al reentregarse', async () => {
    let fail = true;
    const printed = [];
    const printer = {
        label: 'falsa',
        async print(buf) {
            if (fail) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
            printed.push(buf);
        },
    };
    await withRunner({ printer }, async ({ api }) => {
        api.state.queue.push(job({ id: 'f1' }));
        await waitFor(() => api.state.results.length === 1);
        assert.equal(api.state.results[0].ok, false);
        assert.match(api.state.results[0].error, /rechazó la conexión|encendida/i);

        fail = false;
        api.state.queue.push(job({ id: 'f1' })); // el servidor reintenta
        await waitFor(() => api.state.results.length === 2);
        assert.equal(api.state.results[1].ok, true);
        assert.equal(printed.length, 1);
    });
});

test('si falla a la mitad de varias copias, el reintento solo imprime las que faltan', async () => {
    let calls = 0;
    const printed = [];
    const printer = {
        label: 'falsa',
        async print(buf) {
            calls++;
            if (calls === 2) throw new Error('sin papel'); // la 2ª copia falla una vez
            printed.push(buf);
        },
    };
    await withRunner({ printer }, async ({ api }) => {
        api.state.queue.push(job({ id: 'c3', copies: 3 }));
        await waitFor(() => api.state.results.length === 1);
        assert.equal(api.state.results[0].ok, false);
        assert.equal(printed.length, 1);

        api.state.queue.push(job({ id: 'c3', copies: 3 })); // reintento del servidor
        await waitFor(() => api.state.results.length === 2);
        assert.equal(api.state.results[1].ok, true);
        assert.equal(printed.length, 3, 'en total 3 copias, ninguna repetida');
    });
});

test('trabajo sin datos: reporta ok:false sin intentar imprimir', async () => {
    await withRunner({}, async ({ api, outDir }) => {
        api.state.queue.push(job({ id: 'vacio', payload_b64: '' }));
        await waitFor(() => api.state.results.length === 1);
        assert.equal(api.state.results[0].ok, false);
        assert.match(api.state.results[0].error, /datos/i);
        assert.deepEqual(filesIn(outDir), []);
    });
});

test('401: registra "Clave inválida o revocada", sigue intentando y se recupera', async () => {
    await withRunner({}, async ({ api, outDir, log }) => {
        api.state.pollStatus = 401;
        await waitFor(() => log.lines.some((l) => /Clave inválida o revocada/.test(l)));
        const pollsAtError = api.state.polls.length;
        await waitFor(() => api.state.polls.length > pollsAtError, { timeout: 2000 }); // reintenta solo

        api.state.pollStatus = null;
        api.state.queue.push(job({ id: 'tras-401' }));
        await waitFor(() => api.state.results.length === 1);
        assert.equal(filesIn(outDir).length, 1);
        assert.ok(log.lines.some((l) => /restablecida/.test(l)));
    });
});

test('caída de red: reintenta con espera creciente y al volver imprime', async () => {
    await withRunner({}, async ({ api, outDir, log }) => {
        await waitFor(() => api.state.polls.length >= 1);
        api.state.dropPolls = 3;
        api.state.queue.push(job({ id: 'tras-caida' }));
        await waitFor(() => api.state.results.length === 1, { timeout: 6000 });
        assert.equal(filesIn(outDir).length, 1);
        assert.ok(log.lines.some((l) => /Sin conexión con MotoPartes/.test(l)));
        assert.ok(log.lines.some((l) => /restablecida/.test(l)));
    });
});

test('error 5xx del servidor se trata como caída (backoff) y no tumba el agente', async () => {
    await withRunner({}, async ({ api, outDir }) => {
        api.state.pollStatus = 502;
        await waitFor(() => api.state.polls.length >= 3);
        api.state.pollStatus = null;
        api.state.queue.push(job({ id: 'tras-502' }));
        await waitFor(() => api.state.results.length === 1);
        assert.equal(filesIn(outDir).length, 1);
    });
});

test('si falla el aviso de resultado, lo reintenta y NO reimprime', async () => {
    await withRunner({}, async ({ api, outDir }) => {
        api.state.resultStatus = 503; // /result no responde bien
        api.state.queue.push(job({ id: 'rep' }));
        await waitFor(() => filesIn(outDir).length === 1);
        await new Promise((r) => setTimeout(r, 150)); // varias vueltas con el reporte pendiente
        assert.equal(api.state.results.length, 0);
        assert.equal(filesIn(outDir).length, 1, 'no se reimprimió');

        api.state.resultStatus = null;
        await waitFor(() => api.state.results.length === 1);
        assert.deepEqual(api.state.results[0], { id: 'rep', ok: true });
        assert.equal(filesIn(outDir).length, 1);
    });
});

test('stop() cierra limpio y deja de consultar', async () => {
    const api = await startFakeApi();
    const outDir = tmpDir();
    const { runner } = makeRunner(api, { outDir });
    const running = runner.start();
    await waitFor(() => api.state.polls.length >= 2);
    await runner.stop();
    await running;
    const n = api.state.polls.length;
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(api.state.polls.length, n);
    await api.close();
    fs.rmSync(outDir, { recursive: true, force: true });
});
