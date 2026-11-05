/**
 * server-monitor — panel de SOLO LECTURA con la salud del servidor (genérico).
 *
 * Sin dependencias. Lee /proc, /sys y statfs. Corre con pid:host y network:host
 * para ver procesos y red REALES del equipo, como usuario sin privilegios, con el
 * sistema de archivos de solo lectura y sin capacidades. No usa el socket de Docker,
 * no ejecuta comandos y NO muestra líneas de comando de los procesos (solo su nombre).
 *
 * Endpoints (solo GET):  /  ·  /api/snapshot  ·  /api/history?range=15m|1h|24h|7d  ·  /healthz
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8088);
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || '/data';
const DEMO = process.env.MONITOR_DEMO === '1';
const SAMPLE_MS = 5000;
const LIVE_POINTS = 180; // 15 min a 5 s
const CLK_TCK = 100;
const PAGE = 4096;

// ───────────────────────── utilidades ─────────────────────────
const read = (p) => { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; } };
const num = (p) => { const v = read(p); if (v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const milli = (p) => { const n = num(p); return n === null ? null : n / 1000; };
const listDir = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// ───────────────────────── lectores ─────────────────────────
function readStat() {
  const txt = read('/proc/stat');
  if (!txt) return null;
  const out = { cpu: {}, ctxt: 0, intr: 0, forks: 0, running: 0, blocked: 0 };
  for (const l of txt.split('\n')) {
    if (/^cpu\d*\s/.test(l)) { const p = l.trim().split(/\s+/); out.cpu[p[0]] = p.slice(1, 9).map(Number); }
    else if (l.startsWith('ctxt ')) out.ctxt = Number(l.split(' ')[1]);
    else if (l.startsWith('intr ')) out.intr = Number(l.split(' ')[1]);
    else if (l.startsWith('processes ')) out.forks = Number(l.split(' ')[1]);
    else if (l.startsWith('procs_running ')) out.running = Number(l.split(' ')[1]);
    else if (l.startsWith('procs_blocked ')) out.blocked = Number(l.split(' ')[1]);
  }
  return out;
}

function psi() {
  const out = {};
  for (const k of ['cpu', 'memory', 'io']) {
    const txt = read(`/proc/pressure/${k}`);
    if (!txt) continue;
    const some = (txt.match(/some avg10=([\d.]+) avg60=([\d.]+) avg300=([\d.]+)/) || []).slice(1).map(Number);
    if (some.length) out[k] = { avg10: some[0], avg60: some[1], avg300: some[2] };
  }
  return Object.keys(out).length ? out : null;
}

function memInfo() {
  const txt = read('/proc/meminfo');
  if (!txt) return null;
  const m = {};
  for (const l of txt.split('\n')) { const x = l.match(/^(\w+):\s+(\d+)/); if (x) m[x[1]] = Number(x[2]) * 1024; }
  const total = m.MemTotal || 0;
  const free = m.MemFree || 0;
  const avail = m.MemAvailable ?? free;
  const buffers = m.Buffers || 0;
  const cached = (m.Cached || 0) + (m.SReclaimable || 0);
  const used = Math.max(0, total - avail);
  return {
    total, used, avail, free, buffers, cache: cached,
    apps: Math.max(0, total - free - buffers - cached),
    shmem: m.Shmem || 0, slab: m.Slab || 0, dirty: m.Dirty || 0, writeback: m.Writeback || 0, mapped: m.Mapped || 0,
    swapTotal: m.SwapTotal || 0, swapUsed: Math.max(0, (m.SwapTotal || 0) - (m.SwapFree || 0)),
  };
}

function vmstat() {
  const txt = read('/proc/vmstat');
  if (!txt) return null;
  const o = {};
  for (const l of txt.split('\n')) {
    const [k, v] = l.split(' ');
    if (k === 'pswpin' || k === 'pswpout' || k === 'pgfault' || k === 'pgmajfault') o[k] = Number(v);
  }
  return o;
}

function diskInfo() {
  try {
    const s = fs.statfsSync('/');
    const total = s.blocks * s.bsize, free = s.bavail * s.bsize, used = (s.blocks - s.bfree) * s.bsize;
    return {
      total, used, free, pct: used + free > 0 ? (used / (used + free)) * 100 : 0,
      inodes: { total: s.files, used: s.files - s.ffree, pct: s.files ? ((s.files - s.ffree) / s.files) * 100 : 0 },
    };
  } catch { return null; }
}

function physicalDisks() {
  return listDir('/sys/block')
    .filter((n) => !/^(loop|ram|dm-|sr|zram|nbd|md)/.test(n))
    .map((n) => {
      const sectors = num(`/sys/block/${n}/size`) || 0;
      if (!sectors) return null;
      const model = read(`/sys/block/${n}/device/model`);
      return { name: n, bytes: sectors * 512, model: model ? model.replace(/\s+/g, ' ') : null, kind: n.startsWith('nvme') ? 'NVMe' : read(`/sys/block/${n}/queue/rotational`) === '1' ? 'HDD' : 'SSD' };
    })
    .filter(Boolean);
}

function readDiskStats(devs) {
  const txt = read('/proc/diskstats');
  if (!txt) return {};
  const want = new Set(devs);
  const out = {};
  for (const l of txt.split('\n')) {
    const p = l.trim().split(/\s+/);
    if (!want.has(p[2])) continue;
    out[p[2]] = { rdIos: +p[3], rdSec: +p[5], rdMs: +p[6], wrIos: +p[7], wrSec: +p[9], wrMs: +p[10], inflight: +p[11], ioMs: +p[12] };
  }
  return out;
}

const VIRTUAL_IF = /^(lo|veth|docker|br-|virbr|vmnet|tun|dummy)/;
function readNetDev() {
  const txt = read('/proc/net/dev');
  if (!txt) return {};
  const out = {};
  for (const l of txt.split('\n').slice(2)) {
    const i = l.indexOf(':');
    if (i < 0) continue;
    const name = l.slice(0, i).trim();
    const v = l.slice(i + 1).trim().split(/\s+/).map(Number);
    out[name] = { rx: v[0], rxPk: v[1], rxErr: v[2], rxDrop: v[3], tx: v[8], txPk: v[9], txErr: v[10], txDrop: v[11] };
  }
  return out;
}

function ifaceInfo(name) {
  const base = `/sys/class/net/${name}`;
  const speed = num(`${base}/speed`);
  const ips = (os.networkInterfaces()[name] || []).filter((a) => a.family === 'IPv4').map((a) => a.address);
  let kind = 'ethernet';
  if (fs.existsSync(`${base}/wireless`)) kind = 'wifi';
  else if (name === 'lo') kind = 'loopback';
  else if (/^tailscale|^wg|^tun/.test(name)) kind = 'vpn';
  else if (/^(docker|br-|veth|virbr)/.test(name)) kind = 'docker';
  return { state: read(`${base}/operstate`) || 'unknown', speed: speed && speed > 0 ? speed : null, ip: ips[0] || null, kind };
}

function tcpSockets() {
  const states = { ESTABLISHED: 0, LISTEN: 0, TIME_WAIT: 0, CLOSE_WAIT: 0, SYN_SENT: 0, OTHER: 0 };
  const map = { '01': 'ESTABLISHED', '0A': 'LISTEN', '06': 'TIME_WAIT', '08': 'CLOSE_WAIT', '02': 'SYN_SENT' };
  const listening = new Map();
  for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
    const txt = read(f);
    if (!txt) continue;
    for (const l of txt.split('\n').slice(1)) {
      const p = l.trim().split(/\s+/);
      if (p.length < 4) continue;
      const st = map[p[3]] || 'OTHER';
      states[st]++;
      if (p[3] === '0A') {
        const [addr, portHex] = p[1].split(':');
        const port = parseInt(portHex, 16);
        // /proc/net/tcp guarda la IP en little-endian: 127.x.x.x termina en 7F; ::1 es 0…01000000
        const local = (addr.length === 8 && addr.toUpperCase().endsWith('7F')) || addr === '00000000000000000000000001000000' || addr.toUpperCase().endsWith('0000FFFF0100007F');
        const prev = listening.get(port);
        if (!prev || (prev.local && !local)) listening.set(port, { port, local });
      }
    }
  }
  return { states, listening: [...listening.values()].sort((a, b) => a.port - b.port) };
}

const CHIP_NAMES = { coretemp: 'Procesador', pch_wildcat_point: 'Chipset', BAT0: 'Batería', x86_pkg_temp: 'Procesador', acpitz: 'Placa', nvme: 'SSD NVMe', k10temp: 'Procesador', applesmc: 'Apple SMC', iwlwifi_1: 'Wi-Fi', iwlwifi: 'Wi-Fi' };
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
    .filter((s, i, a) => a.findIndex((x) => x.chip === s.chip && x.label === s.label) === i)
    .map((s) => ({ label: CHIP_NAMES[s.chip] || s.chip, c: round(s.c) }));
  const fans = [];
  for (const h of listDir('/sys/class/hwmon')) {
    const base = `/sys/class/hwmon/${h}`;
    for (const f of listDir(base)) {
      const m = f.match(/^fan(\d+)_input$/);
      if (!m) continue;
      const rpm = num(`${base}/${f}`);
      if (rpm !== null) fans.push({ label: read(`${base}/fan${m[1]}_label`) || `Ventilador ${m[1]}`, rpm, max: num(`${base}/fan${m[1]}_max`) });
    }
  }
  let throttle = 0, hasThrottle = false;
  for (const d of listDir('/sys/devices/system/cpu').filter((n) => /^cpu\d+$/.test(n))) {
    const v = num(`/sys/devices/system/cpu/${d}/thermal_throttle/core_throttle_count`);
    if (v !== null) { throttle += v; hasThrottle = true; }
  }
  const limit = pkg.crit ?? pkg.max ?? 100;
  return { package: { c: round(pkg.c), label: CHIP_NAMES[pkg.chip] || pkg.chip, limit }, cores, others, fans, throttle: hasThrottle ? throttle : null };
}

function power() {
  let ac = null, battery = null;
  for (const d of listDir('/sys/class/power_supply')) {
    const b = `/sys/class/power_supply/${d}`;
    const type = read(`${b}/type`);
    if (type === 'Mains' || type === 'USB') { const o = num(`${b}/online`); if (o !== null) ac = (ac || false) || o === 1; }
    else if (type === 'Battery') {
      const volt = num(`${b}/voltage_now`);
      const toWh = (c) => (c !== null && volt ? (c * volt) / 1e6 : null);
      const eNow = num(`${b}/energy_now`) ?? toWh(num(`${b}/charge_now`));
      const eFull = num(`${b}/energy_full`) ?? toWh(num(`${b}/charge_full`));
      const eDes = num(`${b}/energy_full_design`) ?? toWh(num(`${b}/charge_full_design`));
      const cur = num(`${b}/current_now`);
      const pNow = num(`${b}/power_now`) ?? (cur !== null && volt ? (Math.abs(cur) * volt) / 1e6 : null);
      const status = read(`${b}/status`);
      let hours = null;
      if (pNow && pNow > 0 && eNow !== null) {
        if (status === 'Discharging') hours = eNow / pNow;
        else if (status === 'Charging' && eFull !== null) hours = (eFull - eNow) / pNow;
      }
      battery = {
        capacity: num(`${b}/capacity`), status,
        health: eFull !== null && eDes ? round((eFull / eDes) * 100, 0) : null,
        cycles: num(`${b}/cycle_count`), watts: pNow !== null ? round(pNow / 1e6, 1) : null,
        wh: eNow !== null ? round(eNow / 1e6, 1) : null, whFull: eFull !== null ? round(eFull / 1e6, 1) : null,
        hours: hours !== null ? round(hours, 1) : null,
      };
    }
  }
  return { ac, battery };
}

function cpuFreqs(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const b = `/sys/devices/system/cpu/cpu${i}/cpufreq`;
    const cur = num(`${b}/scaling_cur_freq`);
    out.push(cur === null ? null : { mhz: Math.round(cur / 1000), maxMhz: (num(`${b}/cpuinfo_max_freq`) || 0) / 1000, minMhz: (num(`${b}/cpuinfo_min_freq`) || 0) / 1000 });
  }
  return out;
}

function hostInfo() {
  const ci = read('/proc/cpuinfo') || '';
  const model = (ci.match(/model name\s*:\s*(.+)/) || [])[1];
  const phys = Number((ci.match(/cpu cores\s*:\s*(\d+)/) || [])[1]) || null;
  return {
    name: process.env.HOST_LABEL || os.hostname(),
    machine: read('/sys/devices/virtual/dmi/id/product_name'),
    os: process.env.HOST_OS || null,
    kernel: read('/proc/sys/kernel/osrelease'),
    arch: os.arch(),
    cpu: model ? model.replace(/\((R|TM)\)/g, '').replace(/\s+/g, ' ').trim() : null,
    threads: os.cpus().length,
    physicalCores: phys,
    governor: read('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor'),
  };
}

// ───────────────────────── procesos (agrupados por nombre) ─────────────────────────
let prevProcs = new Map();
function scanProcs(dt) {
  const cur = new Map();
  const agg = new Map();
  const c = { total: 0, threads: 0, running: 0, sleeping: 0, zombies: 0, stopped: 0 };
  for (const pid of listDir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    const txt = read(`/proc/${pid}/stat`);
    if (!txt) continue;
    const rp = txt.lastIndexOf(')');
    const comm = txt.slice(txt.indexOf('(') + 1, rp);
    const f = txt.slice(rp + 2).split(' ');
    const state = f[0];
    const ticks = Number(f[11]) + Number(f[12]);
    const thr = Number(f[17]) || 1;
    const rss = (Number(f[21]) || 0) * PAGE;
    c.total++; c.threads += thr;
    if (state === 'R') c.running++; else if (state === 'Z') c.zombies++; else if (state === 'T' || state === 't') c.stopped++; else c.sleeping++;
    const key = `${pid}:${f[19]}`;
    cur.set(key, ticks);
    const p = prevProcs.get(key);
    const cpu = p !== undefined && dt > 0 ? Math.max(0, ((ticks - p) / (dt * CLK_TCK)) * 100) : 0;
    const a = agg.get(comm) || { name: comm, count: 0, cpu: 0, rss: 0, threads: 0 };
    a.count++; a.cpu += cpu; a.rss += rss; a.threads += thr;
    agg.set(comm, a);
  }
  prevProcs = cur;
  const list = [...agg.values()];
  const top = (k, n) => list.filter((a) => a[k] > 0).sort((x, y) => y[k] - x[k]).slice(0, n).map((a) => ({ name: a.name, count: a.count, cpu: round(a.cpu), rss: a.rss }));
  return { counts: c, topCpu: top('cpu', 8), topMem: top('rss', 8) };
}

// ───────────────────────── historial y récords ─────────────────────────
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const state = { since: Date.now(), records: {}, minutes: [], hours: [] };
try { const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); if (s && typeof s === 'object') Object.assign(state, s); } catch { /* primer arranque */ }
function saveState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) { console.warn('[monitor] no se pudo guardar el estado:', e.message); }
}

