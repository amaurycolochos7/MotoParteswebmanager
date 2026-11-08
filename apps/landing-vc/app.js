/* ═══════════════════════════════════════════════════
   MOTO PARTES VC — app.js
═══════════════════════════════════════════════════ */

// API publica del taller. En una PC de desarrollo (localhost) apunta a la API local: ?apiport=3101
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const API_BASE  = IS_LOCAL
  ? 'http://localhost:' + (new URLSearchParams(location.search).get('apiport') || '3101') + '/api/public'
  : 'https://motopartes.cloud/api/public';
const API_URL   = API_BASE + '/appointments';
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

/* ── FORMULARIO DE CITA POR PASOS ────────────────── */
/* 1 WhatsApp -> 2 quién eres / tu moto -> 3 servicio -> 4 quién te atiende -> 5 día y hora -> 6 revisar y enviar.
   El número de WhatsApp es lo primero: si ya es cliente se le muestran sus motos; si es nuevo se piden sus datos.
   Al enviar, el taller guarda al cliente y su moto automáticamente. */
function initForm() {
  const $ = id => document.getElementById(id);
  const form = $('citaForm');
  if (!form) return;
  const ok = $('formSuccess'), err = $('formError');
  const btn = $('submitBtn'), txt = $('submitText');
  const fecha = $('fecha'), hora = $('hora'), hint = $('slotHint');
  const tel = $('telefono');
  const TOTAL = 6;

  const st = { step: 1, phone: '', known: null, motoId: '', addingMoto: false, mechId: '', mechName: '', mechs: null, mechState: 'idle' };

  const isNet = e => !!e && (e.name === 'TypeError' || e.name === 'AbortError');
  const NET_MSG = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const say = (id, text, bad) => { const m = $(id); if (!m) return; m.textContent = text || ''; m.hidden = !text; m.classList.toggle('step-msg--bad', !!bad); };
  const showErr = msg => { err.textContent = msg; err.hidden = false; };
  const clearErr = () => { err.hidden = true; };
  const fmt = h => { const n = +h.slice(0, 2); return ((n % 12) || 12) + h.slice(2) + (n < 12 ? ' am' : ' pm'); };
  const fmtTel = p => p.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3');
  const fechaLarga = f => { const d = new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }); return d.charAt(0).toUpperCase() + d.slice(1); };

  async function fetchJson(url, opts) {
    opts = opts || {};
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, {
        method: opts.method || 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    } finally { clearTimeout(timer); }
  }

  /* ── Navegación entre pasos ── */
  const steps = Array.from(form.querySelectorAll('.step'));
  const bars = Array.from(form.querySelectorAll('.step-bars i'));
  function go(n, quiet) {
    st.step = n;
    steps.forEach(s => { s.hidden = +s.dataset.step !== n; });
    bars.forEach((b, i) => b.classList.toggle('on', i < n));
    $('stepCount').textContent = 'Paso ' + n + ' de ' + TOTAL;
    if (n !== 5) { $('cal').hidden = true; $('fechaBtn').setAttribute('aria-expanded', 'false'); }
    clearErr();
    if (n === 4) loadMechanics(false);
    if (n === 5) { renderWhenHelp(); loadAvailability(); }
    if (n === 6) renderReview();
    if (quiet) return;
    const sec = steps[n - 1];
    const title = Array.from(sec.querySelectorAll('.step-title')).find(h => !h.closest('[hidden]'));
    if (title) title.focus({ preventScroll: true });
    const r = form.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.6) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Campos "Otro / Otra" ── */
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

  /* ── Paso 1: WhatsApp (solo dígitos; acepta pegar "+52 963 191 1772") ── */
  tel.addEventListener('input', () => {
    let d = tel.value.replace(/\D/g, '');
    if (d.length > 10 && d.startsWith('52')) d = d.slice(2);
    if (d.length > 10 && d.startsWith('1')) d = d.slice(1);
    tel.value = d.slice(0, 10);
    say('lookupMsg', '');
    $('step1Skip').hidden = true;
  });

  const busy1 = on => { $('step1Next').disabled = on; $('step1Text').textContent = on ? 'Buscando…' : 'Continuar'; };

  async function doLookup() {
    const phone = tel.value.replace(/\D/g, '');
    say('lookupMsg', ''); $('step1Skip').hidden = true;
    if (phone.length !== 10) {
      tel.classList.add('error');
      say('lookupMsg', 'Escribe los 10 dígitos de tu número de WhatsApp.', true);
      tel.focus();
      return;
    }
    busy1(true);
    try {
      const { res, data } = await fetchJson(API_BASE + '/lookup', { method: 'POST', body: { telefono: phone } });
      if (res.ok) {
        if (phone !== st.phone) { st.motoId = ''; st.addingMoto = false; }
        st.phone = phone;
        st.known = data.found ? { nombre: data.nombre, motos: Array.isArray(data.motos) ? data.motos : [] } : null;
        prepareStep2();
        go(2);
        return;
      }
      if (res.status === 400) { tel.classList.add('error'); say('lookupMsg', data.error || 'Revisa tu número de WhatsApp.', true); return; }
      // 429 u otro error del servidor: se puede seguir llenando los datos a mano
      say('lookupMsg', res.status === 429
        ? 'Hemos buscado este número demasiadas veces. Puedes continuar y escribir tus datos.'
        : 'No pudimos buscar tus datos en este momento. Inténtalo otra vez o continúa escribiéndolos.', true);
      $('step1Skip').hidden = false;
    } catch (e) {
      say('lookupMsg', isNet(e) ? NET_MSG : 'No pudimos buscar tus datos. Inténtalo de nuevo.', true);
      $('step1Skip').hidden = false;
    } finally { busy1(false); }
  }
  $('step1Next').addEventListener('click', doLookup);
  $('step1Skip').addEventListener('click', () => {
    const phone = tel.value.replace(/\D/g, '');
    if (phone.length !== 10) return;
    st.phone = phone; st.known = null; st.motoId = ''; st.addingMoto = false;
    prepareStep2(); go(2);
  });

  /* ── Paso 2: cliente conocido (elige moto) o nuevo (nombre + moto) ── */
  function motoName(m) { return [m.marca, m.modelo].filter(Boolean).join(' '); }
  function prepareStep2() {
    const k = st.known;
    say('step2Msg', '');
    $('knownBox').hidden = !k;
    $('newBox').hidden = !!k;
    if (!k) { $('motoForm').hidden = false; $('motoFormTitle').textContent = 'Datos de la motocicleta'; return; }
    $('knownName').textContent = k.nombre;
    if (k.motos.length === 0) st.addingMoto = true;
    $('knownHelp').textContent = k.motos.length
      ? '¿Con qué moto vienes? Toca la que quieras revisar.'
      : 'Aún no tenemos una moto registrada con este número. Agrega la tuya.';
    renderMotoCards();
  }
  function renderMotoCards() {
    const box = $('motoCards'); box.textContent = '';
    const k = st.known;
    k.motos.forEach(m => {
      const on = st.motoId === m.id && !st.addingMoto;
      const b = el('button', 'pick-card moto-card' + (on ? ' on' : ''));
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.append(el('span', 'pick-card-main', motoName(m)));
      if (m.anio) b.append(el('span', 'pick-card-sub', String(m.anio)));
      b.addEventListener('click', () => { st.motoId = m.id; st.addingMoto = false; say('step2Msg', ''); renderMotoCards(); });
      box.append(b);
    });
    if (k.motos.length) {
      const add = el('button', 'pick-card moto-card pick-card--add' + (st.addingMoto ? ' on' : ''));
      add.type = 'button'; add.setAttribute('role', 'radio'); add.setAttribute('aria-checked', st.addingMoto ? 'true' : 'false');
      add.append(el('span', 'pick-card-main', 'Agregar otra moto'));
      add.addEventListener('click', () => { st.addingMoto = true; st.motoId = ''; say('step2Msg', ''); renderMotoCards(); });
      box.append(add);
    }
    $('motoForm').hidden = !st.addingMoto;
    $('motoFormTitle').textContent = 'Datos de la otra moto';
  }

  /* Lee y valida los campos de la moto escrita a mano. */
  function readMoto() {
    let bad = false;
    let marca = $('moto_marca').value;
    $('moto_marca').classList.toggle('error', !marca);
    if (!marca) bad = true;
    if (marca === 'Otra') {
      const v = $('moto_marca_custom').value.trim();
      $('moto_marca_custom').classList.toggle('error', !v);
      if (!v) bad = true; else marca = v;
    }
    const modelo = $('moto_modelo').value.trim();
    $('moto_modelo').classList.toggle('error', !modelo);
    if (!modelo) bad = true;
    const anio = $('moto_anio').value.trim();
    const anioBad = !!anio && !/^\d{4}$/.test(anio);
    $('moto_anio').classList.toggle('error', anioBad);
    if (anioBad) bad = true;
    return { ok: !bad, marca, modelo, anio };
  }
  function validateStep2() {
    say('step2Msg', '');
    if (st.known) {
      if (!st.addingMoto && !st.motoId) { say('step2Msg', 'Toca la moto con la que vienes, o elige "Agregar otra moto".', true); return false; }
      if (st.addingMoto && !readMoto().ok) { say('step2Msg', 'Revisa los campos marcados en rojo.', true); return false; }
      return true;
    }
    const nombre = $('nombre').value.trim();
    $('nombre').classList.toggle('error', nombre.length < 3);
    const moto = readMoto();
    if (nombre.length < 3 || !moto.ok) { say('step2Msg', 'Revisa los campos marcados en rojo.', true); return false; }
    return true;
  }

  /* ── Paso 3: servicio ── */
  function serviceValue() {
    const v = $('tipo_servicio').value;
    return v === 'Otro' ? $('otro_servicio').value.trim() : v;
  }
  function validateStep3() {
    say('step3Msg', '');
    const sel = $('tipo_servicio').value;
    $('tipo_servicio').classList.toggle('error', !sel);
    const otroBad = sel === 'Otro' && !$('otro_servicio').value.trim();
    $('otro_servicio').classList.toggle('error', otroBad);
    if (!sel || otroBad) { say('step3Msg', sel ? 'Describe el servicio que necesitas.' : 'Elige el servicio que necesitas.', true); return false; }
    return true;
  }

  /* ── Paso 4: quién te atiende (lista que viene del taller; sin "cualquiera") ── */
  async function loadMechanics(force) {
    if (st.mechState === 'loading') return;
    if (st.mechs && !force) { renderMechs(); return; }
    st.mechState = 'loading'; renderMechs();
    try {
      const { res, data } = await fetchJson(API_BASE + '/mechanics');
      if (!res.ok || !Array.isArray(data)) throw new Error('http ' + res.status);
      st.mechs = data; st.mechState = 'ready';
      if (st.mechId && !data.some(m => m.id === st.mechId)) { st.mechId = ''; st.mechName = ''; }
    } catch (e) {
      st.mechs = null; st.mechState = 'error';
    }
    renderMechs();
  }
  function renderMechs() {
    const box = $('mechCards'); box.textContent = '';
    say('mechMsg', '');
    $('step4Next').disabled = false;
    if (st.mechState === 'loading') { box.append(el('p', 'hours-ph', 'Cargando…')); $('step4Next').disabled = true; return; }
    if (st.mechState === 'error') {
      box.append(el('p', 'hours-ph', 'No pudimos cargar la lista. Revisa tu internet e inténtalo de nuevo.'));
      const r = el('button', 'btn btn-outline-white retry', 'Reintentar'); r.type = 'button';
      r.addEventListener('click', () => loadMechanics(true));
      box.append(r); $('step4Next').disabled = true; return;
    }
    if (!st.mechs || st.mechs.length === 0) {
      box.append(el('p', 'hours-ph', 'Por ahora no hay personal disponible para citas en línea. Escríbenos por WhatsApp y te atendemos.'));
      const a = el('a', 'btn btn-wa retry', 'Escribir por WhatsApp');
      a.href = 'https://wa.me/' + WA_NUMBER; a.target = '_blank'; a.rel = 'noopener';
      box.append(a); $('step4Next').disabled = true; return;
    }
    st.mechs.forEach(m => {
      const on = st.mechId === m.id;
      const b = el('button', 'pick-card mech-card' + (on ? ' on' : ''));
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.append(el('span', 'mech-avatar', (m.nombre.trim().charAt(0) || '?').toUpperCase()));
      b.append(el('span', 'pick-card-main', m.nombre));
      b.addEventListener('click', () => {
        if (st.mechId !== m.id) { hora.value = ''; }
        st.mechId = m.id; st.mechName = m.nombre; say('mechMsg', ''); renderMechs();
      });
      box.append(b);
    });
  }
  function validateStep4() {
    if (!st.mechId) { say('mechMsg', 'Elige quién quieres que te atienda.', true); return false; }
    return true;
  }

  /* ── Paso 5: día y hora (horarios de la persona elegida) ── */
  const hours = $('hours');
  function renderWhenHelp() {
    $('whenHelp').textContent = st.mechName
      ? 'Estos son los horarios libres de ' + st.mechName + '. Elige el día y la hora.'
      : 'Elige el día y la hora. Solo se muestran los horarios libres.';
  }
  function hoursMsg(text, retry) {
    hora.value = '';
    hours.textContent = '';
    hours.append(el('p', 'hours-ph', text));
    if (retry) {
      const r = el('button', 'btn btn-outline-white retry', 'Reintentar'); r.type = 'button';
      r.addEventListener('click', loadAvailability);
      hours.append(r);
    }
  }
  function fillHours(slots) {
    const prev = hora.value;
    const keep = slots.find(s => s.hora === prev && s.available);
    hora.value = keep ? prev : '';
    hours.textContent = '';
    slots.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hour'; b.textContent = fmt(s.hora);
      b.setAttribute('role', 'radio');
      const on = hora.value === s.hora;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      if (on) b.classList.add('on');
      if (!s.available) { b.disabled = true; b.title = 'No disponible'; }
      else b.addEventListener('click', () => {
        hora.value = s.hora; hours.classList.remove('error'); say('step5Msg', '');
        hours.querySelectorAll('.hour').forEach(x => { const sel = x === b; x.classList.toggle('on', sel); x.setAttribute('aria-checked', sel ? 'true' : 'false'); });
      });
      hours.append(b);
    });
  }
  let reqId = 0;
  async function loadAvailability() {
    hint.hidden = true;
    if (!fecha.value) { hoursMsg('Primero elige el día'); return; }
    if (new Date(fecha.value + 'T12:00:00').getDay() === 0) {
      hoursMsg('Cerrado los domingos');
      hint.textContent = 'No atendemos domingos. Elige otro día.'; hint.hidden = false;
      return;
    }
    const id = ++reqId;
    hoursMsg('Buscando horarios…');
    try {
      const url = API_BASE + '/appointments/availability?fecha=' + encodeURIComponent(fecha.value) +
        (st.mechId ? '&mecanico_id=' + encodeURIComponent(st.mechId) : '');
      const { res, data } = await fetchJson(url);
      if (id !== reqId) return;
      if (res.status === 400 && st.mechId && /persona/i.test(data.error || '')) {
        hoursMsg('Esa persona ya no está disponible');
        hint.textContent = 'Regresa al paso anterior y elige a otra persona.'; hint.hidden = false;
        return;
      }
      if (!res.ok) throw new Error('http ' + res.status);
      if (data.closed) {
        hoursMsg('Sin servicio ese día');
        hint.textContent = data.reason || 'Ese día no hay servicio. Elige otro día.'; hint.hidden = false;
        return;
      }
      fillHours(data.slots);
      if (!data.slots.some(s => s.available)) {
        hint.textContent = 'Ese día ya no tiene horarios libres' + (st.mechName ? ' con ' + st.mechName : '') + '. Prueba con otro día.'; hint.hidden = false;
      }
    } catch (e) {
      if (id !== reqId) return;
      hoursMsg('No pudimos consultar los horarios.', true);
      hint.textContent = isNet(e) ? NET_MSG : 'Inténtalo de nuevo en un momento.'; hint.hidden = false;
    }
  }
  const cal = MPCalendar({ btn: $('fechaBtn'), txt: $('fechaTxt'), input: fecha, panel: $('cal'), onPick: () => { say('step5Msg', ''); loadAvailability(); } });
  function validateStep5() {
    say('step5Msg', '');
    $('fechaBtn').classList.toggle('error', !fecha.value);
    hours.classList.toggle('error', !!fecha.value && !hora.value);
    if (!fecha.value) { say('step5Msg', 'Elige el día de tu cita.', true); return false; }
    if (!hora.value) { say('step5Msg', 'Elige una hora disponible.', true); return false; }
    return true;
  }

  /* ── Paso 6: revisar ── */
  function motoText() {
    if (st.known && st.motoId && !st.addingMoto) {
      const m = st.known.motos.find(x => x.id === st.motoId);
      return m ? [m.marca, m.modelo, m.anio].filter(Boolean).join(' ') : '';
    }
    const marca = $('moto_marca').value === 'Otra' ? $('moto_marca_custom').value.trim() : $('moto_marca').value;
    return [marca, $('moto_modelo').value.trim(), $('moto_anio').value.trim()].filter(Boolean).join(' ');
  }
  function personName() { return st.known ? st.known.nombre : $('nombre').value.trim(); }
  function renderReview() {
    const rows = [
      ['WhatsApp', fmtTel(st.phone), 1],
      ['Nombre', personName(), st.known ? 1 : 2],
      ['Moto', motoText(), 2],
      ['Servicio', serviceValue(), 3],
      ['Te atiende', st.mechName, 4],
      ['Día', fecha.value ? fechaLarga(fecha.value) : '', 5],
      ['Hora', hora.value ? fmt(hora.value) : '', 5]
    ];
    const notas = $('notas').value.trim();
    if (notas) rows.push(['Detalle', notas.length > 120 ? notas.slice(0, 117) + '…' : notas, 3]);
    const dl = $('review'); dl.textContent = '';
    rows.forEach(r => {
      const row = el('div', 'review-row');
      row.append(el('dt', null, r[0]), el('dd', null, r[1] || '—'));
      const c = el('button', 'review-edit', 'Cambiar'); c.type = 'button';
      c.setAttribute('aria-label', 'Cambiar ' + r[0].toLowerCase());
      c.addEventListener('click', () => go(r[2]));
      row.append(c);
      dl.append(row);
    });
  }

  /* ── Botones Atrás / Continuar y Enter ── */
  function next() {
    const s = st.step;
    if (s === 1) return doLookup();
    if (s === 2 && validateStep2()) return go(3);
    if (s === 3 && validateStep3()) return go(4);
    if (s === 4 && validateStep4()) return go(5);
    if (s === 5 && validateStep5()) return go(6);
  }
  form.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', next));
  form.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => go(Math.max(1, st.step - 1))));
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (st.step === 6) sendRequest(); else next();
  });
  form.querySelectorAll('input,select,textarea').forEach(el2 =>
    el2.addEventListener('input', () => el2.classList.remove('error')));

  /* ── Enviar ── */
  async function sendRequest() {
    clearErr();
    // Defensa: si algo quedó incompleto, regresa al paso que falta.
    if (st.phone.length !== 10) return go(1);
    if (!validateStep2()) return go(2);
    if (!validateStep3()) return go(3);
    if (!validateStep4()) return go(4);
    if (!validateStep5()) return go(5);

    btn.disabled = true; txt.textContent = 'Enviando…';
    const payload = {
      telefono: st.phone, mecanico_id: st.mechId, nombre: personName(),
      tipo_servicio: serviceValue(), fecha: fecha.value, hora: hora.value, notas: $('notas').value.trim()
    };
    if (st.known && st.motoId && !st.addingMoto) payload.moto_id = st.motoId;
    else {
      const m = readMoto();
      payload.moto_marca = m.marca; payload.moto_modelo = m.modelo; payload.moto_anio = m.anio || null;
    }
    try {
      const { res, data } = await fetchJson(API_URL, { method: 'POST', body: payload });
      if (!res.ok) {
        if (res.status === 409) { go(5); say('step5Msg', data.error || 'Ese horario ya se ocupó. Elige otra hora.', true); return; }
        if (res.status === 400 && /persona|atiende/i.test(data.error || '')) {
          go(4); await loadMechanics(true); say('mechMsg', data.error, true); return;
        }
        showErr(data.error || 'No se pudo enviar (error ' + res.status + ').');
        btn.disabled = false; txt.textContent = 'Solicitar cita';
        return;
      }
      showSuccess(payload, data);
    } catch (ex) {
      showErr(isNet(ex) ? NET_MSG : 'No se pudo enviar. Inténtalo de nuevo.');
      btn.disabled = false; txt.textContent = 'Reintentar envío';
    }
  }

  function showSuccess(p, data) {
    $('okText').textContent = 'Te enviamos un mensaje por WhatsApp al ' + fmtTel(p.telefono) + ' y te avisaremos por ahí en cuanto revisen tu solicitud.';
    const rows = [['Día', fechaLarga(p.fecha)], ['Hora', fmt(p.hora)], ['Servicio', p.tipo_servicio], ['Moto', motoText()], ['Te atiende', data.mecanico || st.mechName]];
    const sum = $('okSum');
    sum.textContent = '';
    rows.forEach(([k, v]) => {
      if (!v) return;
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      sum.append(dt, dd);
    });
    const lk = $('okLink');
    if (lk) { lk.hidden = !data.link; if (data.link) lk.href = data.link; }
    form.hidden = true; ok.hidden = false;
    ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('againBtn').addEventListener('click', () => {
    form.reset();
    ['otroWrap', 'otraMarcaWrap'].forEach(id => { $(id).hidden = true; });
    st.phone = ''; st.known = null; st.motoId = ''; st.addingMoto = false; st.mechId = ''; st.mechName = '';
    $('knownBox').hidden = true; $('newBox').hidden = true; $('motoForm').hidden = true;
    say('lookupMsg', ''); say('step2Msg', ''); say('step3Msg', ''); say('step5Msg', ''); $('step1Skip').hidden = true;
    btn.disabled = false; txt.textContent = 'Solicitar cita';
    cal.clear(); hora.value = '';
    ok.hidden = true; form.hidden = false;
    go(1, true);
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  go(1, true);
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
  [initIntro, initPromo, initWaLinks, initNavbar, initReveal, initStats, initCountdown, initForm, initCanvas3D]
    .forEach(fn => { try { fn(); } catch (e) { console.error('[landing] ' + fn.name + ' fallo:', e); } });
});
