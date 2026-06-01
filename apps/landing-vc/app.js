/* ═══════════════════════════════════════════════════
   MOTO PARTES VC — app.js
   · Reveal animations (IntersectionObserver + delays)
   · Navbar scroll + hamburger
   · Stats counter animation
   · Countdown timer
   · Form de citas → API
   · WhatsApp links dinámicos
   · Datepicker (min = mañana, bloquea domingos)
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
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navMobile = document.getElementById('navMobile');

  let lastY = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    navbar.classList.toggle('scrolled', y > 40);
    lastY = y;
  }, { passive: true });

  hamburger.addEventListener('click', () => navMobile.classList.toggle('open'));
  navMobile.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navMobile.classList.remove('open')));
}

/* ── REVEAL ANIMATIONS ───────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right');
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('revealed'));
    return;
  }

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el    = entry.target;
      const delay = parseInt(el.dataset.delay || 0);
      setTimeout(() => el.classList.add('revealed'), delay);
      obs.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

  els.forEach(el => obs.observe(el));
}

/* ── STATS COUNTER ───────────────────────────────── */
function animateCounter(el, target, duration = 1800) {
  let start = null;
  const step = (ts) => {
    if (!start) start = ts;
    const progress = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    el.textContent = Math.floor(ease * target);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target;
  };
  requestAnimationFrame(step);
}

function initStats() {
  const statEls = document.querySelectorAll('.stat-num[data-target]');
  if (!statEls.length || !('IntersectionObserver' in window)) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el     = entry.target;
      const target = parseInt(el.dataset.target);
      animateCounter(el, target);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });

  statEls.forEach(el => obs.observe(el));
}

/* ── COUNTDOWN ───────────────────────────────────── */
function initCountdown() {
  const els = {
    days:  document.getElementById('cd-days'),
    hours: document.getElementById('cd-hours'),
    mins:  document.getElementById('cd-mins'),
    secs:  document.getElementById('cd-secs'),
  };
  if (!els.days) return;
  const pad = n => String(n).padStart(2, '0');

  function tick() {
    const diff = PROMO_END - Date.now();
    if (diff <= 0) {
      Object.values(els).forEach(e => { if (e) e.textContent = '00'; });
      const label = document.querySelector('.promo-countdown-label');
      if (label) label.textContent = 'Esta promoción ha finalizado';
      return;
    }
    els.days.textContent  = pad(Math.floor(diff / 864e5));
    els.hours.textContent = pad(Math.floor((diff % 864e5) / 36e5));
    els.mins.textContent  = pad(Math.floor((diff % 36e5) / 6e4));
    els.secs.textContent  = pad(Math.floor((diff % 6e4) / 1000));
  }
  tick();
  setInterval(tick, 1000);
}

/* ── DATEPICKER ──────────────────────────────────── */
function initDatepicker() {
  const fechaInput = document.getElementById('fecha');
  if (!fechaInput) return;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  fechaInput.min = tomorrow.toISOString().slice(0, 10);

  fechaInput.addEventListener('change', () => {
    const d = new Date(fechaInput.value + 'T12:00:00');
    if (d.getDay() === 0) {
      fechaInput.setCustomValidity('No atendemos los domingos. Por favor elige otro día.');
      fechaInput.reportValidity();
      fechaInput.value = '';
    } else {
      fechaInput.setCustomValidity('');
    }
  });
}

/* ── FORMULARIO ──────────────────────────────────── */
function initForm() {
  const form       = document.getElementById('citaForm');
  const successBox = document.getElementById('formSuccess');
  const errorBox   = document.getElementById('formError');
  const submitBtn  = document.getElementById('submitBtn');
  const submitText = document.getElementById('submitText');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    let valid = true;
    ['nombre', 'telefono', 'tipo_servicio', 'fecha', 'hora'].forEach(id => {
      const el = document.getElementById(id);
      if (!el.value.trim()) { el.classList.add('error'); valid = false; }
      else el.classList.remove('error');
    });

    const telEl = document.getElementById('telefono');
    const phone = telEl.value.replace(/\D/g, '');
    if (phone.length !== 10) { telEl.classList.add('error'); valid = false; }

    if (!valid) {
      errorBox.textContent = 'Por favor completa todos los campos requeridos correctamente.';
      errorBox.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitText.textContent = 'Enviando…';

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre:        document.getElementById('nombre').value.trim(),
          telefono:      phone,
          tipo_servicio: document.getElementById('tipo_servicio').value,
          fecha:         document.getElementById('fecha').value,
          hora:          document.getElementById('hora').value,
          notas:         document.getElementById('notas').value.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error ' + res.status);

      form.hidden       = true;
      successBox.hidden = false;
      successBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      errorBox.textContent = err.message || 'Ocurrió un error. Inténtalo por WhatsApp.';
      errorBox.hidden = false;
      submitBtn.disabled  = false;
      submitText.textContent = 'Solicitar cita';
    }
  });

  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => el.classList.remove('error'));
  });
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
