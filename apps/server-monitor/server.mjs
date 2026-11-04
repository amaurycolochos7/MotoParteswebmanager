/**
 * server-monitor — panel de SOLO LECTURA con la salud del servidor.
 *
 * Sin dependencias. Lee /proc y /sys (dentro de un contenedor se ven los del host:
 * CPU, RAM, sensores de temperatura, batería) y statfs('/') (el overlay de Docker
 * reporta el disco real del host). Comprueba la salud de los demás servicios por la
 * red interna de compose. Guarda historial y récords en /data (volumen).
 *
 * Endpoints (solo GET):  /  ·  /api/snapshot  ·  /api/history?range=15m|1h|24h|7d  ·  /healthz
 */
import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8088);
const DATA_DIR = process.env.DATA_DIR || '/data';
const DEMO = process.env.MONITOR_DEMO === '1';
const SAMPLE_MS = 5000;
const SERVICES_MS = 15000;
const DISK_MS = 30000;
const LIVE_POINTS = 180; // 15 min a 5 s

// ───────────────────────── utilidades ─────────────────────────
const read = (p) => { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; } };
const num = (p) => { const v = read(p); if (v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const milli = (p) => { const n = num(p); return n === null ? null : n / 1000; };
const listDir = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 1) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);

// ───────────────────────── lectores del sistema ─────────────────────────
let prevCpu = null;
function readCpuTimes() {
  const txt = read('/proc/stat');
  if (!txt) return null;
  const out = {};
  for (const l of txt.split('\n')) {
    if (!/^cpu\d*\s/.test(l)) continue;
    const p = l.trim().split(/\s+/);
    const v = p.slice(1, 9).map(Number);
    out[p[0]] = { idle: v[3] + (v[4] || 0), total: v.reduce((a, b) => a + b, 0) };
  }
  return out;
}
function cpuUsage() {
  const cur = readCpuTimes();
  if (!cur) return null;
  let res = null;
  if (prevCpu) {
    const calc = (k) => {
      const a = prevCpu[k], b = cur[k];
      if (!a || !b) return null;
      const dt = b.total - a.total;
      return dt <= 0 ? 0 : clamp((1 - (b.idle - a.idle) / dt) * 100, 0, 100);
    };
    const cores = Object.keys(cur).filter((k) => k !== 'cpu').sort((x, y) => Number(x.slice(3)) - Number(y.slice(3)));
    res = { total: calc('cpu'), cores: cores.map(calc) };
  }
  prevCpu = cur;
  return res;
}

function memInfo() {
  const txt = read('/proc/meminfo');
  if (!txt) return null;
  const m = {};
  for (const l of txt.split('\n')) {
    const x = l.match(/^(\w+):\s+(\d+)/);
    if (x) m[x[1]] = Number(x[2]) * 1024;
  }
  const total = m.MemTotal || 0;
  const free = m.MemFree || 0;
  const avail = m.MemAvailable ?? free;
  const cache = (m.Buffers || 0) + (m.Cached || 0) + (m.SReclaimable || 0);
  const used = Math.max(0, total - avail); // lo que realmente retienen los programas
  return {
    total, used, avail, free, cache,
    apps: Math.max(0, total - free - cache),
    swapTotal: m.SwapTotal || 0,
    swapUsed: Math.max(0, (m.SwapTotal || 0) - (m.SwapFree || 0)),
  };
}

function diskInfo() {
  try {
    const s = fs.statfsSync('/');
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const used = (s.blocks - s.bfree) * s.bsize;
    return { total, used, free, pct: used + free > 0 ? (used / (used + free)) * 100 : 0 };
  } catch { return null; }
}

function physicalDisks() {
  return listDir('/sys/block')
    .filter((n) => !/^(loop|ram|dm-|sr|zram|nbd|md)/.test(n))
    .map((n) => {
      const sectors = num(`/sys/block/${n}/size`) || 0;
      if (!sectors) return null;
      const model = read(`/sys/block/${n}/device/model`);
      return { name: n, bytes: sectors * 512, model: model ? model.replace(/\s+/g, ' ') : null, kind: read(`/sys/block/${n}/queue/rotational`) === '1' ? 'HDD' : 'SSD' };
    })
    .filter(Boolean);
}

