#!/usr/bin/env node
// Agente de impresión de MotoPartes (Windows).
//
//   node agent.js                 → queda escuchando y imprime los tickets que lleguen
//   node agent.js --test-print    → imprime una página de prueba y termina
//   node agent.js --check         → revisa la configuración y termina
//   node agent.js --version
//   node agent.js --config RUTA   → usa otro config.json
//
// Códigos de salida: 0 = todo bien · 1 = configuración incorrecta o error · 3 = ya hay otro agente corriendo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadConfig, CONFIG_FILE } from './src/config.js';
import { createLogger } from './src/log.js';
import { createApiClient } from './src/api.js';
import { createPrinter, friendlyPrintError } from './src/printers.js';
import { buildTestPage } from './src/testpage.js';
import { acquireLock, AlreadyRunningError } from './src/lock.js';
import { Runner } from './src/runner.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).version;

function parseArgs(argv) {
    const args = { flags: new Set(), config: CONFIG_FILE };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--config') args.config = path.resolve(argv[++i] || CONFIG_FILE);
        else if (argv[i].startsWith('--')) args.flags.add(argv[i].slice(2));
    }
    return args;
}

export async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);

    if (args.flags.has('version')) {
        console.log(VERSION);
        return 0;
    }

    const homeDir = path.dirname(args.config);
    const log = createLogger({ dir: path.join(homeDir, 'logs') });
    const { config, problems } = loadConfig(args.config, homeDir);

    if (problems.length > 0) {
        for (const p of problems) log.error(p);
        log.error('Corrige esto y vuelve a iniciar el agente (INSTALAR.bat te guía paso a paso).');
        return 1;
    }

    const printer = createPrinter(config);

    if (args.flags.has('check')) {
        log.info(`Configuración correcta. Servidor: ${config.apiUrl} · Impresora: ${printer.label} (${config.mode}).`);
        return 0;
    }

    if (args.flags.has('test-print')) {
        try {
            await printer.print(buildTestPage({ printer: printer.label }));
            log.info('Página de prueba enviada a la impresora. Revisa que haya salido el ticket.');
            return 0;
        } catch (e) {
            log.error(`No se pudo imprimir la prueba: ${friendlyPrintError(e)}`);
            return 1;
        }
    }

    let lock;
    try {
        lock = acquireLock(path.join(homeDir, 'agent.lock'));
    } catch (e) {
        if (e instanceof AlreadyRunningError) {
            log.warn(e.message + ' No hace falta abrir otro.');
            return 3;
        }
        throw e;
    }

    const api = createApiClient({
        apiUrl: config.apiUrl,
        key: config.key,
        version: VERSION,
        timeoutMs: config.timeoutMs,
    });
    const runner = new Runner({ config, api, printer, log, onTick: () => lock.touch() });

    const shutdown = (signal) => {
        log.info(`Recibí ${signal}; cerrando…`);
        runner.stop();
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGBREAK', () => shutdown('SIGBREAK'));

    // Red de seguridad: un error suelto no debe matar al agente.
    process.on('uncaughtException', (e) => log.error(`Error no controlado: ${e?.stack || e}`));
    process.on('unhandledRejection', (e) => log.error(`Promesa rechazada: ${e?.stack || e}`));

    try {
        await runner.start();
    } finally {
        lock.release();
    }
    return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
    main().then(
        (code) => process.exit(code),
        (e) => {
            console.error(e);
            process.exit(1);
        }
    );
}