const KEYS = ['cpu', 'usr', 'sys', 'iow', 'mem', 'swap', 'temp', 'load', 'rx', 'tx', 'rd', 'wr', 'util'];
const MAXED = new Set(['cpu', 'temp', 'rx', 'tx', 'rd', 'wr', 'util', 'mem']);
const live = [];
let minAcc = null, hourAcc = null;
const newAcc = (key) => ({ key, n: 0, k: Object.fromEntries(KEYS.map((x) => [x, { s: 0, n: 0, m: null }])) });
function addAcc(a, s) {
  a.n++;
  for (const k of KEYS) {
    const v = s[k];
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    const e = a.k[k]; e.s += v; e.n++; if (e.m === null || v > e.m) e.m = v;
  }
}
function accPoint(a, t) {
  const p = { t };
  for (const k of KEYS) {
    const e = a.k[k];
    p[k] = e.n ? round(e.s / e.n, k === 'load' ? 2 : 1) : null;
    if (MAXED.has(k)) p[`${k}Max`] = e.m === null ? null : round(e.m, 1);
  }
  return p;
}
// agrega un punto-minuto a un acumulador horario (promedio de promedios, maximo de maximos)
function addPointToHour(a, p) {
  a.n++;
  for (const k of KEYS) {
    const v = p[k];
    if (v === null || v === undefined) continue;
    const e = a.k[k]; e.s += v; e.n++;
    const mx = MAXED.has(k) ? p[`${k}Max`] ?? v : v;
    if (e.m === null || mx > e.m) e.m = mx;
  }
}
function recordSample(s) {
  live.push({ t: s.t, ...Object.fromEntries(KEYS.map((k) => [k, s[k] === undefined ? null : round(s[k], k === 'load' ? 2 : 1)])) });
  if (live.length > LIVE_POINTS) live.shift();
  const minute = Math.floor(s.t / 60000);
  if (!minAcc || minAcc.key !== minute) {
    if (minAcc) {
      const p = accPoint(minAcc, minAcc.key * 60000);
      state.minutes.push(p); if (state.minutes.length > 1440) state.minutes.shift();
      const hour = Math.floor(p.t / 3600000);
      if (!hourAcc || hourAcc.key !== hour) {
        if (hourAcc) { state.hours.push(accPoint(hourAcc, hourAcc.key * 3600000)); if (state.hours.length > 168) state.hours.shift(); }
        hourAcc = newAcc(hour);
      }
      addPointToHour(hourAcc, p);
    }
    minAcc = newAcc(minute);
  }
  addAcc(minAcc, s);
  const r = state.records;
  const rec = (name, v, extra) => { if (v === null || v === undefined || Number.isNaN(v)) return; if (!r[name] || v > r[name].v) r[name] = { v: round(v, 1), t: s.t, ...(extra || {}) }; };
  rec('temp', s.temp); rec('cpu', s.cpu); rec('mem', s.mem); rec('load', s.load, null);
  rec('net', (s.rx || 0) + (s.tx || 0));
}