const CHIP_NAMES = { coretemp: 'Procesador', pch_wildcat_point: 'Chipset (PCH)', BAT0: 'Batería', x86_pkg_temp: 'Procesador', acpitz: 'Placa (ACPI)', nvme: 'SSD NVMe', k10temp: 'Procesador', applesmc: 'Apple SMC' };
function thermal() {
  const sensors = [];
  for (const h of listDir('/sys/class/hwmon')) {
    const base = `/sys/class/hwmon/${h}`;
    const chip = read(`${base}/name`) || h;
    for (const f of listDir(base)) {
      const m = f.match(/^temp(\d+)_input$/);
      if (!m) continue;
      const c = milli(`${base}/${f}`);
      if (c === null || c <= 0 || c > 150) continue;
      sensors.push({ chip, label: read(`${base}/temp${m[1]}_label`) || `temp${m[1]}`, c, max: milli(`${base}/temp${m[1]}_max`), crit: milli(`${base}/temp${m[1]}_crit`) });
    }
  }
  if (!sensors.length) {
    for (const z of listDir('/sys/class/thermal').filter((n) => n.startsWith('thermal_zone'))) {
      const c = milli(`/sys/class/thermal/${z}/temp`);
      if (c === null || c <= 0 || c > 150) continue;
      sensors.push({ chip: read(`/sys/class/thermal/${z}/type`) || z, label: 'zona', c, max: null, crit: null });
    }
  }
  if (!sensors.length) return null;

  const isPkg = (s) => /^Package/i.test(s.label) || /pkg_temp|k10temp/.test(s.chip);
  const pkg = sensors.find(isPkg) || sensors.filter((s) => s.chip !== 'BAT0').sort((a, b) => b.c - a.c)[0];
  const cores = sensors.filter((s) => /^Core/i.test(s.label)).map((s) => ({ label: s.label, c: round(s.c) }));
  const others = sensors
    .filter((s) => s !== pkg && !/^Core/i.test(s.label))
    .filter((s, i, arr) => arr.findIndex((x) => x.chip === s.chip && x.label === s.label) === i)
    .map((s) => ({ label: CHIP_NAMES[s.chip] || s.chip, c: round(s.c) }));

  const fans = [];
  for (const h of listDir('/sys/class/hwmon')) {
    const base = `/sys/class/hwmon/${h}`;
    for (const f of listDir(base)) {
      const m = f.match(/^fan(\d+)_input$/);
      if (!m) continue;
      const rpm = num(`${base}/${f}`);
      if (rpm === null) continue;
      fans.push({ label: read(`${base}/fan${m[1]}_label`) || `Ventilador ${m[1]}`, rpm, max: num(`${base}/fan${m[1]}_max`) });
    }
  }
  const limit = pkg.crit ?? pkg.max ?? 100;
  return { package: { c: round(pkg.c), label: CHIP_NAMES[pkg.chip] || pkg.chip, max: pkg.max, crit: pkg.crit, limit }, cores, others, fans };
}

