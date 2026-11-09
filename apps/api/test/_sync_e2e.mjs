// POST /api/inbox/sync: con bot caído -> 409 claro; con bot disponible -> {started:true}; sin permiso -> 403.
//   cd apps/api && DATABASE_URL=... node test/_sync_e2e.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import jwt from 'jsonwebtoken';
import prisma from '../src/lib/prisma.js';

const API = 3161, BOT = 3169, SECRET = 'local-dev-only-change-me';
const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true, whatsapp_session_profile_id: true } });
const admin = await prisma.profile.findFirst({ where: { memberships: { some: { workspace_id: ws.id, role: { in: ['owner', 'admin'] } } } }, select: { id: true, email: true } });
const token = jwt.sign({ id: admin.id, email: admin.email, role: 'admin', workspace_id: ws.id }, SECRET, { expiresIn: '1h' });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ', m); } else { fail++; console.log('  FAIL ', m); } };

const api = spawn('node', ['src/index.js'], { env: { ...process.env, PORT: String(API), JWT_SECRET: SECRET, WHATSAPP_API_KEY: 'local-dev-bot-key', WHATSAPP_BOT_INTERNAL_URL: `http://localhost:${BOT}`, LOG_LEVEL: 'silent' }, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${API}/api/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
const call = (headers = {}) => fetch(`http://localhost:${API}/api/inbox/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...headers } });

console.log('== bot caído');
let r = await call(); let b = await r.json().catch(() => ({}));
ok(r.status === 409 && /conectado/i.test(b.error || ''), `409 con mensaje claro (${r.status}: ${b.error})`);

console.log('== bot disponible');
let hit = null;
const bot = http.createServer((req, res) => { hit = req.method + ' ' + req.url; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ started: true })); });
await new Promise(r => bot.listen(BOT, r));
r = await call(); b = await r.json().catch(() => ({}));
ok(r.status === 200 && b.started === true, 'responde { started: true }');
ok(hit === `POST /sessions/${ws.whatsapp_session_profile_id}/sync-history`, `llama al bot con la sesión del taller (${hit})`);

console.log('== sin sesión');
r = await fetch(`http://localhost:${API}/api/inbox/sync`, { method: 'POST' });
ok(r.status === 401, 'sin token -> 401');

bot.close(); api.kill(); await prisma.$disconnect();
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
