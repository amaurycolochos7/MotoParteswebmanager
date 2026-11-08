# Diario de progreso · Agente B (frontend)

Última actualización: tras enrutar y probar Equipo, WhatsApp del taller, Conversaciones, Citas (bandeja) y Mis ganancias.

## 1. Tareas (del encargo)
1. [hecha] Sistema de diseño + AppLayout/menú reagrupado + campanita animada (`useBadges`, `NotificationBell`). Probado en escritorio y 390 px.
2. [hecha] Quitados los envíos directos de pantalla; `sendDirectMessage` -> `POST /api/whatsapp/send`.
3. [hecha] Inicio con `CommissionCard` (GET /earnings/summary, probado contra la API de A) y Mis ganancias reescrito con el mismo resumen (`MechanicEarnings.jsx` + `Earnings.css`). Panel admin (`AdminDashboard`) re-estilado vía `theme.css`.
4. [hecha] Nueva orden en una sola pantalla (probada: cliente -> moto -> resumen). Falta pulir colores internos de tarjetas cliente/moto si da tiempo.
5. [hecha] Detalle de orden: 2 columnas en escritorio, pestañas en celular (corregido el aplastamiento de pestañas).
6. [hecha] Equipo (`Team.jsx`): probado como dueño (alta guiada, tope) y como maestro ("Mi equipo": solo sus auxiliares). Rutas `/admin/team`, `/mechanic/team`; `/admin/users` redirige.
7. [hecha] WhatsApp del taller (`WhatsAppSettings.jsx`) probado en estado "desconectado" (sin bot local). `/mechanic/whatsapp` redirige a `/admin/whatsapp`.
8. [hecha] Conversaciones (`Inbox.jsx`): probado con eventos del bot sembrados (burbujas, origen, imagen, ficha, enviar -> estado en cola, polling). Mobile: lista/chat separados.
9. [hecha] Citas: `AppointmentCalendar` abre como bandeja (Por revisar / Hoy / Próximas / Todas / Cerradas) calculada en el cliente con `getAll()` (la ruta `GET /appointments/inbox` de A aún no existía al probar; el Inicio ya intenta usarla con respaldo).
10. [hecha] Verificación final: Buscar cliente / Impresión / login `?next=` con los nuevos tokens, `npm run build`, borrar `vite.config.local-b.mjs`.

## 2. Decisiones de diseño
- Dirección "taller industrial refinado": papel cálido `--paper #f3f0ea`, tinta `--ink #17140f`, rojo señal `--red #d71920` solo como acento; bordes 1 px (`--line`) bien definidos, sombras casi planas, tarjetas de resumen con sombra dura (4px 4px 0 tinta).
- Tipografía: Barlow Condensed (títulos en mayúsculas), Instrument Sans (texto), JetBrains Mono (folios, cifras, etiquetas). Cargadas en `index.html`.
- `styles/theme.css` remapea los tokens heredados de `index.css` (cascada: toda la app cambia de piel) y define la carcasa: menú oscuro con acento rojo a la izquierda del ítem activo, barra superior con título y campanita. `styles/primitives.css` + `components/ui/kit.jsx`: Avatar, Chip, Tabs, Segmented, Skeleton, Toolbar, SectionTitle, Panel, Stat, Switch, Drawer; clases `k-btn`, `k-input`, `k-select`, `k-field`, `k-note`, `k-empty`, `k-pagehead`, `k-search`.
- Roles en la interfaz: `AuthContext` expone `teamRole` (owner|admin|maestro|mecanico|auxiliar), `isManager`, `canViewInbox`, `canManageTeam`. Menú admin solo si `isAdmin()` o gerencia dentro de `/admin`; gerencia en `/mechanic` ve un grupo "Administración".
- Comisión: `CommissionCard` (tarjeta oscura, barra apilada pagada/liberada/por cobrar). Inicio: en celular el orden es comisión, citas, órdenes, estado.
- Nueva orden: se conservó TODA la lógica de `NewServiceOrder.jsx` y solo se transformaron los 5 pasos en 5 secciones siempre visibles (`no-sec`), con validación única `clientOk && motoOk && payOk`. Respaldo del archivo original en `/tmp/NewServiceOrder.before-v2.jsx`.
- Detalle de orden: se movieron los bloques existentes a `od-col--a` (estado, acciones, historial) y `od-col--b` (moto, cliente, costos, pagos, evidencias); pestañas en <1100 px. Respaldo original en `/tmp/OrderDetail.before-v2.jsx`.

