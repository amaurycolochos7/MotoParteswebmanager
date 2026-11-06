/* Calendario propio compartido (formulario de la landing y pagina /cita/<codigo>). */
(function () {
  var MAX_DIAS = 120;
  function isoLocal(d) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  /* Calendario propio (el selector nativo falla en varios moviles).
     Dias validos: de mañana a MAX_DIAS, sin domingos. */
  function buildCalendar({ btn, txt, input, panel, onPick }) {
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
    const base = new Date(); base.setHours(12, 0, 0, 0);
    const min = new Date(base); min.setDate(min.getDate() + 1);
    const max = new Date(base); max.setDate(max.getDate() + MAX_DIAS);
    const minIso = isoLocal(min), maxIso = isoLocal(max);
    let view = new Date(min.getFullYear(), min.getMonth(), 1);
  
    function label(iso) {
      const s = new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function isOpen() { return !panel.hidden; }
    function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    function open() {
      if (input.value) { const [y, m] = input.value.split('-'); view = new Date(+y, +m - 1, 1); }
      render(); panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
      panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function pick(iso) {
      input.value = iso;
      txt.textContent = label(iso); txt.classList.remove('pick-ph');
      btn.classList.remove('error');
      close(); onPick(iso);
    }
    function clear() {
      input.value = ''; txt.textContent = 'Toca para elegir el día'; txt.classList.add('pick-ph'); close();
    }
  
    function render() {
      const y = view.getFullYear(), m = view.getMonth();
      const prevOk = isoLocal(new Date(y, m, 0)) >= minIso;           // ultimo dia del mes anterior
      const nextOk = isoLocal(new Date(y, m + 1, 1)) <= maxIso;       // primer dia del mes siguiente
      panel.textContent = '';
      const head = document.createElement('div'); head.className = 'cal-head';
      const nav = (txtc, aria, ok, dir) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'cal-nav';
        b.textContent = txtc; b.setAttribute('aria-label', aria); b.disabled = !ok;
        b.addEventListener('click', () => { view = new Date(y, m + dir, 1); render(); });
        return b;
      };
      const title = document.createElement('div'); title.className = 'cal-title';
      title.textContent = MESES[m] + ' ' + y;
      head.append(nav('‹', 'Mes anterior', prevOk, -1), title, nav('›', 'Mes siguiente', nextOk, 1));
      panel.append(head);
  
      const grid = document.createElement('div'); grid.className = 'cal-grid';
      DIAS.forEach(d => { const s = document.createElement('span'); s.className = 'cal-dow'; s.textContent = d; grid.append(s); });
      const lead = (new Date(y, m, 1).getDay() + 6) % 7;                // semana empieza en lunes
      for (let i = 0; i < lead; i++) grid.append(document.createElement('span'));
      const total = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= total; d++) {
        const dt = new Date(y, m, d, 12), iso = isoLocal(dt);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'cal-day';
        b.textContent = d;
        const off = iso < minIso || iso > maxIso || dt.getDay() === 0;
        b.disabled = off;
        if (iso === input.value) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
        if (!off) b.addEventListener('click', () => pick(iso));
        grid.append(b);
      }
      panel.append(grid);
      const note = document.createElement('p'); note.className = 'cal-note';
      note.textContent = 'Atendemos de lunes a sábado.';
      panel.append(note);
    }
  
    btn.addEventListener('click', () => (isOpen() ? close() : open()));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { close(); btn.focus(); } });
    document.addEventListener('click', e => { if (isOpen() && !panel.contains(e.target) && !btn.contains(e.target)) close(); });
    return { clear };
  }
  window.MPCalendar = buildCalendar;
})();
