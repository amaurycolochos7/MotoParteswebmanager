// ============================================================================
// Cliente API del módulo MotoPartes Questions.
// Token propio (motopartes_questions_token), aislado del auth principal.
// NO redirige a /login en 401 (este módulo vive fuera del flujo normal).
// ============================================================================

const API_BASE = (import.meta.env.VITE_API_URL || '/api') + '/questions';
const TOKEN_KEY = 'motopartes_questions_token';

export function getQToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setQToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
export function clearQAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('motopartes_questions_role');
}

async function qfetch(path, options = {}) {
  const token = getQToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Error ${res.status}` }));
    const e = new Error(err.error || `Error ${res.status}`);
    e.status = res.status;
    e.payload = err;
    throw e;
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export const questionsApi = {
  auth: (pin) => qfetch('/auth', { method: 'POST', body: JSON.stringify({ pin }) }),
  getForm: () => qfetch('/form'),
  getMe: () => qfetch('/me'),
  saveAnswers: (answers) => qfetch('/answers', { method: 'PUT', body: JSON.stringify({ answers }) }),
  submit: () => qfetch('/submit', { method: 'POST', body: '{}' }),
  adminSummary: () => qfetch('/admin/summary'),
  adminResponses: (key) => qfetch(`/admin/responses/${key}`),
  adminCompare: () => qfetch('/admin/compare'),
  adminUnlock: (key, reason) => qfetch(`/admin/unlock/${key}`, { method: 'POST', body: JSON.stringify({ reason: reason || null }) }),
  // Descarga un export como archivo respetando el token de autorización.
  async download(format) {
    const token = getQToken();
    const res = await fetch(`${API_BASE}/admin/export?format=${encodeURIComponent(format)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Error ${res.status} al exportar`);
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    const filename = m ? m[1] : `motopartes-questions.${format}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export default questionsApi;