## 3. Archivos creados o modificados (todos en apps/frontend salvo este diario)
Nuevos: `src/styles/theme.css`, `src/styles/primitives.css`, `src/components/ui/kit.jsx`, `src/hooks/useBadges.js`, `src/components/layout/NotificationBell.jsx`, `src/components/dashboard/CommissionCard.{jsx,css}`, `src/pages/mechanic/Dashboard.css`, `src/pages/mechanic/NewOrderV2.css`, `src/pages/mechanic/OrderDetailV2.css`, `src/pages/shared/Team.{jsx,css}`, `src/pages/shared/WhatsAppSettings.{jsx,css}`, `src/pages/shared/Inbox.{jsx,css}`, `vite.config.local-b.mjs` (TEMPORAL: borrar al final).
Modificados: `index.html` (fuentes), `src/main.jsx`, `src/components/ui/index.jsx` (re-export kit), `src/context/AuthContext.jsx`, `src/lib/api.js` (teamService, waService, inboxService, commissionService, appointmentsService.inbox), `src/components/layout/AppLayout.jsx` (reescrito), `src/pages/mechanic/MechanicDashboard.jsx` (reescrito), `NewServiceOrder.jsx`, `OrderDetail.jsx`, `MasterRequests.jsx`, `src/utils/whatsappHelper.js`, `src/components/ui/WhatsAppSendModal.jsx`.
PENDIENTE de tocar: `src/App.jsx` (rutas nuevas), `AppointmentCalendar.jsx`, `MechanicEarnings.jsx`, `AdminDashboard.jsx` (estilos), `AdminUsers.jsx` (reemplazado por Team: redirigir), `WhatsAppConnect.jsx` (retirar).

## 4. Cómo arrancar el entorno de prueba
- API de prueba (puerto 3102): `cd apps/api && DATABASE_URL='postgresql://motopartes:MotoPartes2026!@localhost:5434/motopartes' JWT_SECRET=local-dev-only-change-me WHATSAPP_API_KEY=local-dev-bot-key LANDING_VC_WORKSPACE_ID=7b795e9a-c398-49f1-9ca0-aee971805172 PORT=3102 node src/index.js` (reiniciar cuando A cambie rutas o esquema; si Prisma lo pide: `npx prisma generate` con esa DATABASE_URL).
- Vite de prueba (puerto 5180): `cd apps/frontend && npx vite --config vite.config.local-b.mjs` (config temporal con proxy `/api` a 127.0.0.1:3102; NUNCA usar `vite.config.js`, apunta a producción).
- Sesión de prueba en el navegador (origen http://127.0.0.1:5180), localStorage: `motopartes_token` (JWT firmado con JWT_SECRET: `{id:'5236d9b0-9508-415f-b27f-5e53415233bd', email:'local@motopartes.test', role:'admin', workspace_id:'7b795e9a-c398-49f1-9ca0-aee971805172'}`), `motopartes_auth` = `{"id":"5236d9b0-9508-415f-b27f-5e53415233bd"}`, `motopartes_active_workspace` = id del taller. Si la carga falla, `motopartes_auth` se borra: volver a ponerlo.
- Orden de prueba local existente: `/mechanic/order/0f45ec4e-5e70-4b4c-87e6-edded0682942` (TA-26-001). Teléfonos de prueba: prefijo 996.
- Mi pestaña de Chrome: 656951610 (cerrar al terminar). Existe otra pestaña ajena 656951593 (de un agente anterior): no tocar.

## 5. Endpoints de A
- Probados OK desde el frontend: GET/POST /team (lista, alta maestro y auxiliar), GET /team/settings, GET /whatsapp/status (desconectado, con `error`), GET /inbox/conversations, /inbox/conversations/:id, /messages, POST /messages (queda en cola), /read, /unread-count, /updates, /inbox/media/:id (imagen), POST /internal/wa/event (sembrado), GET /earnings/summary, public POST /appointments con mecanico_id, PATCH /auth/users/:id/online-booking.
- Pendientes de confirmar: GET /appointments/inbox (devolvía "Cita no encontrada"), `mine` en attention-count (la campanita cae a `count`), POST /whatsapp/start y /logout con bot real.

## 6. SIGUIENTE PASO
TERMINADO. Frontend completo y `npx vite build` en verde; servidores de prueba detenidos, `vite.config.local-b.mjs` borrado, pestaña cerrada. Siguiente paso del coordinador: integrar con el backend de A y correr la prueba conjunta (login real, flujo de cita a mecánico, WhatsApp real tras desplegar).
Pendientes que dependen de A: `GET /appointments/inbox`, `mine` en `/appointments/attention-count` (la campanita del auxiliar/mecánico hoy cae a `count`).
