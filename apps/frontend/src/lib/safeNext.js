// Regreso despues del login: solo rutas INTERNAS de la app, nunca otra pagina.
// Se usa en ProtectedRoute (guarda a donde iba), Login y App (redirige despues de entrar).

/** Devuelve la ruta (con query) si es segura; si no, null. */
export function safeNextPath(raw) {
    if (typeof raw !== 'string') return null;
    const v = raw.trim();
    if (!v.startsWith('/')) return null;                        // nada de https://..., javascript:, etc.
    if (v.startsWith('//') || v.startsWith('/\\')) return null; // //evil.com
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(v)) return null;           // saltos de linea y control
    if (/^\/(login|signup|onboarding)(\/|\?|#|$)/.test(v)) return null; // evita bucles
    return v.length > 500 ? null : v;
}

/** Lee ?next= de una cadena de query ("?next=/mechanic/appointments%3Fcita%3D1"). */
export function nextFromSearch(search) {
    try {
        return safeNextPath(new URLSearchParams(search || '').get('next'));
    } catch {
        return null;
    }
}

/** URL del login que recuerda a donde volver. */
export function loginUrlFor(pathWithSearch) {
    const next = safeNextPath(pathWithSearch);
    return next ? `/login?next=${encodeURIComponent(next)}` : '/login';
}
