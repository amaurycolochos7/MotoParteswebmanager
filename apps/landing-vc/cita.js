/* ═══════════════════════════════════════════════════
   MOTOPARTES — página del enlace único de la cita
   /cita/<código>: estado, aceptar propuesta, elegir otro día, cancelar.
═══════════════════════════════════════════════════ */
(function () {
  'use strict';
  var API = 'https://motopartes.cloud/api/public/appointments';
  var TOKEN = decodeURIComponent(location.pathname.replace(/\/+$/, '').split('/').pop() || '');
  var $ = function (id) { return document.getElementById(id); };
  var view = null, chosen = null, busy = false;

  var CHIP = {
    pending_external: ['En revisión', 'wait'], proposal_sent: ['Propuesta del taller', 'info'],
    confirmed: ['Confirmada', 'ok'], rejected: ['Sin disponibilidad', 'bad'], expired: ['Propuesta vencida', 'bad'],
    cancelled: ['Cancelada', 'bad'], completed: ['Completada', 'ok'], scheduled: ['Agendada', 'ok']
  };

  function fmtHora(h) { var n = +h.slice(0, 2); return ((n % 12) || 12) + h.slice(2) + (n < 12 ? ' am' : ' pm'); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function say(text, bad) { var m = $('cpMsg'); m.textContent = text || ''; m.hidden = !text; m.className = 'cp-msg' + (bad ? ' cp-msg-bad' : ''); }

  async function api(path, method, body) {
    var res = await fetch(API + '/by-token/' + encodeURIComponent(TOKEN) + path, {
      method: method || 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) { var e = new Error(data.error || 'Error ' + res.status); e.status = res.status; e.data = data; throw e; }
    return data;
  }

  // ── Render segun el estado ────────────────────────────
  function render(v) {
    view = v;
    $('cpLoading').hidden = true; $('cpError').hidden = true; $('cpCard').hidden = false;
    var chip = CHIP[v.status] || [v.status, 'wait'];
    $('cpChip').textContent = chip[0]; $('cpChip').className = 'cp-chip cp-chip-' + chip[1];

    var T = { title: '', lead: '' };
    var actions = [];
    var showProposal = false;
    var s = v.status;

    if (s === 'pending_external') {
      T.title = 'Tu solicitud está en revisión';
      T.lead = 'Hola ' + v.nombre + ', ya recibimos tu solicitud. Te avisaremos por WhatsApp en cuanto la revisemos para confirmarla o proponerte otro horario. No necesitas hacer nada más.';
      actions = [['Cambiar fecha', 'ghost', openPicker], ['Cancelar solicitud', 'link', cancelAppt]];
    } else if (s === 'proposal_sent' && v.proposal) {
      showProposal = true;
      T.title = v.proposal.from_confirmed ? 'Necesitamos mover tu cita' : 'Te proponemos otra fecha';
      T.lead = 'Hola ' + v.nombre + ', ' + (v.proposal.from_confirmed
        ? 'el taller necesita cambiar tu cita. Si aceptas, la nueva fecha queda confirmada al instante; si no, tu cita original se mantiene.'
        : 'revisamos tu solicitud y te proponemos esta fecha. Si la aceptas, tu cita queda confirmada al instante.');
      actions = [['Aceptar ' + cap(v.proposal.fecha_texto), 'red', acceptProposal], ['Elegir otro día', 'ghost', openPicker], [v.proposal.from_confirmed ? 'Mantener mi cita original' : 'No me sirve', 'link', declineProposal]];
    } else if (s === 'confirmed' || s === 'scheduled') {
      T.title = '¡Tu cita está confirmada!';
      T.lead = 'Hola ' + v.nombre + ', te esperamos en MOTOPARTES. Guarda este enlace por si necesitas cambiar o cancelar tu cita.';
      actions = [['Reprogramar', 'ghost', openPicker], ['Cancelar cita', 'link', cancelAppt]];
    } else if (s === 'rejected') {
      T.title = 'Esa fecha no está disponible';
      T.lead = 'Hola ' + v.nombre + ', por el momento no podemos atender tu solicitud para esa fecha.' + (v.decision_note ? ' ' + v.decision_note : '') + ' Elige otra y la revisamos de inmediato.';
      actions = [['Elegir otra fecha', 'red', openPicker]];
    } else if (s === 'expired') {
      T.title = 'La propuesta venció';
      T.lead = 'Hola ' + v.nombre + ', la propuesta de cita ya no está vigente y liberamos el horario. Si aún quieres agendar, elige una nueva fecha.';
      actions = [['Elegir una fecha', 'red', openPicker]];
    } else if (s === 'cancelled') {
      T.title = 'Cita cancelada';
      T.lead = (v.cancelled_by === 'shop' ? 'El taller tuvo que cancelar esta cita.' : 'Esta cita fue cancelada.') + (v.decision_note ? ' ' + v.decision_note : '') + ' Cuando quieras puedes agendar otra.';
      actions = [['Agendar una nueva cita', 'red', function () { location.href = '/#citas'; }]];
    } else {
      T.title = 'Cita completada'; T.lead = '¡Gracias por visitarnos, ' + v.nombre + '! Cuando quieras puedes agendar otra cita.';
      actions = [['Agendar una cita', 'red', function () { location.href = '/#citas'; }]];
    }
    $('cpTitle').textContent = T.title; $('cpLead').textContent = T.lead;

    // Propuesta
    $('cpProposal').hidden = !showProposal;
    if (showProposal) {
      $('cpPropDate').textContent = cap(v.proposal.fecha_texto); $('cpPropTime').textContent = v.proposal.hora_texto;
      $('cpPropNote').hidden = !v.proposal.note; $('cpPropNote').textContent = v.proposal.note || '';
      $('cpPropVence').textContent = 'Tu horario queda apartado hasta el ' + v.proposal.expires_texto + '.';
    }

    // Resumen
    var sum = $('cpSum'); sum.textContent = '';
    var rows = [[showProposal && v.proposal.from_confirmed ? 'Cita actual' : (showProposal ? 'Fecha que pediste' : 'Fecha'), cap(v.fecha_texto)], ['Hora', v.hora_texto], ['Servicio', v.servicio], ['Moto', v.moto]];
    if (s === 'confirmed' || s === 'scheduled') rows.push(['Lugar', 'Venustiano Carranza, Chiapas']);
    rows.forEach(function (r) { if (!r[1]) return; sum.appendChild(el('dt', null, r[0])); sum.appendChild(el('dd', null, r[1])); });

    // Botones
    var box = $('cpActions'); box.textContent = '';
    actions.forEach(function (a) {
      var b = el('button', a[1] === 'red' ? 'btn btn-red' : a[1] === 'ghost' ? 'btn btn-outline-white' : 'cp-link', a[0]);
      b.type = 'button'; b.addEventListener('click', a[2]); box.appendChild(b);
    });
    if (s === 'confirmed' || s === 'scheduled') {
      var map = el('a', 'cp-link', 'Cómo llegar'); map.href = v.maps; map.target = '_blank'; map.rel = 'noopener'; box.appendChild(map);
      var ics = el('a', 'cp-link', 'Agregar al calendario'); ics.href = icsUrl(v); ics.download = 'cita-motopartes.ics'; box.appendChild(ics);
    }
    $('cpPicker').hidden = true; $('cpActions').hidden = false;
  }

  function icsUrl(v) {
    var d = new Date(v.scheduled_iso), end = new Date(d.getTime() + 3600 * 1000);
    var f = function (x) { return x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    var txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MOTOPARTES//Cita//ES', 'BEGIN:VEVENT',
      'UID:' + TOKEN + '@motopartes.cloud', 'DTSTAMP:' + f(new Date()), 'DTSTART:' + f(d), 'DTEND:' + f(end),
      'SUMMARY:Cita en MOTOPARTES' + (v.servicio ? ' — ' + v.servicio : ''), 'LOCATION:Venustiano Carranza\\, Chiapas',
      'DESCRIPTION:' + (v.moto ? 'Moto: ' + v.moto + '\\n' : '') + 'Cambios: ' + location.href, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(txt);
  }

  // ── Acciones ──────────────────────────────────────────
  async function act(path, okText) {
    if (busy) return; busy = true; say('');
    document.querySelectorAll('#cpActions button').forEach(function (b) { b.disabled = true; });
    try {
      var v = await api(path, 'POST', arguments[2]);
      render(v); if (okText) say(okText);
    } catch (e) {
      if (e.data && e.data.view) render(e.data.view);
      say(e.message, true);
      document.querySelectorAll('#cpActions button').forEach(function (b) { b.disabled = false; });
    } finally { busy = false; }
  }
  function acceptProposal() { act('/accept', '¡Listo! Tu cita quedó confirmada. Te enviamos los datos por WhatsApp.'); }
  function declineProposal() {
    var keep = view && view.proposal && view.proposal.from_confirmed;
    if (!confirm(keep ? '¿Mantener tu cita original?' : '¿Seguro que esta propuesta no te sirve? Se cancelará la solicitud.')) return;
    act('/decline', keep ? 'Tu cita original se mantiene.' : 'Cancelamos la solicitud. Cuando quieras puedes agendar otra.');
  }
  function cancelAppt() {
    if (!confirm('¿Seguro que quieres cancelar tu cita?')) return;
    act('/cancel', 'Tu cita fue cancelada.');
  }

  // ── Elegir otra fecha ─────────────────────────────────
  function isoLocal(d) { var p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  var dateCal = null;
  function openPicker() {
    say(''); chosen = null; $('cpSend').disabled = true;
    if (dateCal) dateCal.clear(); else $('cpDate').value = '';
    $('cpSlots').textContent = ''; $('cpPickHint').hidden = true;
    $('cpPicker').hidden = false; $('cpActions').hidden = true;
    $('cpPicker').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  var slotReq = 0;
  async function loadSlots() {
    var f = $('cpDate').value; chosen = null; $('cpSend').disabled = true; $('cpSlots').textContent = ''; $('cpPickHint').hidden = true;
    if (!f) return;
    var id = ++slotReq;
    try {
      var r = await fetch(API + '/availability?fecha=' + encodeURIComponent(f) + '&token=' + encodeURIComponent(TOKEN));
      var data = await r.json(); if (id !== slotReq) return;
      if (data.closed) { $('cpPickHint').textContent = data.reason || 'Ese día no hay servicio.'; $('cpPickHint').hidden = false; return; }
      var any = false;
      data.slots.forEach(function (s) {
        var b = el('button', 'cp-slot', fmtHora(s.hora)); b.type = 'button'; b.disabled = !s.available; if (s.available) any = true;
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
        b.addEventListener('click', function () {
          document.querySelectorAll('.cp-slot').forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
          b.classList.add('on'); b.setAttribute('aria-checked', 'true'); chosen = s.hora; $('cpSend').disabled = false;
        });
        $('cpSlots').appendChild(b);
      });
      if (!any) { $('cpPickHint').textContent = 'Ese día ya no tiene horarios libres. Prueba con otra fecha.'; $('cpPickHint').hidden = false; }
    } catch (e) { $('cpPickHint').textContent = 'No pudimos consultar los horarios. Intenta de nuevo.'; $('cpPickHint').hidden = false; }
  }

  // ── Arranque ──────────────────────────────────────────
  async function load(silent) {
    try { render(await api('')); }
    catch (e) {
      if (silent) return;
      $('cpLoading').hidden = true; $('cpCard').hidden = true; $('cpError').hidden = false;
      if (e.status && e.status !== 404) $('cpErrText').textContent = e.message;
    }
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (window.MPCalendar) dateCal = MPCalendar({ btn: $('cpDateBtn'), txt: $('cpDateTxt'), input: $('cpDate'), panel: $('cpCal'), onPick: loadSlots });
    $('cpPickCancel').addEventListener('click', function () { $('cpPicker').hidden = true; $('cpActions').hidden = false; });
    $('cpSend').addEventListener('click', function () {
      if (!chosen) return;
      act('/choose', 'Recibimos tu nueva fecha. Te confirmamos por WhatsApp.', { fecha: $('cpDate').value, hora: chosen });
    });
    load(false);
    // Si el taller responde mientras tienes la pagina abierta, se actualiza sola.
    setInterval(function () { if (!busy && $('cpPicker').hidden && !document.hidden) load(true); }, 20000);
  });
})();
