// Ajustes de impresión por taller (workspace.settings.print).
// Contrato: docs/IMPRESION-CONTRATO.md. Puro, sin base de datos → fácil de probar.

export const PRINT_DEFAULTS = Object.freeze({
    business_name: '',
    tagline: '',
    address: '',
    phone: '',
    footer: 'Gracias por su preferencia',
    warranty_enabled: true,
    warranty_days: 15,
    warranty_text: '',
    paper_cols: 48,
    accents: false,
    show_qr: true,
    show_mechanic: true,
    copies: 1,
});

const LIMITS = {
    business_name: 40,
    tagline: 48,
    address: 96,
    phone: 30,
    footer: 96,
    warranty_text: 300,
};

const clampInt = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Toma lo que llegue del panel y devuelve SOLO campos válidos y acotados.
 * Los campos ausentes no se tocan (parcial).
 */
export function sanitizePrintSettings(input = {}) {
    const out = {};
    for (const k of ['business_name', 'tagline', 'address', 'phone', 'footer']) {
        if (k in input) out[k] = str(input[k], LIMITS[k]);
    }
    if ('warranty_text' in input) {
        // Se permiten saltos de línea en el texto de garantía.
        out.warranty_text = String(input.warranty_text ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, LIMITS.warranty_text);
    }
    for (const k of ['warranty_enabled', 'accents', 'show_qr', 'show_mechanic']) {
        if (k in input) out[k] = input[k] === true || input[k] === 'true' || input[k] === 1;
    }
    if ('warranty_days' in input) out.warranty_days = clampInt(input.warranty_days, 0, 365, PRINT_DEFAULTS.warranty_days);
    if ('copies' in input) out.copies = clampInt(input.copies, 1, 3, 1);
    if ('paper_cols' in input) out.paper_cols = Number(input.paper_cols) === 32 ? 32 : 48;
    return out;
}

/** Ajustes efectivos: defaults + lo guardado + nombre del taller como respaldo. */
export function resolvePrintSettings(workspace) {
    const saved = (workspace?.settings && workspace.settings.print) || {};
    const merged = { ...PRINT_DEFAULTS, ...sanitizePrintSettings(saved) };
    if (!merged.business_name) merged.business_name = String(workspace?.name || 'Taller').slice(0, LIMITS.business_name);
    return merged;
}