function power() {
  let ac = null;
  let battery = null;
  for (const d of listDir('/sys/class/power_supply')) {
    const b = `/sys/class/power_supply/${d}`;
    const type = read(`${b}/type`);
    if (type === 'Mains' || type === 'USB') {
      const o = num(`${b}/online`);
      if (o !== null) ac = (ac || false) || o === 1;
    } else if (type === 'Battery') {
      const volt = num(`${b}/voltage_now`);
      const toWh = (charge) => (charge !== null && volt ? (charge * volt) / 1e6 : null); // µAh·µV → µWh
      const eNow = num(`${b}/energy_now`) ?? toWh(num(`${b}/charge_now`));
      const eFull = num(`${b}/energy_full`) ?? toWh(num(`${b}/charge_full`));
      const eDes = num(`${b}/energy_full_design`) ?? toWh(num(`${b}/charge_full_design`));
      const cur = num(`${b}/current_now`);
      const pNow = num(`${b}/power_now`) ?? (cur !== null && volt ? Math.abs(cur) * volt / 1e6 : null);
      const status = read(`${b}/status`);
      let hours = null;
      if (pNow && pNow > 0 && eNow !== null) {
        if (status === 'Discharging') hours = eNow / pNow;
        else if (status === 'Charging' && eFull !== null) hours = (eFull - eNow) / pNow;
      }
      battery = {
        capacity: num(`${b}/capacity`),
        status,
        health: eFull !== null && eDes ? round((eFull / eDes) * 100, 0) : null,
        cycles: num(`${b}/cycle_count`),
        watts: pNow !== null ? round(pNow / 1e6, 1) : null,
        wh: eNow !== null ? round(eNow / 1e6, 1) : null,
        whFull: eFull !== null ? round(eFull / 1e6, 1) : null,
        hours: hours !== null ? round(hours, 1) : null,
      };
    }
  }
  return { ac, battery };
}

function hostInfo() {
  const cpuinfo = read('/proc/cpuinfo') || '';
  const model = (cpuinfo.match(/model name\s*:\s*(.+)/) || [])[1];
  return {
    name: process.env.HOST_LABEL || os.hostname(),
    machine: read('/sys/devices/virtual/dmi/id/product_name'),
    os: process.env.HOST_OS || null,
    kernel: read('/proc/sys/kernel/osrelease'),
    cpu: model ? model.replace(/\((R|TM)\)/g, '').replace(/\s+/g, ' ').trim() : null,
    threads: os.cpus().length,
  };
}

// ───────────────────────── salud de servicios ─────────────────────────
const DEFAULT_SERVICES = [
  { id: 'web', name: 'Aplicación web', kind: 'http', url: 'http://frontend:3000/' },
  { id: 'api', name: 'API', kind: 'http', url: 'http://api:3000/api/health' },
  { id: 'bot', name: 'Bot de WhatsApp', kind: 'http', url: 'http://whatsapp-bot:3002/health' },
  { id: 'db', name: 'Base de datos', kind: 'tcp', host: 'postgres', port: 5432 },
  { id: 'landing', name: 'Landing VC', kind: 'http', url: 'http://landing-vc:80/' },
];
let SERVICES = DEFAULT_SERVICES;
try { if (process.env.MONITOR_SERVICES) SERVICES = JSON.parse(process.env.MONITOR_SERVICES); } catch { /* usar por defecto */ }

async function checkHttp(svc) {
  const t0 = performance.now();
  try {
    const r = await fetch(svc.url, { signal: AbortSignal.timeout(3000) });
    const text = await r.text();
    const ms = Math.round(performance.now() - t0);
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { ok: r.ok, ms, json };
  } catch (e) {
    return { ok: false, ms: null, error: e.name === 'TimeoutError' ? 'sin respuesta (3 s)' : 'inalcanzable' };
  }
}
function checkTcp(svc) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const s = net.connect({ host: svc.host, port: svc.port, timeout: 3000 });
    s.once('connect', () => { s.destroy(); resolve({ ok: true, ms: Math.round(performance.now() - t0) }); });
    s.once('timeout', () => { s.destroy(); resolve({ ok: false, ms: null, error: 'sin respuesta (3 s)' }); });
    s.once('error', () => resolve({ ok: false, ms: null, error: 'inalcanzable' }));
  });
}
let servicesState = [];
async function refreshServices() {
  if (DEMO) {
    servicesState = [
      { id: 'web', name: 'Aplicación web', ok: true, ms: 6, level: 'ok', detail: 'responde' },
      { id: 'api', name: 'API', ok: true, ms: 9, level: 'ok', detail: 'responde' },
      { id: 'bot', name: 'Bot de WhatsApp', ok: true, ms: 12, level: 'ok', detail: 'sesión conectada' },
      { id: 'db', name: 'Base de datos', ok: true, ms: 3, level: 'ok', detail: 'acepta conexiones' },
      { id: 'landing', name: 'Landing VC', ok: true, ms: 5, level: 'ok', detail: 'responde' },
    ];
    return;
  }
  servicesState = await Promise.all(SERVICES.map(async (svc) => {
    const r = svc.kind === 'tcp' ? await checkTcp(svc) : await checkHttp(svc);
    let level = r.ok ? 'ok' : 'crit';
    let detail = r.ok ? (svc.kind === 'tcp' ? 'acepta conexiones' : 'responde') : r.error;
    if (r.ok && svc.id === 'bot' && r.json && typeof r.json.activeSessions === 'number') {
      if (r.json.activeSessions > 0) detail = `${r.json.activeSessions} sesión de WhatsApp conectada`;
      else { level = 'warn'; detail = 'sin sesión de WhatsApp conectada'; }
    }
    return { id: svc.id, name: svc.name, ok: r.ok, ms: r.ms, level, detail };
  }));
}

