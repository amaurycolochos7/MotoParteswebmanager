# Diario de progreso: Agente A (backend)

Estado final: TERMINADO. Todas las tareas 1 a 9 hechas y probadas en local. No se hizo commit, push, stash ni despliegue (lo hace el coordinador).

## 1) Tareas
| # | Tarea | Estado |
|---|---|---|
| 1 | Cimientos: `lib/permissions.js`, `lib/commissions.js`, `GET /api/earnings/summary` | [hecha] con pruebas |
| 2 | Seguridad: auth.js (usuarios), order-requests.js, earnings.js y también payment-requests.js | [hecha] con pruebas |
| 3 | Equipo `/api/team` (+ `/me`, `/settings`) con tope de comisión | [hecha] con pruebas |
| 4 | WhatsApp único: `wa-session.js`, `wa-send.js` (cola WaOutbox), `/api/whatsapp/*`, proxy antiguo, migración de sesión, `ready_timeout` del bot a 180 s | [hecha] con pruebas |
| 5 | Mensajes sin duplicados: plantillas por estado, `default-messages.js`, `status_key`, reclamo atómico de trabajos | [hecha] con pruebas |
| 6 | Bandeja: modelos Wa*, rutas `/api/inbox/*`, webhook interno, bot `inbox-events.js` | [hecha] con pruebas (bot falso) |
| 7 | Citas: `GET /api/appointments/inbox`, `attention-count {count, mine}` | [hecha] con pruebas |
| 8 | Pruebas: unitarias + `test/_v2_e2e.mjs` + regresión | [hecha] |
| 9 | Docs: `docs/WHATSAPP-V2.md`, sección "Cambios" en `docs/CONTRATO-V2.md` | [hecha] |

## 2) Resultados de pruebas (última corrida)
- `node --test test/*.test.js`: 148 de 148 (98 anteriores + 50 nuevas).
- `test/_v2_e2e.mjs`: 199 PASS, 0 FAIL (limpia sus datos: 0 perfiles restantes).
- `test/_public_booking_e2e.mjs`: 90 PASS, 0 FAIL.
- `test/_panel_e2e.mjs`: 52 ok, 0 fallos (corrido contra mi API en 3101 porque B ocupa 3102: `API_URL=http://127.0.0.1:3101/api`).

## 3) Decisiones (resumen; el detalle está en docs/WHATSAPP-V2.md)
- Parches con `scratchpad/patchlib.cjs` (los archivos del repo usan CRLF). En heredocs de bash evitar `\\`; usar la herramienta Write.
- Un maestro que intenta cambiar un rol recibe 403 y no se aplica ninguna parte del cambio.
- El tope de comisión (40 % por defecto) solo limita a los maestros.

## 4) Cómo arrancar
- API: `cd apps/api && DATABASE_URL='postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes' JWT_SECRET=local-dev-only-change-me WHATSAPP_API_KEY=local-dev-bot-key LANDING_VC_WORKSPACE_ID=7b795e9a-c398-49f1-9ca0-aee971805172 PORT=3101 node src/index.js`
- e2e V2: `cd apps/api && DATABASE_URL=... node test/_v2_e2e.mjs` (levanta su API en 3101 y un bot falso en 3199; el puerto 3101 debe estar libre).

## 5) SIGUIENTE PASO
Ninguno pendiente de mi parte. El coordinador debe: respaldar la base de producción, desplegar y seguir la lista "Qué verificar en producción" de `docs/WHATSAPP-V2.md`. El frontend (agente B) debe quitar los `sendDirectMessage` de orden/estado para no duplicar mensajes.