// ───────────────────────── muestreo ─────────────────────────
let latest = null;
let prev = null;
let physCache = [], diskCache = null, diskAt = 0;
const staticHost = hostInfo();
const physDevs = () => physCache.map((d) => d.name);

async function sample() {
  const t = Date.now();
  if (DEMO) return demoSample(t);
  const stat = readStat();
  const mem = memInfo();
  const vm = vmstat();
  const netNow = readNetDev();
  if (t - diskAt > 30000 || !diskCache) { diskCache = diskInfo(); physCache = physicalDisks(); diskAt = t; if (diskCache && (!state.records.diskFree || diskCache.free < state.records.diskFree.v)) state.records.diskFree = { v: diskCache.free, t }; }
  const dsNow = readDiskStats(physDevs());
  const dt = prev ? (t - prev.t) / 1000 : 0;

  // CPU
  let cpu = { pct: null, usr: null, sys: null, iow: null, stl: null, cores: [] };
  if (prev && stat && prev.stat && dt > 0) {
    const pct = (a, b) => { const d = b.map((x, i) => x - a[i]); const tot = d.reduce((x, y) => x + y, 0); if (tot <= 0) return null; return { usr: ((d[0] + d[1]) / tot) * 100, sys: ((d[2] + d[5] + d[6]) / tot) * 100, iow: (d[4] / tot) * 100, stl: (d[7] / tot) * 100, idle: (d[3] / tot) * 100 }; };
    const all = pct(prev.stat.cpu.cpu, stat.cpu.cpu);
    if (all) cpu = { pct: clamp(100 - all.idle, 0, 100), usr: all.usr, sys: all.sys, iow: all.iow, stl: all.stl, cores: [] };
    const names = Object.keys(stat.cpu).filter((k) => k !== 'cpu').sort((x, y) => Number(x.slice(3)) - Number(y.slice(3)));
    cpu.cores = names.map((n) => { const r = prev.stat.cpu[n] && pct(prev.stat.cpu[n], stat.cpu[n]); return r ? clamp(100 - r.idle, 0, 100) : null; });
  }
  const freqs = cpuFreqs(staticHost.threads);
  cpu.cores = cpu.cores.map((u, i) => ({ pct: round(u), mhz: freqs[i] ? freqs[i].mhz : null, maxMhz: freqs[i] ? freqs[i].maxMhz : null }));
  const rate = (a, b) => (prev && dt > 0 && a !== undefined && b !== undefined ? Math.max(0, (b - a) / dt) : null);
  const sys = {
    ctxt: stat && prev && prev.stat ? rate(prev.stat.ctxt, stat.ctxt) : null,
    intr: stat && prev && prev.stat ? rate(prev.stat.intr, stat.intr) : null,
    forks: stat && prev && prev.stat ? rate(prev.stat.forks, stat.forks) : null,
    running: stat ? stat.running : null, blocked: stat ? stat.blocked : null,
  };
  const loadavg = (read('/proc/loadavg') || '0 0 0').split(' ').slice(0, 3).map(Number);

  // memoria
  const swapIo = vm && prev && prev.vm ? { inB: rate(prev.vm.pswpin, vm.pswpin) * PAGE, outB: rate(prev.vm.pswpout, vm.pswpout) * PAGE, faults: rate(prev.vm.pgfault, vm.pgfault), major: rate(prev.vm.pgmajfault, vm.pgmajfault) } : null;

  // disco I/O
  const disks = physCache.map((d) => {
    const a = prev && prev.ds[d.name], b = dsNow[d.name];
    if (!a || !b || dt <= 0) return { ...d, rd: null, wr: null, rIops: null, wIops: null, util: null, await: null, queue: b ? b.inflight : null };
    const rdIos = b.rdIos - a.rdIos, wrIos = b.wrIos - a.wrIos;
    return {
      ...d, rd: ((b.rdSec - a.rdSec) * 512) / dt, wr: ((b.wrSec - a.wrSec) * 512) / dt, rIops: rdIos / dt, wIops: wrIos / dt,
      util: clamp(((b.ioMs - a.ioMs) / (dt * 1000)) * 100, 0, 100),
      await: rdIos + wrIos > 0 ? (b.rdMs - a.rdMs + (b.wrMs - a.wrMs)) / (rdIos + wrIos) : 0, queue: b.inflight,
    };
  });
  const sum = (k) => disks.reduce((acc, d) => acc + (d[k] || 0), 0);
  const ioRd = prev ? sum('rd') : null, ioWr = prev ? sum('wr') : null;
  const ioUtil = disks.length && prev ? Math.max(...disks.map((d) => d.util || 0)) : null;

  // red
  const ifaces = Object.keys(netNow).filter((n) => n !== 'lo').map((n) => {
    const a = prev && prev.net[n], b = netNow[n];
    const info = ifaceInfo(n);
    return {
      name: n, ...info, virtual: VIRTUAL_IF.test(n) || n.startsWith('tailscale'),
      rxRate: a && dt > 0 ? Math.max(0, (b.rx - a.rx) / dt) : null, txRate: a && dt > 0 ? Math.max(0, (b.tx - a.tx) / dt) : null,
      rxTotal: b.rx, txTotal: b.tx, rxPk: b.rxPk, txPk: b.txPk, errors: b.rxErr + b.txErr, drops: b.rxDrop + b.txDrop,
    };
  }).sort((x, y) => Number(x.virtual) - Number(y.virtual) || (y.rxTotal + y.txTotal) - (x.rxTotal + x.txTotal));
  const real = ifaces.filter((i) => !i.virtual);
  const rx = prev ? real.reduce((a, i) => a + (i.rxRate || 0), 0) : null;
  const tx = prev ? real.reduce((a, i) => a + (i.txRate || 0), 0) : null;
  const tcp = tcpSockets();

  const procs = scanProcs(dt);
  const therm = thermal();
  const fdRaw = (read('/proc/sys/fs/file-nr') || '').split(/\s+/).map(Number);
  const uptime = parseFloat((read('/proc/uptime') || '0').split(' ')[0]);

  const memPct = mem && mem.total ? (mem.used / mem.total) * 100 : null;
  const swapPct = mem && mem.swapTotal ? (mem.swapUsed / mem.swapTotal) * 100 : 0;
  recordSample({ t, cpu: cpu.pct, usr: cpu.usr, sys: cpu.sys, iow: cpu.iow, mem: memPct, swap: swapPct, temp: therm ? therm.package.c : null, load: loadavg[0], rx, tx, rd: ioRd, wr: ioWr, util: ioUtil });

  prev = { t, stat, vm, ds: dsNow, net: netNow };
  latest = {
    t, uptime, host: staticHost,
    cpu: { pct: round(cpu.pct), usr: round(cpu.usr), sys: round(cpu.sys), iow: round(cpu.iow), stl: round(cpu.stl), cores: cpu.cores, load: loadavg, threads: staticHost.threads, activity: sys },
    psi: psi(),
    mem: mem ? { ...mem, pct: round(memPct), swapIo } : null,
    disk: diskCache, disks,
    net: { ifaces, rx, tx, tcp },
    thermal: therm, power: power(),
    procs, fds: { used: fdRaw[0] || null, max: fdRaw[2] || null },
    records: state.records, since: state.since,
  };
  latest.status = overallStatus(latest);
}

