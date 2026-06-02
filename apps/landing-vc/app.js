/* ═══════════════════════════════════════════════════
   MOTO PARTES VC — app.js
═══════════════════════════════════════════════════ */

const API_URL   = 'https://motopartes.cloud/api/public/appointments';
const WA_NUMBER = '529631911772';
const PROMO_END = new Date('2026-06-30T23:59:59');

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
    setTimeout(() => el.classList.add('revealed'), d);
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
  setTimeout(() => els.forEach(el => el.classList.add('revealed')), 1500);

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

/* ── DATEPICKER ──────────────────────────────────── */
function initDatepicker() {
  const fi = document.getElementById('fecha');
  if (!fi) return;
  const t = new Date(); t.setDate(t.getDate() + 1);
  fi.min = t.toISOString().slice(0, 10);
  fi.addEventListener('change', () => {
    if (new Date(fi.value + 'T12:00:00').getDay() === 0) {
      fi.setCustomValidity('No atendemos domingos. Elige otro día.');
      fi.reportValidity(); fi.value = '';
    } else { fi.setCustomValidity(''); }
  });
}

/* ── FORMULARIO ──────────────────────────────────── */
function initForm() {
  const form = document.getElementById('citaForm');
  const ok   = document.getElementById('formSuccess');
  const err  = document.getElementById('formError');
  const btn  = document.getElementById('submitBtn');
  const txt  = document.getElementById('submitText');
  if (!form) return;

  /* Mostrar campo libre al seleccionar "Otro" */
  const selectServicio = document.getElementById('tipo_servicio');
  const otroWrap       = document.getElementById('otroWrap');
  const otroInput      = document.getElementById('otro_servicio');
  selectServicio.addEventListener('change', () => {
    const esOtro = selectServicio.value === 'Otro';
    otroWrap.style.display = esOtro ? 'flex' : 'none';
    if (esOtro) otroInput.focus();
    else { otroInput.value = ''; otroInput.classList.remove('error'); }
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    let valid = true;
    ['nombre','telefono','tipo_servicio','moto_marca','moto_modelo','fecha','hora'].forEach(id => {
      const el = document.getElementById(id);
      if (!el.value.trim()) { el.classList.add('error'); valid = false; }
      else el.classList.remove('error');
    });
    const tel = document.getElementById('telefono');
    const ph  = tel.value.replace(/\D/g, '');
    if (ph.length !== 10) { tel.classList.add('error'); valid = false; }

    /* Validar y resolver servicio libre */
    let servicioFinal = selectServicio.value;
    if (servicioFinal === 'Otro') {
      if (!otroInput.value.trim()) { otroInput.classList.add('error'); valid = false; }
      else servicioFinal = otroInput.value.trim();
    }

    if (!valid) { err.textContent = 'Por favor completa todos los campos requeridos.'; err.hidden = false; return; }

    btn.disabled = true; txt.textContent = 'Enviando…';
    try {
      const res  = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nombre: document.getElementById('nombre').value.trim(), telefono: ph, tipo_servicio: servicioFinal, moto_marca: document.getElementById('moto_marca').value, moto_modelo: document.getElementById('moto_modelo').value.trim(), moto_anio: document.getElementById('moto_anio').value || null, fecha: document.getElementById('fecha').value, hora: document.getElementById('hora').value, notas: document.getElementById('notas').value.trim() }) });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
      form.hidden = true; ok.hidden = false;
      ok.scrollIntoView({ behavior:'smooth', block:'start' });
    } catch(e) {
      err.textContent = e.message || 'Ocurrió un error. Inténtalo por WhatsApp.';
      err.hidden = false; btn.disabled = false; txt.textContent = 'Solicitar cita';
    }
  });
  form.querySelectorAll('input,select,textarea').forEach(el => el.addEventListener('input', () => el.classList.remove('error')));
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
  initWaLinks();
  initNavbar();
  initReveal();
  initStats();
  initCountdown();
  initDatepicker();
  initForm();
  initCanvas3D();
});
