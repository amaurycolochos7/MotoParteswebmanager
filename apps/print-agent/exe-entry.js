// Punto de entrada del MotoPartes-Impresion.exe (también sirve con Node: node exe-entry.js setup).
//
//   MotoPartes-Impresion.exe            → primera vez: asistente; después: queda imprimiendo
//   MotoPartes-Impresion.exe setup      → asistente (clave + impresora + prueba) y activa el inicio automático
//   MotoPartes-Impresion.exe run        → queda escuchando e imprime los tickets
//   MotoPartes-Impresion.exe test-print → imprime una página de prueba
//   MotoPartes-Impresion.exe check      → revisa la configuración
//   MotoPartes-Impresion.exe autostart | autostart-off
//   MotoPartes-Impresion.exe version
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

import { main as agentMain, VERSION } from './agent.js';
import { runSetup } from './setup.js';
import { setAutostart } from './src/autostart.js';
import { CONFIG_FILE } from './src/config.js';
import { IS_EXE } from './src/paths.js';

const HELP = `MotoPartes · Agente de impresión ${VERSION}

Comandos:
  setup          Asistente: clave, impresora y prueba (activa el inicio automático)
  run            Queda imprimiendo los tickets (es lo que hace al abrirlo sin comandos)
  test-print     Imprime una página de prueba
  check          Revisa la configuración
  autostart      Activa el inicio automático con Windows
  autostart-off  Lo desactiva y detiene el agente
  version        Muestra la versión
`;

async function pause(msg = 'Presiona Enter para cerrar…') {
    if (!process.stdin.isTTY) return;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question(msg);
    rl.close();
}

const BANNER = `
 ============================================================
  LISTO. El agente ya imprime solo, aunque cierres esta ventana.
  En MotoPartes, la pantalla "Impresión" debe decir "Conectado".
 ============================================================
`;

async function setupAndEnable(rest) {
    const code = await runSetup(rest);
    if (code !== 0) return code;
    if (rest.includes('--no-autostart')) return 0;
    console.log('\nActivando el inicio automático…');
    const auto = await setAutostart(true);
    if (auto !== 0) {
        console.log('\n[!] No se pudo activar el inicio automático. Puedes abrir el programa a mano.');
        return auto;
    }
    console.log(BANNER);
    return 0;
}

async function run() {
    const raw = process.argv
        .slice(IS_EXE ? 1 : 2)
        .filter((a) => path.resolve(a).toLowerCase() !== process.execPath.toLowerCase());
    const [cmd, ...rest] = raw;

    switch (cmd) {
        case undefined: {
            // Doble clic en el .exe
            if (!fs.existsSync(CONFIG_FILE)) {
                const code = await setupAndEnable([]);
                if (IS_EXE) await pause();
                return code;
            }
            console.log(`MotoPartes · Agente de impresión ${VERSION}. Déjame abierto o usa INSTALAR.bat para que corra solo. (Ctrl+C para detener)`);
            return agentMain([]);
        }
        case 'run': return agentMain(rest);
        case 'setup': return setupAndEnable(rest);
        case 'test-print': return agentMain(['--test-print', ...rest]);
        case 'check': return agentMain(['--check', ...rest]);
        case 'autostart': return setAutostart(true);
        case 'autostart-off': return setAutostart(false);
        case 'version': case '--version': console.log(VERSION); return 0;
        case 'help': case '--help': case '-h': console.log(HELP); return 0;
        default:
            // Compatibilidad: --config RUTA, --test-print, etc.
            if (cmd.startsWith('--')) return agentMain([cmd, ...rest]);
            console.log(`No conozco el comando "${cmd}".\n\n${HELP}`);
            return 1;
    }
}

run().then(
    (code) => process.exit(code ?? 0),
    (e) => {
        console.error(e);
        process.exit(1);
    }
);
