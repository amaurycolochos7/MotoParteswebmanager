/* ═══════════════════════════════════════════════════
   MOTO PARTES VC — app.js
═══════════════════════════════════════════════════ */

const API_URL   = 'https://motopartes.cloud/api/public/appointments';
const WA_NUMBER = '529631911772';
const PROMO_END = new Date('2026-06-30T23:59:59');

/* ── INTRO (Ducati + logo) ───────────────────────── */
let introResolve;
const introReady = new Promise(r => { introResolve = r; });

function initIntro() {
  const html = document.documentElement;
  const intro = document.getElementById('intro');
  if (!intro || !html.classList.contains('intro-on')) { introResolve(); return; }

  const num = document.getElementById('introNum');
  const COUNT_START = 1050, COUNT_MS = 1400, OPEN_AT = 2650;
  let finished = false;
  const t0 = performance.now();

  // Contador 0 -> 100 sincronizado con el anillo (misma curva aproximada)
  const ease = p => (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  (function tick(now) {
    if (finished) return;
    const p = Math.min(Math.max((now - t0 - COUNT_START) / COUNT_MS, 0), 1);
    if (num) num.textContent = Math.round(ease(p) * 100);
    if (p < 1) requestAnimationFrame(tick);
  })(t0);

  function finish() {
    if (finished) return;
    finished = true;
    if (num) num.textContent = '100';
    try { sessionStorage.setItem('mp_intro', '1'); } catch (e) { /* modo privado */ }
    intro.classList.add('opening');
    setTimeout(() => {
      html.classList.remove('intro-on');   // libera el scroll y la moto del hero "se enciende"
      introResolve();
      setTimeout(() => intro.remove(), 1200);
    }, 700);
  }
  const skip = document.getElementById('introSkip');
  if (skip) skip.addEventListener('click', finish);
  setTimeout(finish, OPEN_AT);
}

/* ── PROMO VENCIDA ───────────────────────────────── */
function initPromo() {
  // Con la promo terminada, el contador en 00 y la fecha de junio se ven rotos:
  // se oculta la seccion, sus enlaces y la opcion del formulario.
  if (Date.now() <= PROMO_END) return;
  document.querySelectorAll('#promocion, a[href="#promocion"]').forEach(el => el.remove());
  document.querySelectorAll('#tipo_servicio option').forEach(o => { if (/promo/i.test(o.value)) o.remove(); });
}

/* ── WA LINKS ────────────────────────────────────── */
function initWaLinks() {
  const url = 'https://wa.me/' + WA_NUMBER;
  document.querySelectorAll('a[href*="wa.me"]').forEach(el => { el.href = url; });
  const num = document.getElementById('waNumber');
  if (num) num.textContent = '+52 963 191 1772';
}

/* ── NAVBAR ──────────────────────────────────────── */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const burger  = document.getElementById('burger');
  const mob     = document.getElementById('navMobile');
  // Transparente sobre el hero, sólida al hacer scroll
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('solid', window.scrollY > 80);
  }, { passive: true });
  burger.addEventListener('click', () => mob.classList.toggle('open'));
  mob.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mob.classList.remove('open')));
}

/* ── REVEAL ──────────────────────────────────────── */
function initReveal() {
  // Activar ocultamiento solo si JS funciona correctamente
  document.body.classList.add('js-reveal');

  const els = Array.from(document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right'));
  if (!els.length) return;

  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('revealed'));
    return;
  }

  function revealEl(el) {
    if (el.classList.contains('revealed')) return;
    const d = parseInt(el.dataset.d || 0);
    introReady.then(() => setTimeout(() => el.classList.add('revealed'), d));
  }

  function revealVisible() {
    const vh = window.innerHeight;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < vh + 100 && r.bottom > -100) revealEl(el);
    });
  }

  revealVisible();
  setTimeout(revealVisible, 150);
  setTimeout(revealVisible, 500);
  // Seguro final: revelar todo lo que quede a los 1.5s
  introReady.then(() => setTimeout(() => els.forEach(el => el.classList.add('revealed')), 1500));

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { revealEl(e.target); obs.unobserve(e.target); }
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' });

  els.forEach(el => { if (!el.classList.contains('revealed')) obs.observe(el); });
}

