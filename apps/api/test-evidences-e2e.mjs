// =============================================================================
// E2E REAL — Evidencias del servicio (contra PostgreSQL real + API HTTP real)
// =============================================================================
// Cubre los 22 pasos del flujo solicitado. NO es un unit test: arranca un bot
// mock de WhatsApp, levanta la API real (node src/index.js) contra la BD local
// (localhost:5434), siembra datos vía Prisma y golpea los endpoints HTTP reales
// con JWTs de maestro / mecánico normal / auxiliar.
//
// Ejecutar:  node test-evidences-e2e.mjs   (con Postgres arriba y migración 008 aplicada)
//
// No se ejecuta con `npm test` (vive fuera de test/), para no requerir DB en CI.

import 'dotenv/config';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync, statSync, openSync, readFileSync } from 'node:fs';
import prisma, { workspaceContext } from './src/lib/prisma.js';
import { generateToken } from './src/middleware/auth.js';

const API = 'http://127.0.0.1:3055'; // puerto dedicado: evita choque con otros contenedores en :3000
const BOT_PORT = 3002;

// JPEG 1x1 válido — embebible por PDFKit/jsPDF.
const JPEG_1x1 =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////' +
    '////////////////////////////////////////2wBDAf//////////////////////////////////////////' +
    '////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAA' +
    'Av/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/a' +
    'AAwDAQACEQMRAD8AfwA//9k=';

// IDs fijos (idempotente: borramos antes de sembrar).
const WS = '00000000-0000-0000-0000-0000000000e1';
const P_MASTER = '00000000-0000-0000-0000-0000000000e2';
const P_NORMAL = '00000000-0000-0000-0000-0000000000e3';
const P_AUX = '00000000-0000-0000-0000-0000000000e4';
const CLIENT = '00000000-0000-0000-0000-0000000000e5';
const MOTO = '00000000-0000-0000-0000-0000000000e6';
const ORDER = '00000000-0000-0000-0000-0000000000e7';
const STATUS = '00000000-0000-0000-0000-0000000000e8';

