// Bucle principal del agente: pregunta a la API si hay tickets, los imprime y reporta el resultado.
//
// Reglas que este módulo garantiza:
//   • Nunca se cae: cualquier error se registra y el bucle sigue.
//   • Sin internet → espera creciente (pollMs × 2, × 4 … hasta maxBackoffMs) y vuelve a pollMs al recuperarse.
//   • 401 (clave inválida/revocada) → lo registra y reintenta cada authRetryMs.
//   • NUNCA imprime dos veces el mismo trabajo: recuerda los ids ya impresos, y si una copia falló a la
//     mitad, el reintento solo imprime las que faltan.
//   • Si falla el aviso de resultado al servidor, lo reintenta sin volver a imprimir.
import { friendlyPrintError } from './printers.js';

const MAX_COPIES = 10;
const MEMORY_LIMIT = 300; // ids recordados
const REPORT_MAX_AGE_MS = 30 * 60 * 1000;

function prune(map, limit) {
    while (map.size > limit) map.delete(map.keys().next().value);
}

export class Runner {
    /**
     * @param {object} deps
     * @param {object} deps.config   Config resuelta (pollMs, maxBackoffMs, authRetryMs, copyDelayMs)
     * @param {{poll: Function, reportResult: Function}} deps.api
     * @param {{label: string, print: Function}} deps.printer
     * @param {{info: Function, warn: Function, error: Function}} deps.log
     * @param {() => void} [deps.onTick]  Se llama en cada vuelta (el lock lo usa de latido)
     */
    constructor({ config, api, printer, log, onTick }) {
        this.config = config;
        this.api = api;
        this.printer = printer;
        this.log = log;
        this.onTick = onTick || (() => {});

        this.running = false;
        this.loopPromise = null;
        this.state = 'start'; // start | ok | offline | auth
        this.failures = 0;

        this.printedIds = new Map(); // id → true (solo trabajos impresos por completo)
        this.partial = new Map(); // id → copias ya impresas (para no repetirlas en un reintento)
        this.pendingReports = new Map(); // id → { ok, error, since }
        this.stats = { printed: 0, failed: 0, polls: 0 };

        this._wakeTimer = null;
        this._wakeResolve = null;
    }

