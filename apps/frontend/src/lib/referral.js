// Captura y persiste el parámetro `?ref=<slug>` que trae un visitante en
// cualquier ruta pública. Lo guardamos 30 días en localStorage para que al
// registrarse (posiblemente minutos u horas después) podamos atribuir el
// referral. Fase 6.2 lo consumirá desde el backend para crear la fila
// Referral; por ahora solo lo persistimos y lo adjuntamos al payload de
// /auth/register (el backend lo guarda en workspace.settings.referral_source).

const STORAGE_KEY = 'mp_ref';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

// Regex conservadora: 2-40 chars, letras/números/guion. Evita inyección de
// basura rara como `<script>` o paths con `/`.
const VALID_SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/i;

export function captureReferralFromUrl() {
    if (typeof window === 'undefined') return null;
    try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('ref');
        if (!raw) return null;
        const slug = String(raw).trim().toLowerCase();
        if (!VALID_SLUG.test(slug)) return null;

        const record = { slug, captured_at: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        return slug;
    } catch {
        return null;
    }
}

export function getStoredReferral() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.slug || !parsed?.captured_at) return null;
        if (Date.now() - parsed.captured_at > TTL_MS) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed.slug;
    } catch {
        return null;
    }
}

export function clearStoredReferral() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