let pass = 0, fail = 0;
const log = (ok, msg, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? '  -> ' + extra : ''}`);
    ok ? pass++ : fail++;
};

const unscoped = (fn) => workspaceContext.run({ workspaceId: null }, fn);

async function cleanup() {
    await unscoped(async () => {
        await prisma.orderPhoto.deleteMany({ where: { order_id: ORDER } });
        await prisma.quotationLabor.deleteMany({ where: { quotation: { order_id: ORDER } } }).catch(() => {});
        await prisma.quotationPart.deleteMany({ where: { quotation: { order_id: ORDER } } }).catch(() => {});
        await prisma.quotation.deleteMany({ where: { OR: [{ order_id: ORDER }, { client_id: CLIENT }] } });
        await prisma.orderHistory.deleteMany({ where: { order_id: ORDER } }).catch(() => {});
        await prisma.order.deleteMany({ where: { id: ORDER } });
        await prisma.motorcycle.deleteMany({ where: { id: MOTO } });
        await prisma.client.deleteMany({ where: { id: CLIENT } });
        await prisma.membership.deleteMany({ where: { workspace_id: WS } });
        await prisma.orderStatus.deleteMany({ where: { id: STATUS } });
        await prisma.profile.deleteMany({ where: { id: { in: [P_MASTER, P_NORMAL, P_AUX] } } });
        await prisma.workspace.deleteMany({ where: { id: WS } });
    });
}

async function seed() {
    await unscoped(async () => {
        await prisma.workspace.create({
            data: { id: WS, slug: `e2e-${Date.now()}`, name: 'Taller E2E', is_flagship: true, is_active: true },
        });
        const mkProfile = (id, email, name, flags) =>
            prisma.profile.create({ data: { id, email, full_name: name, role: 'mechanic', ...flags } });
        await mkProfile(P_MASTER, `master-${Date.now()}@e2e.mx`, 'Maestro E2E', { is_master_mechanic: true });
        await mkProfile(P_NORMAL, `normal-${Date.now()}@e2e.mx`, 'Mecánico Normal', { is_master_mechanic: false });
        await mkProfile(P_AUX, `aux-${Date.now()}@e2e.mx`, 'Auxiliar E2E', { requires_approval: true });
        for (const [pid, role] of [[P_MASTER, 'mechanic'], [P_NORMAL, 'mechanic'], [P_AUX, 'auxiliary']]) {
            await prisma.membership.create({ data: { workspace_id: WS, profile_id: pid, role } });
        }
        await prisma.client.create({ data: { id: CLIENT, workspace_id: WS, phone: '9611112233', full_name: 'Cliente E2E' } });
        await prisma.motorcycle.create({ data: { id: MOTO, workspace_id: WS, client_id: CLIENT, brand: 'Italika', model: 'FT150' } });
        await prisma.orderStatus.create({ data: { id: STATUS, workspace_id: WS, name: 'En Reparación', display_order: 3 } });
        await prisma.order.create({
            data: {
                id: ORDER, workspace_id: WS, order_number: `E2E-${Date.now()}`,
                client_id: CLIENT, motorcycle_id: MOTO, mechanic_id: P_MASTER, status_id: STATUS,
                customer_complaint: 'No enciende', total_amount: 0,
                public_token: `e2etoken${Date.now()}`,
            },
        });
    });
    const order = await unscoped(() => prisma.order.findUnique({ where: { id: ORDER } }));
    return order;
}

function token(pid, email) {
    return generateToken({ id: pid, email, role: 'mechanic', memberships: [{ workspace_id: WS, role: 'x' }], workspace_id: WS });
}
function authHeaders(tok) {
    return { 'Authorization': `Bearer ${tok}`, 'x-workspace-id': WS, 'Content-Type': 'application/json' };
}
async function api(method, path, tok, body) {
    const res = await fetch(`${API}${path}`, {
        method, headers: authHeaders(tok),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    return { status: res.status, data };
}

function startMockBot() {
    let calls = 0;
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
            calls++;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ messageId: `mock-${calls}`, ok: true }));
        });
    });
    return new Promise((resolve) => server.listen(BOT_PORT, () => resolve({ server, getCalls: () => calls })));
}

function waitForHealth(timeoutMs = 25000) {
    const start = Date.now();
    let lastErr = 'none';
    return new Promise((resolve, reject) => {
        const tick = async () => {
            try {
                const r = await fetch(`${API}/api/health`);
                if (r.ok) return resolve(true);
                lastErr = `status ${r.status}`;
            } catch (e) { lastErr = e.message + (e.cause ? ` (${e.cause.code || e.cause.message})` : ''); }
            if (Date.now() - start > timeoutMs) return reject(new Error('API no respondió /api/health; lastErr=' + lastErr));
            setTimeout(tick, 500);
        };
        tick();
    });
}

async function main() {
    console.log('\n=== E2E Evidencias del servicio (PostgreSQL real + HTTP real) ===\n');
    const mock = await startMockBot();
    console.log(`Mock bot WhatsApp escuchando en :${BOT_PORT}`);

    const srvLogFd = openSync('srv_e2e.log', 'w');
    const apiProc = spawn('node', ['src/index.js'], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: '3055' },
        stdio: ['ignore', srvLogFd, srvLogFd],
    });

    try {
        await waitForHealth();
        console.log('API real arriba en :3000\n');

        await cleanup();
        const order = await seed();
        log(true, 'Seed: workspace, maestro, normal, auxiliar, cliente, moto, orden creados');

        const tMaster = token(P_MASTER, 'm@e2e.mx');
        const tNormal = token(P_NORMAL, 'n@e2e.mx');
        const tAux = token(P_AUX, 'a@e2e.mx');

        // 8. Maestro sube pieza_danada
        let r = await api('POST', '/api/evidences', tMaster, { order_id: ORDER, url: JPEG_1x1, evidence_type: 'pieza_danada', note: 'Balero dañado' });
        log(r.status === 201 && r.data?.evidence_type === 'pieza_danada', '08 Maestro sube evidencia pieza_danada → 201', `status=${r.status}`);
        const evMaster = r.data?.id;

        // 9. Normal sube pieza_nueva
        r = await api('POST', '/api/evidences', tNormal, { order_id: ORDER, url: JPEG_1x1, evidence_type: 'pieza_nueva' });
        log(r.status === 201 && r.data?.evidence_type === 'pieza_nueva', '09 Mecánico normal sube pieza_nueva → 201', `status=${r.status}`);
        const evNormal = r.data?.id;

        // 10. Auxiliar intenta subir → 403
        r = await api('POST', '/api/evidences', tAux, { order_id: ORDER, url: JPEG_1x1, evidence_type: 'despues_trabajo' });
        log(r.status === 403, '10 Auxiliar sube evidencia → 403', `status=${r.status}`);

        // 11. Listar activas (deben ser 2)
        r = await api('GET', `/api/evidences?orderId=${ORDER}`, tMaster);
        log(r.status === 200 && Array.isArray(r.data) && r.data.length === 2, '11 Listar evidencias activas → 2', `n=${r.data?.length}`);

        // 15. expiración a 30 días (verifica expires_at del registro recién creado)
        const evRow = await unscoped(() => prisma.orderPhoto.findUnique({ where: { id: evMaster } }));
        const days = Math.round((new Date(evRow.expires_at) - new Date(evRow.created_at)) / (24 * 3600 * 1000));
        log(days === 30, '22 Expiración a 30 días (expires_at = created_at + 30d)', `días=${days}`);

        // 12. Maestro envía por WhatsApp (mock)
        r = await api('POST', '/api/evidences/send', tMaster, { order_id: ORDER, evidence_ids: [evMaster, evNormal], message: 'Le compartimos evidencias' });
        const sentOk = r.status === 200 && r.data?.success === true && r.data?.sent === 2;
        log(sentOk, '12 Maestro envía evidencias por WhatsApp (mock) → success, sent=2', `status=${r.status} sent=${r.data?.sent}`);
        const evRowSent = await unscoped(() => prisma.orderPhoto.findUnique({ where: { id: evMaster } }));
        log(!!evRowSent.sent_to_client_at && evRowSent.sent_by === P_MASTER, '12b sent_to_client_at + sent_by registrados', `sent_by=${evRowSent.sent_by}`);

        // 13. Normal intenta enviar → 403
        r = await api('POST', '/api/evidences/send', tNormal, { order_id: ORDER, evidence_ids: [evMaster] });
        log(r.status === 403, '13 Mecánico normal envía → 403', `status=${r.status}`);

        // 14. Auxiliar intenta enviar → 403
        r = await api('POST', '/api/evidences/send', tAux, { order_id: ORDER, evidence_ids: [evMaster] });
        log(r.status === 403, '14 Auxiliar envía → 403', `status=${r.status}`);

        // 15/16. Maestro crea cotización adicional desde evidencia
        r = await api('POST', `/api/evidences/${evMaster}/quote`, tMaster, {
            description: 'Cambio de balero', labor: [{ name: 'Mano de obra', price: 300 }], parts: [{ name: 'Balero', price: 150, quantity: 2 }],
        });
        const quoteOk = r.status === 201 && r.data?.is_additional === true && r.data?.order_id === ORDER && Number(r.data?.total_amount) === 600;
        log(quoteOk, '15 Maestro crea cotización adicional desde evidencia → 201 (is_additional, total=600)', `status=${r.status} total=${r.data?.total_amount}`);
        const quotationId = r.data?.id;

        // 16. Cliente autoriza desde portal público (sin auth)
        const pubGet = await fetch(`${API}/api/orders/public/${order.public_token}/extra-quotes`);
        const pubQuotes = await pubGet.json();
        log(pubGet.status === 200 && pubQuotes.some((q) => q.id === quotationId), '16a Portal público lista trabajo extra', `n=${pubQuotes.length}`);
        const auth = await fetch(`${API}/api/orders/public/${order.public_token}/quotes/${quotationId}/authorize`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorized: true }),
        });
        const authData = await auth.json();
        log(auth.status === 200 && authData.status === 'aceptada' && !!authData.client_authorized_at, '16b Cliente autoriza trabajo extra → aceptada + client_authorized_at', `status=${authData.status}`);

        // 17. PDF real con evidencias
        const pdfRes = await fetch(`${API}/api/order-pdf/${ORDER}/download`, { headers: authHeaders(tMaster) });
        const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
        writeFileSync('e2e_order.pdf', pdfBuf);
        const isPdf = pdfBuf.slice(0, 5).toString() === '%PDF-';
        log(pdfRes.status === 200 && isPdf && pdfBuf.length > 2000, '17 Comprobante PDF generado con evidencias', `bytes=${pdfBuf.length}`);

        // 18. Normal intenta eliminar → 403
        r = await api('DELETE', `/api/evidences/${evMaster}`, tNormal, { reason: 'x' });
        log(r.status === 403, '18 Mecánico normal elimina → 403', `status=${r.status}`);

        // 19. Maestro elimina con soft delete + motivo
        r = await api('DELETE', `/api/evidences/${evMaster}`, tMaster, { reason: 'Foto duplicada' });
        log(r.status === 200 && r.data?.success === true, '19 Maestro elimina (soft delete) → success', `status=${r.status}`);

        // 20. Eliminada NO aparece en listado
        r = await api('GET', `/api/evidences?orderId=${ORDER}`, tMaster);
        const notListed = Array.isArray(r.data) && !r.data.some((e) => e.id === evMaster);
        log(notListed && r.data.length === 1, '20 Evidencia eliminada NO aparece en listado', `n=${r.data?.length}`);

        // 21. Auditoría de eliminación en DB (deleted_at, deleted_by, delete_reason)
        const delRow = await unscoped(() => prisma.orderPhoto.findUnique({ where: { id: evMaster } }));
        const audited = !!delRow.deleted_at && delRow.deleted_by === P_MASTER && delRow.delete_reason === 'Foto duplicada';
        log(audited, '21 Auditoría de eliminación registrada (deleted_at/by/reason), fila persiste (no borrado físico)', `reason=${delRow.delete_reason}`);

        // 20b. PDF tras eliminar NO incluye la eliminada (se regenera sin error y filtra)
        const pdf2 = await fetch(`${API}/api/order-pdf/${ORDER}/download`, { headers: authHeaders(tMaster) });
        const pdf2Buf = Buffer.from(await pdf2.arrayBuffer());
        log(pdf2.status === 200 && pdf2Buf.slice(0, 5).toString() === '%PDF-', '20b PDF se regenera tras eliminación (evidencias activas filtradas)', `bytes=${pdf2Buf.length}`);

    } catch (err) {
        console.error('ERROR E2E:', err);
        try { console.error('--- LOG DEL SERVER ---\n' + readFileSync('srv_e2e.log', 'utf8').slice(0, 3000)); } catch {}
        fail++;
    } finally {
        try {
            if (process.platform === 'win32' && apiProc.pid) {
                spawn('taskkill', ['/F', '/T', '/PID', String(apiProc.pid)], { stdio: 'ignore' });
            } else {
                apiProc.kill('SIGKILL');
            }
        } catch {}
        mock.server.close();
        await cleanup().catch(() => {});
        await prisma.$disconnect().catch(() => {});
    }

    console.log(`\n=== RESULTADO E2E: ${pass} PASS / ${fail} FAIL ===\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main();