// ───────────────────────── historial y récords ─────────────────────────
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const state = { since: Date.now(), records: { temp: null, cpu: null, mem: null, diskFree: null }, minutes: [], hours: [] };
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (saved && typeof saved === 'object') Object.assign(state, saved);
} catch { /* primer arranque */ }

function saveState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) { console.warn('[monitor] no se pudo guardar el estado:', e.message); }
}

const live = [];
let minAcc = null;
let hourAcc = null;
const newAcc = (key) => ({ key, n: 0, cpu: 0, cpuMax: 0, mem: 0, memMax: 0, temp: 0, tempN: 0, tempMax: null, load: 0 });
function addToAcc(a, s) {
  a.n++; a.cpu += s.cpu ?? 0; a.cpuMax = Math.max(a.cpuMax, s.cpu ?? 0);
  a.mem += s.mem ?? 0; a.memMax = Math.max(a.memMax, s.mem ?? 0); a.load += s.load ?? 0;
  if (s.temp !== null && s.temp !== undefined) { a.temp += s.temp; a.tempN++; a.tempMax = Math.max(a.tempMax ?? -Infinity, s.temp); }
}
const accToPoint = (a, t) => ({ t, cpu: round(a.cpu / a.n), cpuMax: round(a.cpuMax), mem: round(a.mem / a.n), memMax: round(a.memMax), temp: a.tempN ? round(a.temp / a.tempN) : null, tempMax: a.tempMax === null ? null : round(a.tempMax), load: round(a.load / a.n, 2) });

function recordSample(s) {
  live.push(s);
  if (live.length > LIVE_POINTS) live.shift();

  const minute = Math.floor(s.t / 60000);
  if (!minAcc || minAcc.key !== minute) {
    if (minAcc) {
      const p = accToPoint(minAcc, minAcc.key * 60000);
      state.minutes.push(p);
      if (state.minutes.length > 1440) state.minutes.shift();
      const hour = Math.floor(p.t / 3600000);
      if (!hourAcc || hourAcc.key !== hour) {
        if (hourAcc) { state.hours.push(accToPoint(hourAcc, hourAcc.key * 3600000)); if (state.hours.length > 168) state.hours.shift(); }
        hourAcc = newAcc(hour);
      }
      addToAcc(hourAcc, p);
    }
    minAcc = newAcc(minute);
  }
  addToAcc(minAcc, s);

  const r = state.records;
  if (s.temp !== null && s.temp !== undefined && (!r.temp || s.temp > r.temp.v)) r.temp = { v: round(s.temp), t: s.t };
  if (s.cpu !== null && s.cpu !== undefined && (!r.cpu || s.cpu > r.cpu.v)) r.cpu = { v: round(s.cpu), t: s.t };
  if (s.mem !== null && s.mem !== undefined && (!r.mem || s.mem > r.mem.v)) r.mem = { v: round(s.mem), t: s.t };
}

// ───────────────────────── muestreo ─────────────────────────
let latest = null;
let diskCache = null;
let diskAt = 0;
let physCache = [];
const staticHost = hostInfo();