    /* ------------------------------ control ------------------------------ */
    start() {
        if (this.loopPromise) return this.loopPromise;
        this.running = true;
        this.loopPromise = this.#loop().catch((e) => {
            // No debería pasar (el bucle atrapa todo), pero jamás dejamos que el proceso muera en silencio.
            this.log.error(`Error inesperado en el agente: ${e?.stack || e}`);
        });
        return this.loopPromise;
    }

    /** Detiene el bucle (termina el ticket en curso, si hay uno). */
    async stop() {
        this.running = false;
        this._cancelWait();
        if (this.loopPromise) await this.loopPromise;
    }

    #wait(ms) {
        return new Promise((resolve) => {
            this._wakeResolve = resolve;
            this._wakeTimer = setTimeout(() => {
                this._wakeTimer = null;
                this._wakeResolve = null;
                resolve();
            }, ms);
        });
    }

    _cancelWait() {
        if (this._wakeTimer) clearTimeout(this._wakeTimer);
        this._wakeTimer = null;
        if (this._wakeResolve) this._wakeResolve();
        this._wakeResolve = null;
    }

    /* ------------------------------- bucle ------------------------------- */
    async #loop() {
        this.log.info(`Agente iniciado. Impresora: ${this.printer.label}. Consultando cada ${this.config.pollMs / 1000} s.`);
        while (this.running) {
            let delay = this.config.pollMs;
            try {
                this.onTick();
                await this.flushReports();

                this.stats.polls++;
                const { job } = await this.api.poll(this.printer.label);
                this.#markOnline();

                if (job) {
                    await this.handleJob(job);
                    delay = Math.min(300, this.config.pollMs); // hay más en cola: no esperes 3 s
                }
            } catch (e) {
                delay = this.#onPollError(e);
            }
            if (this.running) await this.#wait(delay);
        }
        // Último intento de avisar resultados pendientes antes de salir.
        try {
            await this.flushReports();
        } catch {
            /* ignorar */
        }
        this.log.info('Agente detenido.');
    }

    #markOnline() {
        if (this.state === 'offline' || this.state === 'auth') this.log.info('Conexión con MotoPartes restablecida.');
        else if (this.state === 'start') this.log.info('Conectado con MotoPartes.');
        this.state = 'ok';
        this.failures = 0;
    }

    #onPollError(e) {
        if (e?.kind === 'auth') {
            this.state = 'auth';
            this.log.error(
                'Clave inválida o revocada. Genera una clave nueva en MotoPartes → Impresión y vuelve a ejecutar INSTALAR.bat. ' +
                    `Reintentando en ${Math.round(this.config.authRetryMs / 1000)} s.`
            );
            return this.config.authRetryMs;
        }
        this.state = 'offline';
        this.failures++;
        const wait = Math.min(this.config.maxBackoffMs, this.config.pollMs * 2 ** this.failures);
        this.log.warn(`Sin conexión con MotoPartes (${e?.message || e}). Reintentando en ${Math.round(wait / 100) / 10} s.`);
        return wait;
    }

    /* ------------------------------ trabajos ----------------------------- */
    async handleJob(job) {
        const id = String(job.id);
        const title = job.title || id;

        // Ya lo imprimimos (el servidor lo volvió a entregar porque no le llegó el resultado): solo reportar.
        if (this.printedIds.has(id)) {
            this.log.info(`El trabajo ${title} ya estaba impreso; solo confirmo al servidor.`);
            this.#queueReport(id, { ok: true });
            await this.flushReports();
            return;
        }

        const data = Buffer.from(String(job.payload_b64 || ''), 'base64');
        if (data.length === 0) {
            this.log.error(`El trabajo ${title} no trae datos para imprimir.`);
            this.stats.failed++;
            this.#queueReport(id, { ok: false, error: 'El trabajo no trae datos para imprimir' });
            await this.flushReports();
            return;
        }

        const copies = Math.max(1, Math.min(MAX_COPIES, parseInt(job.copies, 10) || 1));
        let done = this.partial.get(id) || 0;

        try {
            while (done < copies) {
                if (done > 0 && this.config.copyDelayMs > 0) await new Promise((r) => setTimeout(r, this.config.copyDelayMs));
                this.onTick();
                await this.printer.print(data);
                done++;
                this.partial.set(id, done);
            }
        } catch (e) {
            const msg = friendlyPrintError(e);
            this.stats.failed++;
            this.log.error(`No se pudo imprimir ${title} (copia ${done + 1} de ${copies}): ${msg}${e?.message && e.message !== msg ? ` [${e.message}]` : ''}`);
            prune(this.partial, MEMORY_LIMIT);
            this.#queueReport(id, { ok: false, error: msg });
            await this.flushReports();
            return;
        }

        this.partial.delete(id);
        this.printedIds.set(id, true);
        prune(this.printedIds, MEMORY_LIMIT);
        this.stats.printed++;
        this.log.info(`Impreso: ${title} (${copies} ${copies === 1 ? 'copia' : 'copias'}).`);
        this.#queueReport(id, { ok: true });
        await this.flushReports();
    }

    #queueReport(id, result) {
        this.pendingReports.set(id, { ...result, since: Date.now() });
    }

    /** Avisa al servidor los resultados pendientes. Los que fallen por red se reintentan en la próxima vuelta. */
    async flushReports() {
        for (const [id, r] of [...this.pendingReports]) {
            try {
                await this.api.reportResult(id, r.ok, r.error);
                this.pendingReports.delete(id);
            } catch (e) {
                const permanent = e?.kind === 'http' && e.status >= 400 && e.status < 500;
                const tooOld = Date.now() - r.since > REPORT_MAX_AGE_MS;
                if (permanent || tooOld) {
                    this.log.warn(`No se pudo confirmar el trabajo ${id} al servidor (${e?.message}); lo descarto.`);
                    this.pendingReports.delete(id);
                } else {
                    this.log.warn(`No se pudo avisar el resultado del trabajo ${id} (${e?.message}); reintento en la siguiente vuelta.`);
                    return; // sin conexión: no insistir con los demás ahora
                }
            }
        }
    }
}
