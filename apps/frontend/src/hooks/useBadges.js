import { useEffect, useRef, useState } from 'react';
import { appointmentsService, inboxService } from '../lib/api';

// Aviso sonoro corto cuando sube el numero de pendientes (el navegador lo bloquea hasta la primera interaccion).
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq, at, dur) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + dur + 0.05);
    };
    play(880, 0, 0.18);
    play(1175, 0.2, 0.3);
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch { /* sin audio */ }
}

/**
 * Contadores del panel.
 * - `appts` (campanita): citas por revisar. Mecanico/maestro/auxiliar: solo SUS citas (`mine`). Gerencia: todas (`count`).
 * - `unread` (solo insignia junto a "Conversaciones" del menu): mensajes sin leer, si el usuario puede ver la bandeja.
 */
export function useBadges({ userId, isManager, canViewInbox }) {
  const [state, setState] = useState({ appts: 0, unread: 0 });
  const last = useRef({ appts: null, unread: null });

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;

    const load = async () => {
      if (document.hidden) return;
      let appts = null;
      let unread = null;
      try {
        const r = await appointmentsService.attentionCount();
        appts = isManager ? (r.count ?? 0) : (r.mine ?? r.count ?? 0);
      } catch { /* sin red o sin taller activo */ }
      if (canViewInbox) {
        try { unread = (await inboxService.unreadCount()).count ?? 0; } catch { /* aun sin API de bandeja */ }
      }
      if (!alive) return;
      const prev = last.current;
      // Solo las citas por revisar hacen sonar el aviso; los mensajes solo suman al contador del menú.
      if (prev.appts !== null && appts !== null && appts > prev.appts) beep();
      last.current = { appts: appts ?? prev.appts, unread: unread ?? prev.unread };
      setState((s) => ({ appts: appts ?? s.appts, unread: unread ?? s.unread }));
    };

    load();
    const timer = setInterval(load, 8000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [userId, isManager, canViewInbox]);

  return state;
}
