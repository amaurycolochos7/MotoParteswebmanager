// Inicio automático del agente SIN scripts: usa la clave "Run" del usuario en el registro de Windows
// (la misma que usan los programas normales; no pide administrador y aparece en
// Administrador de tareas → Inicio). Al entrar a Windows se ejecuta "MotoPartes-Impresion.exe start",
// que lanza el agente sin ventana y termina.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import { APP_DIR, IS_EXE } from './paths.js';

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE_NAME = 'MotoPartesImpresion';
const LOCK = path.join(APP_DIR, 'agent.lock');

// Con el .exe:  "C:\...\MotoPartes-Impresion.exe"        Con Node (desarrollo):  node exe-entry.js
const entryArgs = () => (IS_EXE ? [] : [path.join(APP_DIR, 'exe-entry.js')]);
const quote = (s) => `"${s}"`;

/** PID del agente si está corriendo, o null. */
export function agentPid() {
    try {
        const pid = parseInt(fs.readFileSync(LOCK, 'utf8'), 10);
        if (!Number.isInteger(pid) || pid <= 0) return null;
        process.kill(pid, 0);
        return pid;
    } catch (e) {
        return e?.code === 'EPERM' ? -1 : null;
    }
}

/** Lanza el agente en segundo plano y sin ventana. Devuelve true si lo lanzó (false si ya estaba). */
export function startHidden() {
    if (agentPid()) return false;
    const child = spawn(process.execPath, [...entryArgs(), 'run'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: APP_DIR,
    });
    child.unref();
    return true;
}

/** Detiene el agente (si corre). */
export function stopAgent() {
    const pid = agentPid();
    if (pid && pid > 0) {
        try {
            process.kill(pid);
        } catch {
            /* ya terminó */
        }
    }
    try {
        fs.rmSync(LOCK, { force: true });
    } catch {
        /* nada */
    }
}

/** Activa el inicio con Windows. @returns {boolean} */
export function enableAutostart() {
    const command = [quote(process.execPath), ...entryArgs().map(quote), 'start'].join(' ');
    const r = spawnSync('reg.exe', ['add', RUN_KEY, '/v', VALUE_NAME, '/t', 'REG_SZ', '/d', command, '/f'], { windowsHide: true });
    return r.status === 0;
}

/** Quita el inicio con Windows. @returns {boolean} */
export function disableAutostart() {
    const r = spawnSync('reg.exe', ['delete', RUN_KEY, '/v', VALUE_NAME, '/f'], { windowsHide: true });
    // Si no existía, reg devuelve 1: para nosotros también es "ya está quitado".
    return r.status === 0 || r.status === 1;
}

export function autostartEnabled() {
    return spawnSync('reg.exe', ['query', RUN_KEY, '/v', VALUE_NAME], { windowsHide: true }).status === 0;
}