function demoValues(t) {
  const h = t / 3600000;
  const wob = (p, a) => Math.sin(t / 1000 / p) * a;
  return {
    cpu: clamp(18 + wob(2400, 9) + wob(900, 4) + wob(23, 1.5) + 6 * Math.max(0, Math.sin(h * 1.3)), 2, 96),
    cores: [0, 1, 2, 3].map((i) => clamp(18 + wob(60 + i * 17, 10) + i * 2, 1, 99)),
    temp: 52 + wob(3100, 5) + wob(1100, 1.5) + wob(17, 0.4) + 8 * Math.max(0, Math.sin(h * 1.3)),
  };
}

async function sample() {
  const t = Date.now();
  const cpu = cpuUsage();
  const mem = memInfo();
  const loadavg = (read('/proc/loadavg') || '0 0 0').split(' ').slice(0, 3).map(Number);
  let therm = thermal();
  let pw = power();
  let cpuTotal = cpu ? cpu.total : null;
  let cores = cpu ? cpu.cores : [];

  if (DEMO) {
    const d = demoValues(t);
    cpuTotal = d.cpu; cores = d.cores;
    therm = {
      package: { c: round(d.temp), label: 'Procesador', max: 105, crit: 105, limit: 105 },
      cores: [{ label: 'Core 0', c: round(d.temp - 1.2) }, { label: 'Core 1', c: round(d.temp + 0.8) }],
      others: [{ label: 'Chipset (PCH)', c: round(d.temp - 2.5) }, { label: 'Batería', c: 34.4 }],
      fans: [{ label: 'Ventilador 1', rpm: 2150, max: 6200 }],
    };
    pw = { ac: true, battery: { capacity: 100, status: 'Full', health: 87, cycles: 412, watts: 0, wh: 59.2, whFull: 59.2, hours: null } };
  }

  if (t - diskAt > DISK_MS || !diskCache) {
    diskCache = DEMO ? { total: 57800000000, used: 21600000000, free: 33200000000, pct: 39.4 } : diskInfo();
    physCache = DEMO ? [{ name: 'sda', bytes: 121332826112, model: 'APPLE SSD SM0128G', kind: 'SSD' }] : physicalDisks();
    diskAt = t;
    if (diskCache && (!state.records.diskFree || diskCache.free < state.records.diskFree.v)) state.records.diskFree = { v: diskCache.free, t };
  }

  const memPct = mem && mem.total ? (mem.used / mem.total) * 100 : null;
  recordSample({ t, cpu: cpuTotal, mem: memPct, temp: therm ? therm.package.c : null, load: loadavg[0] });

  const uptime = parseFloat((read('/proc/uptime') || '0').split(' ')[0]);
  latest = {
    t,
    host: { ...staticHost, uptime: DEMO ? 3.2 * 86400 : uptime },
    cpu: { pct: round(cpuTotal), cores: cores.map((c) => round(c)), load: loadavg, threads: staticHost.threads },
    mem: mem ? { ...mem, pct: round(memPct) } : null,
    disk: diskCache,
    physical: physCache,
    thermal: therm,
    power: pw,
    services: servicesState,
    records: state.records,
    since: state.since,
  };
  latest.status = overallStatus(latest);
}

