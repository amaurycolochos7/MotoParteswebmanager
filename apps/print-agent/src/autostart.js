// Activa / desactiva el inicio automático del agente (solo para el .exe).
// Con Node se usan INSTALAR.bat / DESINSTALAR.bat, que llaman a los mismos scripts.
import { spawn } from 'node:child_process';
import { scriptPath } from './paths.js';

/** @returns {Promise<number>} código de salida de PowerShell (0 = bien) */
export function setAutostart(on, { noStart = false } = {}) {
    let script;
    try {
        script = scriptPath(on ? 'install-autostart.ps1' : 'uninstall-autostart.ps1');
    } catch (e) {
        console.error(e.message);
        return Promise.resolve(1);
    }
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Exe', process.execPath];
    if (on && noStart) args.push('-NoStart');
    return new Promise((resolve) => {
        const child = spawn('powershell.exe', args, { stdio: 'inherit' });
        child.once('error', () => resolve(1));
        child.once('close', (code) => resolve(code ?? 1));
    });
}