function overallStatus(s) {
  const reasons = [];
  let level = 'ok';
  const bump = (l, msg) => { reasons.push({ level: l, msg }); if (l === 'crit' || (l === 'warn' && level === 'ok')) level = l; };
  if (s.thermal) { const c = s.thermal.package.c, lim = s.thermal.package.limit; if (c >= lim - 10) bump('crit', `Temperatura crítica: ${c} °C`); else if (c >= 85) bump('warn', `Temperatura alta: ${c} °C`); }
  if (s.thermal && s.thermal.throttle > 0) bump('warn', `El procesador redujo su velocidad por calor (${s.thermal.throttle} veces)`);
  if (s.disk) { if (s.disk.pct >= 90) bump('crit', `Disco al ${round(s.disk.pct, 0)} %`); else if (s.disk.pct >= 80) bump('warn', `Disco al ${round(s.disk.pct, 0)} %`); if (s.disk.inodes.pct >= 90) bump('crit', 'Inodos casi agotados'); }
  if (s.mem && s.mem.total) { const a = (s.mem.avail / s.mem.total) * 100; if (a < 8) bump('crit', 'Memoria RAM casi agotada'); else if (a < 15) bump('warn', 'Poca memoria RAM disponible'); }
  if (s.mem && s.mem.swapIo && (s.mem.swapIo.inB + s.mem.swapIo.outB) > 5 * 1024 * 1024) bump('warn', 'Mucha actividad de swap (la RAM no alcanza)');
  const cores = s.cpu.threads || 1;
  if (s.cpu.load[1] > cores * 1.5) bump('warn', `Carga alta sostenida (${s.cpu.load[1].toFixed(1)} con ${cores} hilos)`);
  if (s.power && s.power.ac === false) { const cap = s.power.battery ? s.power.battery.capacity : null; bump(cap !== null && cap < 20 ? 'crit' : 'warn', `Sin corriente: con batería${cap !== null ? ` (${cap} %)` : ''}`); }
  return { level, reasons };
}

