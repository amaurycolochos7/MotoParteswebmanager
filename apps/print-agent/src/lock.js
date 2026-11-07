// Instancia única: archivo agent.lock con el PID. Se considera "viejo" si el proceso ya no
// existe o si nadie lo actualizó en los últimos 2 minutos (por si Windows reutilizó el PID).
import fs from 'node:fs';

const STALE_MS = 120_000;

function pidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e.code === 'EPERM'; // existe pero es de otro usuario
    }
}

export class AlreadyRunningError extends Error {
    constructor(pid) {
        super(`Ya hay un agente de impresión ejecutándose (PID ${pid}).`);
        this.name = 'AlreadyRunningError';
        this.pid = pid;
    }
}

/** @returns {{ touch(): void, release(): void }} */
export function acquireLock(file, { staleMs = STALE_MS } = {}) {
    if (fs.existsSync(file)) {
        let pid = NaN;
        let mtime = 0;
        try {
            pid = parseInt(fs.readFileSync(file, 'utf8'), 10);
            mtime = fs.statSync(file).mtimeMs;
        } catch {
            /* lock ilegible → se reemplaza */
        }
        const fresh = Date.now() - mtime < staleMs;
        if (Number.isFinite(pid) && pid !== process.pid && pidAlive(pid) && fresh) {
            throw new AlreadyRunningError(pid);
        }
    }
    fs.writeFileSync(file, String(process.pid));

    return {
        touch() {
            try {
                const now = new Date();
                fs.utimesSync(file, now, now);
            } catch {
                /* ignorar */
            }
        },
        release() {
            try {
                if (parseInt(fs.readFileSync(file, 'utf8'), 10) === process.pid) fs.unlinkSync(file);
            } catch {
                /* ignorar */
            }
        },
    };
}
