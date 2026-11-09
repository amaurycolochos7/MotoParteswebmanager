// Actualización automática de la app: cada versión publicada trae un /version.json con su id de compilación.
// Si el id del servidor ya no es el de esta pestaña, se recarga sola (así nadie se queda con una versión vieja).
// No interrumpe: espera si la persona está escribiendo, grabando una nota de voz o viendo la vista previa de un archivo.
/* global __BUILD_ID__ */
const CHECK_EVERY_MS = 2 * 60 * 1000;
const MIN_BETWEEN_RELOADS_MS = 60 * 1000;
const KEY = 'motopartes_last_update_reload';

const busy = () => {
  const el = document.activeElement;
  const typing = el && (el.isContentEditable || ((el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && String(el.value || '').trim() !== ''));
  return !!typing || !!document.querySelector('.ib-modal, .ib-rec');
};

async function check() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { id } = await res.json();
    if (!id || id === __BUILD_ID__ || busy()) return;
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < MIN_BETWEEN_RELOADS_MS) return; // evita bucles si algo sirve una versión vieja
    sessionStorage.setItem(KEY, String(Date.now()));
    // Que el service worker y la caché del navegador no devuelvan la versión anterior
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map((r) => r.update().catch(() => {})));
      const names = await caches?.keys?.();
      await Promise.all((names || []).map((n) => caches.delete(n)));
    } catch { /* sin service worker o sin caché: se recarga igual */ }
    window.location.reload();
  } catch { /* sin red: se vuelve a intentar */ }
}

export function startUpdateCheck() {
  if (import.meta.env.DEV || typeof __BUILD_ID__ === 'undefined') return;
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('focus', check);
  check();
}