// ───────────────────────── demostración (solo para probar el diseño) ─────────────────────────
function demoV(t) {
  const h = t / 3600000, w = (p, a) => Math.sin(t / 1000 / p) * a;
  const busy = Math.max(0, Math.sin(h * 1.1)) ;
  const cpu = clamp(14 + w(2400, 7) + w(900, 3) + w(31, 1.5) + 26 * busy, 2, 96);
  return {
    cpu, usr: cpu * 0.66, sys: cpu * 0.26, iow: cpu * 0.08,
    mem: clamp(31 + w(5200, 4) + 6 * busy, 10, 90), swap: 0.4 + Math.max(0, w(8000, 0.3)),
    temp: 49 + w(3100, 4) + w(1100, 1.2) + w(17, .4) + 15 * busy,
    load: clamp(0.4 + busy * 1.6 + w(700, .2), 0.05, 6),
    rx: Math.max(0, 180e3 + w(500, 120e3) + busy * 900e3 + Math.max(0, w(190, 400e3))), tx: Math.max(0, 90e3 + w(420, 60e3) + busy * 300e3),
    rd: Math.max(0, 0.35e6 + w(600, .3e6) + busy * 3e6), wr: Math.max(0, 0.9e6 + w(300, .6e6) + busy * 5e6),
    util: clamp(3 + busy * 24 + w(200, 2), 0, 100),
  };
}
if (DEMO && state.minutes.length === 0) {
  const now = Date.now();
  for (let i = 1440; i > 0; i--) { const t = Math.floor((now - i * 60000) / 60000) * 60000, d = demoV(t); const p = { t }; for (const k of KEYS) { p[k] = round(d[k], k === 'load' ? 2 : 1); if (MAXED.has(k)) p[`${k}Max`] = round(d[k] * 1.18 + 1, 1); } state.minutes.push(p); }
  for (let i = 168; i > 0; i--) { const t = Math.floor((now - i * 3600000) / 3600000) * 3600000, d = demoV(t); const p = { t }; for (const k of KEYS) { p[k] = round(d[k], k === 'load' ? 2 : 1); if (MAXED.has(k)) p[`${k}Max`] = round(d[k] * 1.3 + 2, 1); } state.hours.push(p); }
  state.records = { temp: { v: 71.4, t: now - 2.4 * 3600000 }, cpu: { v: 96.2, t: now - 5 * 3600000 }, mem: { v: 58.8, t: now - 9 * 3600000 }, net: { v: 18.4e6, t: now - 7 * 3600000 }, load: { v: 5.8, t: now - 5 * 3600000 }, diskFree: { v: 30.9e9, t: now - 86400000 } };
  state.since = now - 6 * 86400000;
}
function demoSample(t) {
  const d = demoV(t);
  recordSample({ t, ...d });
  const cores = [0, 1, 2, 3].map((i) => ({ pct: round(clamp(d.cpu + Math.sin(t / 9000 + i * 1.7) * 14, 1, 99)), mhz: Math.round(1100 + (d.cpu / 100) * 1900 + i * 40), maxMhz: 3100 }));
  const GB = 1024 ** 3, total = 7.15 * GB, used = total * d.mem / 100;
  latest = {
    t, uptime: 3.4 * 86400 + 5 * 3600,
    host: { name: 'servermacs', machine: 'MacBookPro12,1', os: 'Ubuntu 26.04.1 LTS', kernel: '7.0.0-42-generic', arch: 'x64', cpu: 'Intel Core i5-5257U CPU @ 2.70GHz', threads: 4, physicalCores: 2, governor: 'schedutil' },
    cpu: { pct: round(d.cpu), usr: round(d.usr), sys: round(d.sys), iow: round(d.iow), stl: 0, cores, load: [round(d.load, 2), round(d.load * .9, 2), round(d.load * .7, 2)], threads: 4, activity: { ctxt: 5200 + d.cpu * 90, intr: 3100 + d.cpu * 40, forks: 3 + d.cpu / 8, running: 1 + Math.round(d.cpu / 40), blocked: 0 } },
    psi: { cpu: { avg10: round(d.cpu / 40), avg60: round(d.cpu / 55), avg300: .4 }, memory: { avg10: 0, avg60: 0, avg300: 0 }, io: { avg10: round(d.util / 30), avg60: round(d.util / 40), avg300: .2 } },
    mem: { total, used, avail: total - used, free: total * .12, buffers: total * .03, cache: total * .46, apps: used * .8, shmem: 32e6, slab: 310e6, dirty: 1.2e6, writeback: 0, mapped: 410e6, swapTotal: 4 * GB, swapUsed: .4 * 1024 ** 2 * 3, pct: round(d.mem), swapIo: { inB: 0, outB: 0, faults: 1800 + d.cpu * 60, major: 0.2 } },
    disk: { total: 57.8e9, used: 21.6e9, free: 33.2e9, pct: 39.4, inodes: { total: 3.6e6, used: 410e3, pct: 11.4 } },
    disks: [{ name: 'sda', bytes: 121.3e9, model: 'APPLE SSD SM0128', kind: 'SSD', rd: d.rd, wr: d.wr, rIops: d.rd / 24e3, wIops: d.wr / 14e3, util: d.util, await: 1.8 + d.util / 12, queue: 0 }],
    net: { ifaces: [
      { name: 'wlp3s0', kind: 'wifi', state: 'up', speed: null, ip: '192.168.1.58', virtual: false, rxRate: d.rx, txRate: d.tx, rxTotal: 48.2e9, txTotal: 9.7e9, rxPk: 33e6, txPk: 21e6, errors: 0, drops: 3 },
      { name: 'tailscale0', kind: 'vpn', state: 'unknown', speed: null, ip: '100.88.47.41', virtual: true, rxRate: d.rx * .2, txRate: d.tx * .2, rxTotal: 2.1e9, txTotal: 4.4e9, rxPk: 2e6, txPk: 3e6, errors: 0, drops: 0 },
      { name: 'docker0', kind: 'docker', state: 'up', speed: 10000, ip: '172.17.0.1', virtual: true, rxRate: 0, txRate: 0, rxTotal: 0, txTotal: 0, rxPk: 0, txPk: 0, errors: 0, drops: 0 }],
      rx: d.rx, tx: d.tx, tcp: { states: { ESTABLISHED: 38, LISTEN: 14, TIME_WAIT: 9, CLOSE_WAIT: 1, SYN_SENT: 0, OTHER: 0 }, listening: [{ port: 22, local: false }, { port: 80, local: false }, { port: 443, local: false }, { port: 3000, local: false }, { port: 3002, local: false }, { port: 5173, local: false }, { port: 5434, local: false }, { port: 8088, local: false }, { port: 53, local: true }, { port: 55432, local: true }] } },
    thermal: { package: { c: round(d.temp), label: 'Procesador', limit: 105 }, cores: [{ label: 'Core 0', c: round(d.temp - 1.2) }, { label: 'Core 1', c: round(d.temp + .8) }], others: [{ label: 'Chipset', c: round(d.temp - 2.5) }, { label: 'Batería', c: 34.4 }], fans: [], throttle: 0 },
    power: { ac: true, battery: { capacity: 100, status: 'Full', health: 87, cycles: 222, watts: 0, wh: 59.2, whFull: 59.2, hours: null } },
    procs: { counts: { total: 312, threads: 1180, running: 1, sleeping: 309, zombies: 0, stopped: 2 },
      topCpu: [{ name: 'chrome', count: 11, cpu: round(d.cpu * .6), rss: 610e6 }, { name: 'node', count: 4, cpu: round(d.cpu * .25), rss: 420e6 }, { name: 'postgres', count: 9, cpu: round(d.cpu * .1), rss: 310e6 }, { name: 'dockerd', count: 1, cpu: 1.2, rss: 96e6 }, { name: 'tailscaled', count: 1, cpu: .8, rss: 52e6 }, { name: 'nginx', count: 5, cpu: .3, rss: 31e6 }],
      topMem: [{ name: 'chrome', count: 11, cpu: 5, rss: 610e6 }, { name: 'node', count: 4, cpu: 2, rss: 420e6 }, { name: 'postgres', count: 9, cpu: 1, rss: 310e6 }, { name: 'dockerd', count: 1, cpu: 1, rss: 96e6 }, { name: 'tailscaled', count: 1, cpu: .8, rss: 52e6 }, { name: 'nginx', count: 5, cpu: .3, rss: 31e6 }] },
    fds: { used: 2187, max: 9223372036854775807 },
    records: state.records, since: state.since,
  };
  latest.status = overallStatus(latest);
}