/* ── STATS COUNTER — corregido ───────────────────── */
function animateCounter(el, target) {
  const dur  = target > 100 ? 2200 : 1600;
  let start  = null;
  const step = ts => {
    if (!start) start = ts;
    const p   = Math.min((ts - start) / dur, 1);
    const e   = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.floor(e * target);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
}

function initStats() {
  // Soporta .stat-n y .hs-n (clases usadas en el HTML)
  const els = document.querySelectorAll('[data-target]');
  if (!els.length) return;

  if (!('IntersectionObserver' in window)) {
    els.forEach(el => animateCounter(el, parseInt(el.dataset.target)));
    return;
  }

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      animateCounter(e.target, parseInt(e.target.dataset.target));
      obs.unobserve(e.target);
    });
  }, { threshold: 0.4 });

  els.forEach(el => obs.observe(el));
}

/* ── COUNTDOWN ───────────────────────────────────── */
function initCountdown() {
  const d = document.getElementById('cd-days');
  const h = document.getElementById('cd-hours');
  const m = document.getElementById('cd-mins');
  const s = document.getElementById('cd-secs');
  if (!d) return;
  const pad = n => String(n).padStart(2, '0');
  function tick() {
    const diff = PROMO_END - Date.now();
    if (diff <= 0) { [d,h,m,s].forEach(e => { if(e) e.textContent='00'; }); return; }
    d.textContent = pad(Math.floor(diff / 864e5));
    h.textContent = pad(Math.floor((diff % 864e5) / 36e5));
    m.textContent = pad(Math.floor((diff % 36e5) / 6e4));
    s.textContent = pad(Math.floor((diff % 6e4) / 1000));
  }
  tick();
  setInterval(tick, 1000);
}

/* ── FECHA ───────────────────────────────────────── */
const MAX_DIAS = 120;
function isoLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function initDatepicker() {
  const fi = document.getElementById('fecha');
  if (!fi) return;
  const t = new Date(); t.setDate(t.getDate() + 1);
  const m = new Date(); m.setDate(m.getDate() + MAX_DIAS);
  fi.min = isoLocal(t);
  fi.max = isoLocal(m);
}