function overallStatus(s) {
  const reasons = [];
  let level = 'ok';
  const bump = (l, msg) => { reasons.push({ level: l, msg }); if (l === 'crit' || (l === 'warn' && level === 'ok')) level = l; };
  if (s.thermal) {
    const c = s.thermal.package.c; const lim = s.thermal.package.limit;
    if (c >= lim - 10) bump('crit', `Temperatura crítica: ${c} °C`);
    else if (c >= 85) bump('warn', `Temperatura alta: ${c} °C`);
  }
  if (s.disk) {
    if (s.disk.pct >= 90) bump('crit', `Disco casi lleno (${round(s.disk.pct, 0)} %)`);
    else if (s.disk.pct >= 80) bump('warn', `Disco al ${round(s.disk.pct, 0)} %`);
  }
  if (s.mem && s.mem.total) {
    const availPct = (s.mem.avail / s.mem.total) * 100;
    if (availPct < 8) bump('crit', 'Memoria RAM casi agotada');
    else if (availPct < 15) bump('warn', 'Poca memoria RAM disponible');
  }
  for (const sv of s.services || []) {
    if (sv.level === 'crit') bump('crit', `${sv.name}: ${sv.detail}`);
    else if (sv.level === 'warn') bump('warn', `${sv.name}: ${sv.detail}`);
  }
  if (s.power && s.power.ac === false) {
    const cap = s.power.battery ? s.power.battery.capacity : null;
    bump(cap !== null && cap < 20 ? 'crit' : 'warn', `Sin corriente: funcionando con batería${cap !== null ? ` (${cap} %)` : ''}`);
  }
  return { level, reasons };
}

// ───────────────────────── datos de demostración ─────────────────────────
if (DEMO && state.minutes.length === 0) {
  const now = Date.now();
  for (let i = 1440; i > 0; i--) {
    const t = Math.floor((now - i * 60000) / 60000) * 60000;
    const d = demoValues(t);
    state.minutes.push({ t, cpu: round(d.cpu), cpuMax: round(d.cpu + 8), mem: round(24 + Math.sin(t / 4e6) * 3), memMax: round(28), temp: round(d.temp), tempMax: round(d.temp + 4), load: 0.2 });
  }
  for (let i = 168; i > 0; i--) {
    const t = Math.floor((now - i * 3600000) / 3600000) * 3600000;
    const d = demoValues(t);
    state.hours.push({ t, cpu: round(d.cpu), cpuMax: round(d.cpu + 12), mem: round(25 + Math.sin(t / 3e7) * 3), memMax: round(31), temp: round(d.temp), tempMax: round(d.temp + 6), load: 0.3 });
  }
  state.records.temp = { v: 71.4, t: now - 2.4 * 3600000 };
  state.records.cpu = { v: 96.2, t: now - 5 * 3600000 };
  state.records.mem = { v: 41.8, t: now - 9 * 3600000 };
  state.since = now - 6 * 86400000;
}

// ───────────────────────── HTTP ─────────────────────────
const INDEX = fs.readFileSync(path.join(__dirname, 'index.html'));
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
};
const send = (res, code, body, type) => { res.writeHead(code, { ...SECURITY, 'Content-Type': type }); res.end(body); };
const json = (res, obj) => send(res, 200, JSON.stringify(obj), 'application/json; charset=utf-8');

function history(range) {
  switch (range) {
    case '15m': return { range, stepMs: SAMPLE_MS, points: live.map((p) => ({ t: p.t, cpu: round(p.cpu), mem: round(p.mem), temp: round(p.temp) })) };
    case '1h': return { range, stepMs: 60000, points: state.minutes.slice(-60) };
    case '7d': return { range, stepMs: 3600000, points: state.hours };
    default: return { range: '24h', stepMs: 60000, points: state.minutes.slice(-1440) };
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido', 'text/plain; charset=utf-8');
  const url = new URL(req.url, 'http://monitor');
  switch (url.pathname) {
    case '/':
    case '/index.html': return send(res, 200, INDEX, 'text/html; charset=utf-8');
    case '/healthz': return send(res, 200, 'ok', 'text/plain');
    case '/api/snapshot': return latest ? json(res, latest) : send(res, 503, '{"error":"iniciando"}', 'application/json');
    case '/api/history': return json(res, history(url.searchParams.get('range')));
    default: return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
  }
});

await refreshServices();
await sample();
setInterval(() => { sample().catch((e) => console.warn('[monitor] muestreo:', e.message)); }, SAMPLE_MS);
setInterval(() => { refreshServices().catch(() => {}); }, SERVICES_MS);
setInterval(saveState, 120000);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { saveState(); process.exit(0); });

server.listen(PORT, '0.0.0.0', () => console.log(`[monitor] panel de solo lectura en :${PORT}${DEMO ? ' (modo demostración)' : ''}`));
