// Cliente de la API de MotoPartes para el agente (ver docs/IMPRESION-CONTRATO.md)
//
//   GET  /api/print-agent/poll?version=&printer=   → { job: null | {...} }
//   POST /api/print-agent/jobs/:id/result          → { ok: true }
//
// Autenticación: header x-print-key (sin JWT).

export class ApiError extends Error {
    /**
     * @param {string} message
     * @param {{kind: 'auth'|'network'|'http', status?: number}} info
     *   auth    = 401 (clave inválida o revocada)
     *   network = no hubo respuesta (sin internet, servidor caído, tiempo agotado)
     *   http    = el servidor respondió con un error (4xx/5xx) o con algo que no es JSON
     */
    constructor(message, { kind, status } = {}) {
        super(message);
        this.name = 'ApiError';
        this.kind = kind || 'network';
        this.status = status;
    }
}

function networkMessage(e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'tiempo de espera agotado';
    const code = e?.cause?.code || e?.code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'no se encontró el servidor (¿hay internet?)';
    if (code === 'ECONNREFUSED') return 'el servidor rechazó la conexión';
    if (code === 'ECONNRESET' || e?.message === 'terminated') return 'se cortó la conexión';
    return code || e?.message || 'error de red';
}

/**
 * @param {object} opts
 * @param {string} opts.apiUrl      Base sin "/api" (ej. https://motopartes.cloud)
 * @param {string} opts.key         Clave del agente (mpp_…)
 * @param {string} [opts.version]   Versión del agente (se manda en cada latido)
 * @param {number} [opts.timeoutMs]
 * @param {typeof fetch} [opts.fetchImpl]
 */
export function createApiClient({ apiUrl, key, version = '0.0.0', timeoutMs = 15000, fetchImpl = fetch }) {
    const base = String(apiUrl).replace(/\/+$/, '');

    async function request(method, pathAndQuery, body) {
        let res;
        try {
            res = await fetchImpl(base + pathAndQuery, {
                method,
                headers: {
                    'x-print-key': key,
                    accept: 'application/json',
                    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (e) {
            throw new ApiError(networkMessage(e), { kind: 'network' });
        }

        let text = '';
        try {
            text = await res.text();
        } catch (e) {
            throw new ApiError(networkMessage(e), { kind: 'network' });
        }
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = null;
        }

        if (res.status === 401) {
            throw new ApiError(data?.error || 'Clave inválida o revocada', { kind: 'auth', status: 401 });
        }
        if (!res.ok) {
            throw new ApiError(data?.error ? `${data.error} (HTTP ${res.status})` : `HTTP ${res.status}`, {
                kind: 'http',
                status: res.status,
            });
        }
        if (data === null || typeof data !== 'object') {
            throw new ApiError('respuesta inesperada del servidor', { kind: 'http', status: res.status });
        }
        return data;
    }

    return {
        /** Comprueba que la clave sea válida (sin reclamar trabajos). Lanza ApiError si no. */
        async ping() {
            return request('GET', '/api/print-agent/ping');
        },

        /** Latido + reclama el siguiente trabajo. Devuelve { job } (job puede ser null). */
        async poll(printer = '') {
            const q = new URLSearchParams({ version, printer: String(printer || '') });
            const data = await request('GET', `/api/print-agent/poll?${q}`);
            return { job: data.job || null };
        },

        /** Informa el resultado de un trabajo. */
        async reportResult(jobId, ok, error) {
            const body = ok ? { ok: true } : { ok: false, error: String(error || 'Error desconocido').slice(0, 300) };
            return request('POST', `/api/print-agent/jobs/${encodeURIComponent(jobId)}/result`, body);
        },
    };
}