/* ── FORMULARIO ──────────────────────────────────── */
function initForm() {
  const $ = id => document.getElementById(id);
  const form = $('citaForm');
  if (!form) return;
  const ok = $('formSuccess'), err = $('formError');
  const btn = $('submitBtn'), txt = $('submitText');
  const fecha = $('fecha'), hora = $('hora'), hint = $('slotHint');

  const showErr = msg => { err.textContent = msg; err.hidden = false; };
  const clearErr = () => { err.hidden = true; };

  /* Campos "Otro / Otra" */
  function toggleOther(selectId, wrapId, inputId, value) {
    const sel = $(selectId), wrap = $(wrapId), inp = $(inputId);
    if (!sel || !wrap || !inp) return;
    sel.addEventListener('change', () => {
      const on = sel.value === value;
      wrap.hidden = !on;
      if (on) inp.focus(); else { inp.value = ''; inp.classList.remove('error'); }
    });
  }
  toggleOther('tipo_servicio', 'otroWrap', 'otro_servicio', 'Otro');
  toggleOther('moto_marca', 'otraMarcaWrap', 'moto_marca_custom', 'Otra');

  /* Telefono: solo digitos (acepta pegar "+52 963 191 1772") */
  const tel = $('telefono');
  tel.addEventListener('input', () => {
    let d = tel.value.replace(/\D/g, '');
    if (d.length > 10 && d.startsWith('52')) d = d.slice(2);
    if (d.length > 10 && d.startsWith('1')) d = d.slice(1);
    tel.value = d.slice(0, 10);
  });

  /* Horas disponibles segun la fecha elegida */
  const fmt = h => { const n = +h.slice(0, 2); return ((n % 12) || 12) + h.slice(2) + (n < 12 ? ' am' : ' pm'); };
  const ALL = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  function fillHours(slots) {
    const prev = hora.value;
    hora.innerHTML = '<option value="">Selecciona…</option>' + slots.map(s =>
      '<option value="' + s.hora + '"' + (s.available ? '' : ' disabled') + '>' + fmt(s.hora) + (s.available ? '' : ' — no disponible') + '</option>').join('');
    hora.disabled = false;
    const keep = slots.find(s => s.hora === prev && s.available);
    hora.value = keep ? prev : '';
  }
  let reqId = 0;
  async function loadAvailability() {
    hint.hidden = true;
    if (!fecha.value) { hora.disabled = true; hora.innerHTML = '<option value="">Primero elige la fecha</option>'; return; }
    if (new Date(fecha.value + 'T12:00:00').getDay() === 0) {
      hora.disabled = true; hora.innerHTML = '<option value="">Cerrado los domingos</option>';
      hint.textContent = 'No atendemos domingos. Elige otro día.'; hint.hidden = false;
      return;
    }
    const id = ++reqId;
    hora.disabled = true; hora.innerHTML = '<option value="">Buscando horarios…</option>';
    try {
      const res = await fetch(API_URL + '/availability?fecha=' + encodeURIComponent(fecha.value));
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      if (id !== reqId) return;
      if (data.closed) {
        hora.disabled = true; hora.innerHTML = '<option value="">Sin servicio ese día</option>';
        hint.textContent = data.reason || 'Ese día no hay servicio. Elige otro día.'; hint.hidden = false;
        return;
      }
      fillHours(data.slots);
      if (!data.slots.some(s => s.available)) {
        hint.textContent = 'Ese día ya no tiene horarios libres. Prueba con otra fecha.'; hint.hidden = false;
      }
    } catch {
      if (id !== reqId) return;
      fillHours(ALL.map(h => ({ hora: h, available: true }))); // el servidor valida de todos modos
    }
  }
  fecha.addEventListener('change', () => { fecha.classList.remove('error'); loadAvailability(); });
  loadAvailability();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearErr();
    const must = ['nombre', 'telefono', 'moto_marca', 'moto_modelo', 'tipo_servicio', 'fecha', 'hora'];
    let valid = true;
    must.forEach(id => {
      const el = $(id);
      const bad = !el.value.trim();
      el.classList.toggle('error', bad);
      if (bad) valid = false;
    });
    if ($('telefono').value.replace(/\D/g, '').length !== 10) { $('telefono').classList.add('error'); valid = false; }

    let servicio = $('tipo_servicio').value;
    if (servicio === 'Otro') {
      const v = $('otro_servicio').value.trim();
      $('otro_servicio').classList.toggle('error', !v);
      if (!v) valid = false; else servicio = v;
    }
    let marca = $('moto_marca').value;
    if (marca === 'Otra') {
      const v = $('moto_marca_custom').value.trim();
      $('moto_marca_custom').classList.toggle('error', !v);
      if (!v) valid = false; else marca = v;
    }
    const anio = $('moto_anio').value.trim();
    if (anio && !/^\d{4}$/.test(anio)) { $('moto_anio').classList.add('error'); valid = false; }

    if (!valid) {
      showErr('Revisa los campos marcados en rojo.');
      const first = form.querySelector('.error');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    btn.disabled = true; txt.textContent = 'Enviando…';
    const payload = {
      nombre: $('nombre').value.trim(),
      telefono: $('telefono').value.replace(/\D/g, ''),
      tipo_servicio: servicio,
      moto_marca: marca,
      moto_modelo: $('moto_modelo').value.trim(),
      moto_anio: anio || null,
      fecha: fecha.value,
      hora: hora.value,
      notas: $('notas').value.trim(),
    };
    try {
      const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) loadAvailability();
        throw new Error(data.error || 'No se pudo enviar (error ' + res.status + ').');
      }
      showSuccess(payload, data.link);
    } catch (ex) {
      const offline = ex instanceof TypeError;
      showErr(offline ? 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.' : ex.message);
      btn.disabled = false; txt.textContent = 'Solicitar cita';
    }
  });

  function showSuccess(p, link) {
    const d = new Date(p.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const fechaTxt = d.charAt(0).toUpperCase() + d.slice(1);
    const moto = [p.moto_marca, p.moto_modelo, p.moto_anio].filter(Boolean).join(' ');
    $('okText').textContent = 'Te enviamos un mensaje por WhatsApp al ' + p.telefono + ' y te avisaremos por ahí en cuanto el taller revise tu solicitud.';
    const rows = [['Fecha', fechaTxt], ['Hora', fmt(p.hora)], ['Servicio', p.tipo_servicio], ['Moto', moto]];
    const sum = $('okSum');
    sum.textContent = '';
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      sum.append(dt, dd);
    });
    const lk = $('okLink');
    if (lk) { lk.hidden = !link; if (link) lk.href = link; }
    form.hidden = true; ok.hidden = false;
    ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('againBtn').addEventListener('click', () => {
    form.reset();
    ['otroWrap', 'otraMarcaWrap'].forEach(id => { $(id).hidden = true; });
    btn.disabled = false; txt.textContent = 'Solicitar cita';
    clearErr(); loadAvailability();
    ok.hidden = true; form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.querySelectorAll('input,select,textarea').forEach(el =>
    el.addEventListener('input', () => el.classList.remove('error')));
}

/* ── CANVAS 3D RINGS ─────────────────────────────── */
function initCanvas3D() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  let t = 0;
  const RINGS = [
    { R: 180, tilt: 0.22, speed: 0.008, opacity: 0.18, width: 1.5 },
    { R: 280, tilt: 0.55, speed: -0.005, opacity: 0.12, width: 1 },
    { R: 380, tilt: 0.85, speed: 0.006, opacity: 0.08, width: 1 },
    { R: 100, tilt: 1.1, speed: -0.012, opacity: 0.22, width: 2 },
  ];

  function drawRing(ring, time) {
    const cx = canvas.width  * 0.72;
    const cy = canvas.height * 0.48;
    const seg = 80;
    const cos = Math.cos, sin = Math.sin;
    const rotY = time * ring.speed;
    const rotX = ring.tilt;

    ctx.beginPath();
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      // 3D circle in XZ plane
      let x = ring.R * cos(a);
      let y = 0;
      let z = ring.R * sin(a);
      // Rotate around Y
      const x2 = x * cos(rotY) - z * sin(rotY);
      const z2 = x * sin(rotY) + z * cos(rotY);
      // Rotate around X (tilt)
      const y2 = y * cos(rotX) - z2 * sin(rotX);
      const z3 = y * sin(rotX) + z2 * cos(rotX);
      // Project with depth fade
      const fov = 900;
      const scale = fov / (fov + z3 + 500);
      const px = cx + x2 * scale;
      const py = cy + y2 * scale;
      const alpha = ring.opacity * Math.max(0.2, (z3 + ring.R + 500) / (ring.R * 2 + 500));
      ctx.strokeStyle = `rgba(220,38,38,${alpha.toFixed(3)})`;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineWidth = ring.width;
    ctx.stroke();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // fondo negro puro — sin tinte de color
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    RINGS.forEach(r => drawRing(r, t));
    t += 0.016;
    requestAnimationFrame(draw);
  }
  draw();
}

/* ── INIT ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Cada init va aislado: si uno falla no debe tumbar a los demas (asi un error
  // en el canvas o en los contadores nunca vuelve a dejar el formulario muerto).
  [initIntro, initPromo, initWaLinks, initNavbar, initReveal, initStats, initCountdown, initDatepicker, initForm, initCanvas3D]
    .forEach(fn => { try { fn(); } catch (e) { console.error('[landing] ' + fn.name + ' fallo:', e); } });
});
