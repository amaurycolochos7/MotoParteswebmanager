/* ═══════════════════════════════════════════════════
   MOTO PARTES VC — app.js
═══════════════════════════════════════════════════ */

const API_URL   = 'https://motopartes.cloud/api/public/appointments';
const WA_NUMBER = '529671234567';
const PROMO_END = new Date('2026-06-30T23:59:59');

/* ── WA LINKS ────────────────────────────────────── */
function initWaLinks() {
  const url = 'https://wa.me/' + WA_NUMBER;
  document.querySelectorAll('a[href*="wa.me"]').forEach(el => { el.href = url; });
  const num = document.getElementById('waNumber');
  if (num) num.textContent = '+52 967 123 4567';
}

/* ── NAVBAR ──────────────────────────────────────── */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const burger  = document.getElementById('burger');
  const mob     = document.getElementById('navMobile');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
  burger.addEventListener('click', () => mob.classList.toggle('open'));
  mob.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mob.classList.remove('open')));
}

/* ── REVEAL — corregido ──────────────────────────── */
function initReveal() {
  const els = Array.from(document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right'));
  if (!els.length) return;

  // Fallback instantáneo si no hay IntersectionObserver
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('revealed'));
    return;
  }

  function revealEl(el) {
    if (el.classList.contains('revealed')) return;
    const d = parseInt(el.dataset.d || 0); // <-- usa data-d (correcto)
    setTimeout(() => el.classList.add('revealed'), d);
  }

  // 1. Revelar INMEDIATAMENTE los que ya están en pantalla
  //    (IntersectionObserver es async, causa la pantalla negra en mobile)
  function revealVisible() {
    const vh = window.innerHeight;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < vh + 100 && r.bottom > -100) revealEl(el);
    });
  }

  revealVisible();                        // al cargar
  setTimeout(revealVisible, 200);         // retry por si el layout tardó

  // 2. IntersectionObserver para los que están debajo del fold
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

  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    let valid = true;
    ['nombre','telefono','tipo_servicio','fecha','hora'].forEach(id => {
      const el = document.getElementById(id);
      if (!el.value.trim()) { el.classList.add('error'); valid = false; }
      else el.classList.remove('error');
    });
    const tel = document.getElementById('telefono');
    const ph  = tel.value.replace(/\D/g, '');
    if (ph.length !== 10) { tel.classList.add('error'); valid = false; }
    if (!valid) { err.textContent = 'Por favor completa todos los campos requeridos.'; err.hidden = false; return; }

    btn.disabled = true; txt.textContent = 'Enviando…';
    try {
      const res  = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ nombre: document.getElementById('nombre').value.trim(), telefono: ph, tipo_servicio: document.getElementById('tipo_servicio').value, fecha: document.getElementById('fecha').value, hora: document.getElementById('hora').value, notas: document.getElementById('notas').value.trim() }) });
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

/* ── INIT ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initWaLinks();
  initNavbar();
  initReveal();
  initStats();
  initCountdown();
  initDatepicker();
  initForm();
});
