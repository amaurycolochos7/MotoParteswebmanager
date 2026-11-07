// Punto de entrada del MotoPartes-Impresion.exe (también sirve con Node: node exe-entry.js setup).
//
//   MotoPartes-Impresion.exe            → primera vez: asistente de instalación; después: menú
//   MotoPartes-Impresion.exe setup      → asistente (clave + impresora + prueba)
//   MotoPartes-Impresion.exe start      → lanza el agente sin ventana (lo usa el inicio con Windows)
//   MotoPartes-Impresion.exe run        → queda imprimiendo en esta ventana
//   MotoPartes-Impresion.exe test-print | check | autostart | autostart-off | version
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

import { main as agentMain, VERSION } from './agent.js';
import { runSetup } from './setup.js';
import { CONFIG_FILE } from './src/config.js';
import { IS_EXE } from './src/paths.js';
import {
    agentPid, startHidden, stopAgent, enableAutostart, disableAutostart, autostartEnabled,
} from './src/autostart.js';

const HELP = `MotoPartes · Agente de impresión ${VERSION}

Comandos:
  (sin comando)   Primera vez: instalación guiada. Después: menú
  setup           Instalación guiada (clave, impresora y prueba)
  start           Inicia el agente en segundo plano, sin ventana
  run             Inicia el agente en esta ventana
  test-print      Imprime una página de prueba
  check           Revisa la configuración
  autostart       Activa el inicio automático con Windows
  autostart-off   Lo quita y detiene el agente
  version         Muestra la versión
`;

const BANNER = `
 ============================================================
  LISTO. El agente imprime solo, aunque cierres esta ventana,
  y se inicia cada vez que prendes la laptop.
  En MotoPartes, la pantalla "Impresión" debe decir "Conectado".
 ============================================================
`;

async function readLine(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await rl.question(question)).trim();
    } finally {
        rl.close();
    }
}

async function pause() {
    if (process.stdin.isTTY) await readLine('Presiona Enter para cerrar… ');
}

/** Después de instalar: inicio con Windows + agente corriendo en segundo plano. */
function activate() {
    console.log('\nActivando el inicio automático…');
    const auto = enableAutostart();
    stopAgent(); // por si había uno viejo con otra configuración
    startHidden();
    if (!auto) {
        console.log('[!] No pude activar el inicio automático. El agente funciona ahora, pero habrá que abrir el programa cada vez que prendas la laptop.');
        return 1;
    }
    console.log(BANNER);
    return 0;
}

async function install(rest) {
    const code = await runSetup(rest);
    if (code !== 0) return code;
    if (rest.includes('--no-autostart')) return 0; // para pruebas
    return activate();
}

async function menu() {
    for (;;) {
        const running = !!agentPid();
        console.log(`\nMotoPartes · Agente de impresión ${VERSION}`);
        console.log(`Estado: ${running ? '✓ funcionando en segundo plano' : '✗ detenido'}   ·   Inicio con Windows: ${autostartEnabled() ? 'activado' : 'apagado'}`);
        console.log('');
        console.log('  1) Imprimir una página de prueba');
        console.log('  2) Cambiar la clave o la impresora');
        console.log(`  3) ${running ? 'Reiniciar el agente' : 'Iniciar el agente ahora'}`);
        console.log('  4) Quitar el inicio automático y detener el agente');
        console.log('  5) Salir');
        const pick = await readLine('\nEscribe el número y presiona Enter: ');
        if (pick === '1') await agentMain(['--test-print']);
        else if (pick === '2') { await install([]); }
        else if (pick === '3') { stopAgent(); startHidden(); console.log('✓ Agente iniciado.'); }
        else if (pick === '4') { disableAutostart(); stopAgent(); console.log('✓ Listo: ya no se inicia solo y quedó detenido.'); }
        else if (pick === '5' || pick === '') return 0;
        else console.log('Escribe un número del 1 al 5.');
    }
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
                const code = await install([]);
                await pause();
                return code;
            }
            const code = await menu();
            return code;
        }
        case 'run': return agentMain(rest);
        case 'start': console.log(startHidden() ? 'Agente iniciado.' : 'El agente ya estaba funcionando.'); return 0;
        case 'setup': return install(rest);
        case 'test-print': return agentMain(['--test-print', ...rest]);
        case 'check': return agentMain(['--check', ...rest]);
        case 'autostart': console.log(enableAutostart() ? 'Inicio automático activado.' : 'No se pudo activar.'); return 0;
        case 'autostart-off': disableAutostart(); stopAgent(); console.log('Inicio automático quitado y agente detenido.'); return 0;
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
