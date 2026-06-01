/* ═══════════════════════════════════════════
   MOTO PARTES VC — app.js
   · Navbar scroll + hamburger
   · Countdown timer (promo junio 2026)
   · Formulario de citas → API
   · WhatsApp número dinámico (configurable)
   · Fecha mínima en datepicker (mañana, sin domingos)
═══════════════════════════════════════════ */

// ─── CONFIG ───────────────────────────────────
const API_URL = 'https://motopartes.cloud/api/public/appointments';
const WA_NUMBER = '529671234567'; // Número de ejemplo — cambiar por el real
const PROMO_END  = new Date('2026-06-30T23:59:59'); // fin de la promo

// ─── WHATSAPP LINKS ───────────────────────────
function setWaLinks() {
  const waUrl = `https://wa.me/${WA_NUMBER}`;
  document.querySelectorAll('a[id$="Btn"], a.wa-float, a.btn-wa').forEach(el => {
    if (el.href.includes('9XXXXXXXXX')) el.href = waUrl;
  });
  const num = document.getElementById('waNumber');
  if (num) num.textContent = WA_NUMBER.replace('52', '+52 ').replace(/(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3');
}

// ─── NAVBAR ──────────────────────────────────
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navMobile = document.getElementById('navMobile');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  hamburger.addEventListener('click', () => {
    navMobile.classList.toggle('open');
  });

  // cerrar mobile nav al hacer click en un link
  navMobile.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => navMobile.classList.remove('open'));
  });
}

// ─── COUNTDOWN ───────────────────────────────
function initCountdown() {
  const daysEl  = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl  = document.getElementById('cd-mins');
  const secsEl  = document.getElementById('cd-secs');
  if (!daysEl) return;

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const diff = PROMO_END - Date.now();
    if (diff <= 0) {
      daysEl.textContent = hoursEl.textContent = minsEl.textContent = secsEl.textContent = '00';
      // Cambiar banner a "promo finalizada"
      const label = document.querySelector('.promo-countdown-label');
      if (label) label.textContent = '⚠️ Esta promoción ya terminó';
      return;
    }
    const d = Math.floor(diff / 864e5);
    const h = Math.floor((diff % 864e5) / 36e5);
    const m = Math.floor((diff % 36e5) / 6e4);
    const s = Math.floor((diff % 6e4) / 1000);
    daysEl.textContent  = pad(d);
    hoursEl.textContent = pad(h);
    minsEl.textContent  = pad(m);
    secsEl.textContent  = pad(s);
  }

  tick();
  setInterval(tick, 1000);
}

// ─── DATEPICKER — mínimo mañana, sin domingos ─
function initDatepicker() {
  const fechaInput = document.getElementById('fecha');
  if (!fechaInput) return;

  // Mínimo = mañana
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const min = tomorrow.toISOString().slice(0, 10);
  fechaInput.min = min;
  fechaInput.value = '';

  fechaInput.addEventListener('change', () => {
    const chosen = new Date(fechaInput.value + 'T12:00:00');
    if (chosen.getDay() === 0) { // domingo
      fechaInput.setCustomValidity('No atendemos los domingos. Por favor elige otro día.');
      fechaInput.reportValidity();
      fechaInput.value = '';
    } else {
      fechaInput.setCustomValidity('');
    }
  });
}

// ─── FORMULARIO DE CITAS ──────────────────────
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

    // Validación básica visual
    let valid = true;
    ['nombre', 'telefono', 'tipo_servicio', 'fecha', 'hora'].forEach(id => {
      const el = document.getElementById(id);
      if (!el.value.trim()) { el.classList.add('error'); valid = false; }
      else el.classList.remove('error');
    });

    // Validar teléfono 10 dígitos
    const telEl = document.getElementById('telefono');
    const phone = telEl.value.replace(/\D/g, '');
    if (phone.length !== 10) {
      telEl.classList.add('error');
      valid = false;
    }

    if (!valid) {
      errorBox.textContent = 'Por favor completa todos los campos requeridos correctamente.';
      errorBox.hidden = false;
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    // Enviar
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

      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status}`);
      }

      // Éxito
      form.hidden = true;
      successBox.hidden = false;
      successBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (err) {
      errorBox.textContent = err.message || 'Ocurrió un error. Inténtalo de nuevo o escríbenos por WhatsApp.';
      errorBox.hidden = false;
      submitBtn.disabled = false;
      submitText.textContent = '📅 Solicitar cita';
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // Limpiar error al escribir
  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => el.classList.remove('error'));
  });
}

// ─── ANIMACIONES DE ENTRADA (IntersectionObserver) ─
function initAnimations() {
  if (!('IntersectionObserver' in window)) return;
  const style = document.createElement('style');
  style.textContent = `
    .fade-in { opacity: 0; transform: translateY(24px); transition: opacity .6s ease, transform .6s ease; }
    .fade-in.visible { opacity: 1; transform: none; }
  `;
  document.head.appendChild(style);

  const targets = document.querySelectorAll(
    '.service-card, .part-card, .brand-chip, .info-item'
  );
  targets.forEach(el => el.classList.add('fade-in'));

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(el => obs.observe(el));
}

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setWaLinks();
  initNavbar();
  initCountdown();
  initDatepicker();
  initForm();
  initAnimations();
});