// ───────────────────────── HTTP ─────────────────────────
const INDEX = fs.readFileSync(path.join(__dirname, 'index.html'));
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'",
};
const send = (res, code, body, type) => { res.writeHead(code, { ...SECURITY, 'Content-Type': type }); res.end(body); };
const json = (res, obj) => send(res, 200, JSON.stringify(obj), 'application/json; charset=utf-8');
function history(range) {
  switch (range) {
    case '15m': return { range, stepMs: SAMPLE_MS, points: live };
    case '1h': return { range, stepMs: 60000, points: state.minutes.slice(-60) };
    case '7d': return { range, stepMs: 3600000, points: state.hours };
    default: return { range: '24h', stepMs: 60000, points: state.minutes.slice(-1440) };
  }
}
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido', 'text/plain; charset=utf-8');
  const url = new URL(req.url, 'http://monitor');
  switch (url.pathname) {
    case '/': case '/index.html': return send(res, 200, INDEX, 'text/html; charset=utf-8');
    case '/healthz': return send(res, 200, 'ok', 'text/plain');
    case '/api/snapshot': return latest ? json(res, latest) : send(res, 503, '{"error":"iniciando"}', 'application/json');
    case '/api/history': return json(res, history(url.searchParams.get('range')));
    default: return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
  }
});

await sample();
setTimeout(() => sample().catch(() => {}), 1200); // segunda muestra rápida para tener tasas
setInterval(() => { sample().catch((e) => console.warn('[monitor] muestreo:', e.message)); }, SAMPLE_MS);
setInterval(saveState, 120000);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { saveState(); process.exit(0); });
server.listen(PORT, LISTEN_HOST, () => console.log(`[monitor] panel de solo lectura en ${LISTEN_HOST}:${PORT}${DEMO ? ' (demostración)' : ''}`));
