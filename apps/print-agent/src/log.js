// Log a archivo (con rotación simple) y a consola. Nunca lanza errores:
// si no se puede escribir el archivo, el agente sigue funcionando.
import fs from 'node:fs';
import path from 'node:path';

function pad(n, len = 2) {
    return String(n).padStart(len, '0');
}

export function formatStamp(d) {
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
}

/**
 * @param {object} opts
 * @param {string} [opts.dir]       Carpeta de logs (si falta, solo consola).
 * @param {string} [opts.file]      Nombre del archivo (agente.log).
 * @param {number} [opts.maxBytes]  Tamaño máximo antes de rotar (1 MB).
 * @param {number} [opts.keep]      Cuántos archivos viejos guardar (3).
 * @param {boolean} [opts.console]  Escribir también en consola (true).
 */
export function createLogger({
    dir,
    file = 'agente.log',
    maxBytes = 1_000_000,
    keep = 3,
    console: toConsole = true,
    now = () => new Date(),
} = {}) {
    let size = null;
    let fileOk = Boolean(dir);
    const filePath = dir ? path.join(dir, file) : null;

    if (fileOk) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            size = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
        } catch {
            fileOk = false;
        }
    }

    function rotate() {
        try {
            for (let i = keep; i >= 1; i--) {
                const from = i === 1 ? filePath : `${filePath}.${i - 1}`;
                const to = `${filePath}.${i}`;
                if (fs.existsSync(from)) {
                    if (i === keep && fs.existsSync(to)) fs.unlinkSync(to);
                    fs.renameSync(from, to);
                }
            }
            size = 0;
        } catch {
            /* ignorar */
        }
    }

    function write(level, msg) {
        const line = `${formatStamp(now())} [${level}] ${msg}`;
        if (toConsole) {
            if (level === 'ERROR' || level === 'WARN') console.error(line);
            else console.log(line);
        }
        if (!fileOk) return;
        try {
            const data = line + '\n';
            if (size + Buffer.byteLength(data) > maxBytes) rotate();
            fs.appendFileSync(filePath, data);
            size += Buffer.byteLength(data);
        } catch {
            /* ignorar */
        }
    }

    return {
        info: (m) => write('INFO', m),
        warn: (m) => write('WARN', m),
        error: (m) => write('ERROR', m),
        path: filePath,
    };
}
