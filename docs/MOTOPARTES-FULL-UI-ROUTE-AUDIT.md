# MotoPartes — Auditoría completa de UI / rutas / componentes

> **Tipo de tarea:** AUDITORÍA Y MAPEO. **No se aplicó ningún rediseño**, no se cambiaron
> estilos, colores, fuentes ni componentes. No hubo merge ni deploy. El único cambio es este
> documento. Rama: `audit/full-ui-route-audit`.

---

## 1. Resumen ejecutivo

MotoPartes es una SPA React 19 + Vite 7 + React Router 7, con **CSS global plano**
(`src/index.css`, ~2.980 líneas) basado en variables CSS + clases semánticas, **sin Tailwind**,
e íconos `lucide-react` (única librería, presente en 76 archivos).

El rediseño "Apple" previo se aplicó **a la capa global** (tokens `:root` + clases base
`.btn/.card/.modal/.table/.badge/.sidebar` + Landing + Login + AppLayout). Por eso **todo lo que
consume esas clases/tokens cambió**. Pero el sistema tiene **mucha personalización local que NO
cae bajo la capa global** y por eso quedó con apariencia vieja/mezclada:

1. **~696 estilos inline** (`style={{}}`) en 58 archivos con hex hardcodeados.
2. **Bloques `<style>` embebidos por página** (Onboarding, Signup, ClientPortal, NewServiceOrder,
   AppointmentCalendar, MechanicDashboard, admin/*, super/*, blog/cases, Questions) que definen
   su propio look sin tokens.
3. **CSS dedicado por pantalla** que **no fue tocado**: `Quotations.css`, `OrderDetail.css`,
   `WhatsAppSendModal.css` — siguen con fuente `Inter` y paleta vieja (`#2563eb`, grises slate).
4. **731 apariciones de paleta vieja** (azules `#2563eb/#1d4ed8/#3b82f6`, slate
   `#1e293b/#0f172a/#64748b`, rojos `#ef4444/#dc2626`) en 59 archivos.
5. **141 gradientes** en 37 archivos (look "plantilla/IA").

**Conclusión:** el rediseño es real pero **parcial por arquitectura**: cubre lo que pasa por la
capa global; no cubre lo que está hardcodeado por página. La siguiente fase debe **tokenizar los
estilos inline / `<style>` embebidos / CSS por página**, empezando por el flujo de **crear orden**
y **crear cotización**.

## 2. Alcance

- Frontend completo (`apps/frontend/src`): rutas, layouts, páginas, componentes compartidos,
  CSS global, CSS por página, estilos inline, `<style>` embebidos, íconos, fuentes, colores.
- No incluye rediseño. No incluye backend salvo para entender rutas/roles.

## 3. Cómo se ejecutó la auditoría

- **Lectura de código + análisis estático** (grep/AST) sobre los 68 archivos de UI.
- **Conteos reproducibles** de hex, gradientes, `font-family`, botones e imports de íconos.
- **Verificación en vivo** de producción (hecha en fase previa): bundles servidos
  `index-CFzuL4gQ.js` / `index-CK1QRFDH.css`, `HTTP 200` en `/` y `/api/health`.
- **Limitación honesta:** este entorno **no renderiza navegador**, por lo que **no hay capturas
  de pantalla**. Los hallazgos responsive/visuales se infieren de reglas CSS y media queries
  reales, y se marcan como "verificar a ojo". No afirmo PASS/FAIL visual de algo no renderizado.

## 4–8. Arquitectura y rutas detectadas

**Framework:** React 19.2 · **Router:** react-router-dom 7.10 (`BrowserRouter`).
**Layouts globales:** `AppLayout` (admin + mecánico), `SuperLayout` (super-admin), y páginas
públicas/auth sin layout. **CSS global:** `src/index.css`. **Íconos:** `lucide-react` 0.556.
**Fuentes:** stack de sistema en `--font-family` (global), pero con excepciones hardcodeadas
(ver §11). **Sin Tailwind** (no hay `tailwind.config`).

### Conteo de rutas
- **Definiciones de ruta (`<Route>`):** ~61.
- **Públicas / sin auth:** 12 — `/`, `/login`, `/signup`, `/onboarding`*, `/orden/:token`,
  `/questions`, `/questions/admin`, `/blog`, `/blog/:slug`, `/casos`, `/casos/:slug`,
  `/super/login`. (*`/onboarding` exige sesión pero no rol.)
- **Privadas:** 49 — admin (21) + mecánico (17) + super (11).
- **Catch-all 404:** `*` → redirige a dashboard (si auth) o `/` (si no). **No existe página 404
  diseñada.** **No existe** ruta de recuperación de contraseña.

### Mapa completo de rutas

| Grupo | Ruta | Componente |
|---|---|---|
| Público | `/` | `Landing` (si no auth) |
| Público | `/login` | `Login` |
| Público | `/signup` | `Signup` |
| Auth | `/onboarding` | `Onboarding` |
| Público | `/orden/:token` | `ClientPortal` |
| Interno PIN | `/questions`, `/questions/admin` | `QuestionsApp`, `QuestionsAdmin` |
| Público | `/blog`, `/blog/:slug` | `Blog`, `BlogPost` |
| Público | `/casos`, `/casos/:slug` | `Cases`, `CaseStudy` |
| Admin | `/admin` | `AdminDashboard` |
| Admin | `/admin/orders` | `AdminOrders` |
| Admin | `/admin/order/:id`, `/admin/orders/:id` | `OrderDetail` (compartido) |
| Admin | `/admin/clients` | `AdminClients` |
| Admin | `/admin/users` | `AdminUsers` |
| Admin | `/admin/users/:id/orders` | `AdminMechanicOrders` |
| Admin | `/admin/mechanics` | `AdminMechanics` |
| Admin | `/admin/analytics` | `AdminAnalytics` |
| Admin | `/admin/workspace` | `AdminWorkspace` |
| Admin | `/admin/billing` | `AdminBilling` |
| Admin | `/admin/automations` | `AdminAutomations` |
| Admin | `/admin/templates` | `AdminTemplates` |
| Admin | `/admin/tasks` | `AdminTasks` |
| Admin | `/admin/bot-health` | `AdminBotHealth` |
| Admin | `/admin/referrals` | `AdminReferrals` |
| Admin | `/admin/shop-qr` | `AdminShopQR` |
| Admin | `/admin/integrations` | `AdminIntegrations` |
| Admin | `/admin/support`, `/support/new`, `/support/:id` | `AdminSupport*` |
| Mecánico | `/mechanic` | `MechanicDashboard` |
| Mecánico | `/mechanic/new-order` | `NewServiceOrder` |
| Mecánico | `/mechanic/orders` | `MechanicOrders` |
| Mecánico | `/mechanic/order/:id` | `OrderDetail` (compartido) |
| Mecánico | `/mechanic/clients` | `ClientsList` |
| Mecánico | `/mechanic/appointments` | `AppointmentCalendar` |
| Mecánico | `/mechanic/history` | `MechanicHistory` |
| Mecánico | `/mechanic/earnings` | `MechanicEarnings` |
| Mecánico | `/mechanic/requests` | `MasterRequests` (maestro) |
| Mecánico | `/mechanic/auxiliaries` | `AuxiliaryDashboard` (maestro) |
| Mecánico | `/mechanic/my-requests` | `MyRequests` (auxiliar) |
| Mecánico | `/mechanic/my-payments` | `AuxiliaryPayments` (auxiliar) |
| Mecánico | `/mechanic/auxiliary/:id/orders` | `AuxiliaryOrders` |
| Mecánico | `/mechanic/whatsapp` | `WhatsAppConnect` (maestro) |
| Mecánico | `/mechanic/quotations` | `Quotations` |
| Mecánico | `/mechanic/quotations/new` | `NewQuotation` |
| Mecánico | `/mechanic/quotations/:id` | `QuotationDetail` |
| Super | `/super` … `/super/settings` | `Super*` (11 rutas) |

### Roles (de `ProtectedRoute` + `AuthContext`)
- **admin** (`Profile.role==='admin'`) → sidebar admin.
- **mechanic** → sidebar mecánico.
- **maestro** (`is_master_mechanic` / workspaceRole owner|admin) → secciones Solicitudes,
  Auxiliares, Conectar Bot, + enlace "Gestionar Usuarios".
- **auxiliar** (`requiresApproval`) → Mis Solicitudes, Mis Pagos.
- **super-admin** (`is_super_admin`) → panel `/super` paralelo.

## 9. Mapa de flujos principales
`Cotización → (aceptar) → Orden → estados → pagos/abonos → saldo → comisión → recibo/PDF →
WhatsApp`. Este es el flujo "ELIHU" que **no debe romperse**. Toda la lógica vive en
`lib/api.js`, `context/DataContext.jsx`, `utils/pdfGenerator.js`, `utils/whatsappHelper.js`.

---

## 10. Auditoría — Flujo CREAR ORDEN (`/mechanic/new-order` → `NewServiceOrder.jsx`)

`NewServiceOrder.jsx` es el archivo más grande (≈149 KB) y el **más desalineado**:
- **51 estilos inline**, **139 hex hardcodeados**, **34 hits de paleta vieja**, **9 gradientes**,
  **bloque `<style>` embebido** con `font-family: 'Segoe UI', Arial` (línea 286) y un header con
  gradiente oscuro `linear-gradient(135deg,#1e293b,#334155)` (≈línea 2759).
- Botones del flujo (Siguiente/Atrás/Guardar/Agregar servicio/Agregar foto) son una mezcla de
  `.btn` global (ya nuevo) y botones con estilo propio embebido (viejo).
- El total usaba `#2563eb` (corregido puntualmente a azure en fase previa, pero el resto del
  archivo sigue con su propio sistema).

| Paso | Estado visual | Observación |
|---|---|---|
| Selector/registro de cliente | Mezclado | usa clases `.client-list-*` (nuevas) pero dentro de layout propio |
| Moto / falla / diagnóstico | Viejo | inputs con estilo embebido, no tokens |
| Servicios / costos | Viejo | tarjetas y botones embebidos |
| Fotos | Mezclado | `PhotoUpload` compartido |
| Botones avanzar/guardar | Mezclado | `.btn` global + botones propios |
| Tipografía | Inconsistente | `Segoe UI` hardcodeado |
**Prioridad: ALTA (crítica de negocio).**

## 11-flujo. Auditoría — Flujo CREAR COTIZACIÓN
- `Quotations.jsx` (lista) + `NewQuotation.jsx` (crear) + `QuotationDetail.jsx` (detalle) +
  **`Quotations.css`** dedicado.
- **`Quotations.css` NO fue tocado:** `font-family: 'Inter'…` (línea 38), paleta vieja, 4
  gradientes. → look viejo en toda la sección de cotizaciones.
- `NewQuotation.jsx`: 23 botones, 7 `font-family` (varios `inherit`), 1 gradiente — relativamente
  alineado vía `.btn`/inputs globales, pero conviven con `Quotations.css`.
- `QuotationDetail.jsx`: 27 botones, 10 hex — mezclado.
**Prioridad: ALTA.**

## 12-flujo. Auditoría — DETALLE DE ORDEN (`OrderDetail.jsx` + `OrderDetail.css`)
- `OrderDetail.jsx`: 82 KB, 42 botones, 8 estilos inline, 18 hex.
- **`OrderDetail.css` NO fue tocado:** `font-family: 'Inter'` (línea 40), 37 hex, 8 gradientes.
- Subcomponentes: `OrderPaymentsSection` (pagos/saldo — 28 inline, 26 hex), `CommissionSection`
  (comisión — 13 inline), `PhotoGallery`, `WhatsAppSendModal` (+ `WhatsAppSendModal.css`),
  `PaymentReceiptDownload` / `OrderPhotosDownload` (plantillas PDF/print — OK que usen su fuente).
- Estado/cliente/moto/servicios mezclan badges nuevos con cards de `OrderDetail.css` viejas.
**Prioridad: ALTA.**

## 13-flujo. CLIENTES (`ClientsList.jsx`, `ClientHistoryPanel.jsx`)
- `ClientsList`: 22 botones, 18 inline, solo 2 hex → **bastante alineado** (usa `.client-card`,
  `.client-list-*`, `.search-box` globales). Estado: **parcialmente nuevo**.
- `ClientHistoryPanel`: 13 inline, 12 hex → mezclado.
**Prioridad: MEDIA.**

## 14-flujo. CITAS (`AppointmentCalendar.jsx`, `AppointmentModal.jsx`)
- `AppointmentCalendar`: 20 inline, 26 hex, **13 hits paleta vieja**, 6 gradientes, `<style>`
  embebido con badges de fecha en gradiente azul (corregido a azure puntual en fase previa).
- `AppointmentModal`: 7 botones, 3 inline. Estado: **mezclado**.
**Prioridad: MEDIA-ALTA** (flujo usado y con gradientes).

## 15-flujo. SOLICITUDES (`MasterRequests.jsx`, `MyRequests.jsx`)
- `MasterRequests`: 16 inline, 10 botones. `MyRequests`: 16 inline. Mezclado (cards/badges
  globales + estilos inline). **Prioridad: MEDIA.**

## 16-flujo. AUXILIARES (`AuxiliaryDashboard.jsx`, `AuxiliaryPayments.jsx`, `AuxiliaryOrders.jsx`)
- `AuxiliaryDashboard`: 46 inline (uno de los más altos), `<style>` embebido. **Viejo/mezclado.**
- `AuxiliaryPayments`: 20 inline, 7 botones. **Prioridad: MEDIA.**

## 17-flujo. CONECTAR BOT / WHATSAPP (`WhatsAppConnect.jsx`)
- 20 inline, 11 `font-family`, 3 gradientes, 4 botones. QR + estados de conexión + mensajes.
  Mezclado; el estado de conexión usa `ConnectionStatus`/`NoChatWarning` (estos con su propio CSS
  embebido y fuente monospace donde aplica). **Prioridad: MEDIA.**

## 18-flujo. LANDING (`/`, `Landing.jsx`)
- Retune aplicado en fase previa: variables `.mp-*` a azure, fuente de sistema, pills planos,
  glows rojos eliminados; mockup WhatsApp conserva verde auténtico. **Estado: nuevo (consistente)**
  salvo 21 gradientes restantes (bandas de sección azure — aceptables) y thumbnails decorativos.
- **Observación de identidad:** el azure `#0071e3` es genérico tipo Apple, **no derivado del logo
  MotoPartes** (el logo tiene rojo). Falta definir si el acento debe alinearse al rojo/identidad
  de marca. **Pendiente de decisión de marca (ver §Recomendaciones).**

---

## 19. Componentes globales / reutilizables (matriz §18 obligatoria)

| Componente | Archivo | Usado en | Estado actual | Problema | Acción |
|---|---|---|---|---|---|
| AppLayout (sidebar+drawer) | `components/layout/AppLayout.jsx` | admin+mecánico | **Nuevo** | sidebar claro OK; `<style>` inline con media propias | Mantener; mover estilos a index.css |
| MobileNav (bottom bar) | `components/layout/MobileNav.jsx` | **ninguno (muerto)** | Viejo | nunca se renderiza | Eliminar o re-integrar |
| TopBar | `components/layout/TopBar.jsx` | no montado en AppLayout | Viejo | huérfano | Verificar uso / eliminar |
| ProtectedRoute | `components/layout/ProtectedRoute.jsx` | rutas privadas | n/a | sin UI | — |
| OrderCard | `components/ui/OrderCard.jsx` | listas de órdenes | Nuevo (cascada) | 1 hex | OK |
| Toast / ToastContext | `components/ui/Toast.jsx` + ctx | global | Mezclado | 12 hex en ctx, gradientes | Tokenizar |
| ConnectionStatus | `components/ui/ConnectionStatus.jsx` | global | Mezclado | 7 font-family/colores | Tokenizar |
| NoChatWarning | `components/ui/NoChatWarning.jsx` | bot/orden | Viejo | `<style>` embebido, monospace | Tokenizar |
| WhatsAppSendModal (+css) | `components/ui/WhatsAppSendModal.*` | orden/cotización | Viejo | `WhatsAppSendModal.css` sin tokens | Refactor a tokens |
| PaymentReceiptDownload | `components/ui/PaymentReceiptDownload.jsx` | recibos | Plantilla PDF | fuente Segoe (OK para impresión) | No prioritario |
| OrderPhotosDownload | `components/ui/OrderPhotosDownload.jsx` | fotos | Plantilla | idem | No prioritario |
| PhotoUpload / PhotoGallery | `components/orders/*` | orden | Mezclado | inline | Tokenizar |
| OrderPaymentsSection | `components/orders/OrderPaymentsSection.jsx` | detalle orden | **Viejo** | 28 inline, 26 hex | **Refactor prioritario** |
| CommissionSection | `components/orders/CommissionSection.jsx` | detalle orden | Mezclado | 13 inline | Tokenizar |
| ClientHistoryPanel | `components/clients/ClientHistoryPanel.jsx` | clientes/orden | Mezclado | 13 inline | Tokenizar |
| AppointmentModal | `components/appointments/AppointmentModal.jsx` | citas | Mezclado | 3 inline, 7 botones | Tokenizar |

**Componentes que NO existen pero deberían unificarse (hoy se repiten ad-hoc):** `Button`,
`Input`, `Select`, `Textarea`, `Modal`, `Stepper`, `EmptyState`, `StatusChip`, `PageHeader`,
`SectionCard`. Hoy son clases globales + reimplementaciones inline por página.

## 20. Auditoría de botones (matriz §19 obligatoria)

460 instancias de botón en 66 archivos. Patrón dominante: clase global `.btn .btn-*` (ya nueva)
**conviviendo** con `<button>` de estilo inline/propio (viejo).

| Botón | Ruta | Estilo actual | Problema | Variante recomendada |
|---|---|---|---|---|
| Crear/Nueva Orden | sidebar, dashboard, `/new-order` | mezcla `.btn-primary` / `btn-new-order` | `btn-new-order` neutralizado global, pero CTAs internos del wizard usan estilo propio | primary (pill azure) |
| Nueva cotización | `/quotations` | `.btn` + `Quotations.css` | `Quotations.css` viejo | primary |
| Guardar / Siguiente / Atrás | wizard orden/cotización | inline + `.btn` | inconsistencia tamaño/fuente | primary / secondary / ghost |
| Registrar pago / abono | detalle orden / `OrderPaymentsSection` | inline (viejo) | 28 inline | primary |
| Descargar recibo / Ver PDF | detalle orden | `.btn` + inline | mezclado | secondary |
| Enviar WhatsApp | orden/cotización | `WhatsAppSendModal` viejo | css sin tokens | success(verde marca WA) |
| Aceptar cotización / Convertir a orden | `QuotationDetail` | inline | 27 botones mezclados | primary / success |
| Crear/editar cliente, Agregar moto | clientes / wizard | `.btn` + inline | parcial | primary / secondary |
| Agregar servicio / foto | wizard orden | inline | viejo | secondary / ghost |
| Cambiar estado | detalle orden | selector propio | no estandarizado | segmented / select |
| Cerrar sesión | sidebar | `.btn-ghost` | OK | ghost |
| Conectar bot | `/whatsapp` | inline | mezclado | primary |

## 21. Auditoría de íconos
- **Librería única:** `lucide-react` (76 archivos) — **bien**, no hay mezcla de librerías.
- **Inconsistencias:** tamaños variados (`size={18/20/24}` y otros), color a veces heredado, a
  veces hex; en sidebar `size={20}`, en mobile `size={24}`, en cards mixto. No hay un wrapper
  `<Icon>` que normalice tamaño/grosor/color.
- **Recomendación futura (no aplicar):** estandarizar a 18–20px en UI densa, 24px en nav táctil,
  color `currentColor` ligado a tokens de texto. No cambiar todavía.

## 22. Auditoría tipográfica
- **Global:** `--font-family` = stack de sistema (correcto, premium).
- **Inconsistencias reales:**
  - `Quotations.css:38` y `OrderDetail.css:40` → `font-family: 'Inter'…` (fuente distinta a la
    global). **Causa raíz del "se ve de IA/plantilla" en cotizaciones y detalle de orden.**
  - `NewServiceOrder.jsx:286` → `'Segoe UI', Arial`.
  - Plantillas PDF/print (`PaymentReceiptDownload`, `OrderPhotosDownload`) usan `Segoe UI` →
    aceptable para impresión, no para UI.
- Jerarquía de títulos: global mejorada (`letter-spacing` negativo en headings), pero páginas con
  `<style>` embebido definen tamaños propios → jerarquía inconsistente entre rutas.

## 23. Auditoría de colores (matriz §20 obligatoria)

1.474 hex en 68 archivos; 731 de paleta vieja en 59 archivos.

| Color encontrado | Archivo/ruta | Uso actual | Problema | Token recomendado |
|---|---|---|---|---|
| `#2563eb` / `#1d4ed8` / `#3b82f6` | NewServiceOrder, AppointmentCalendar, MechanicHistory, OrderDetail, avatares | azul primario viejo | no coincide con azure nuevo `#0071e3` | `--primary` |
| `#1e293b` / `#0f172a` | NewServiceOrder header, SuperLayout, Questions, AdminBotHealth | fondos/headers oscuros | look pesado/viejo | `--surface-dark` / `--color-ink` |
| `#64748b` / `#94a3b8` | inline en casi todas | texto secundario slate | distinto a `--text-secondary` | `--text-secondary` / `--text-muted` |
| `#f1f5f9` / `#f8fafc` | fondos inline | lienzo viejo | distinto a fog `#f5f5f7` | `--surface-canvas/recessed` |
| `#e2e8f0` / `#cbd5e1` | bordes inline (inputs admin/super) | bordes viejos gruesos | distinto a `#e8e8ed` | `--border-color` |
| `#ef4444` / `#dc2626` | danger, badges, mobile badge, blob | rojos varios | ok semántico, pero tono ≠ `--danger` | `--danger` |
| `#16a34a` / `#22c55e` | success varios | verdes | tono ≠ `--success` | `--success` |
| `#00a884` | Landing mockup WhatsApp | verde WhatsApp | **correcto** (marca WA) | mantener |
| Gradientes (`linear/radial`) ×141 | index.css, Landing, NewServiceOrder, Onboarding, Signup, admin | decoración/headers | look "IA/plantilla" | superficies planas + tokens |

**Identidad de marca:** el acento azure `#0071e3` es de referencia Apple, **no del logo
MotoPartes** (rojo). Hay que decidir si el primario se mantiene azul (Apple) o se alinea al rojo
de marca. Hoy coexisten azules viejos (`#2563eb`), azure nuevo (`#0071e3`) y rojo de logo → es la
fuente principal de "azules genéricos mal aplicados" que mencionó el usuario.

## 24. Auditoría responsive (matriz §21 obligatoria)

Reglas globales presentes (verificadas en CSS, **no en navegador**): `body{overflow-x:hidden}`,
`*{min-width:0}`, grids→1col ≤768, modales full-width móvil, targets ≥44px, drawer del sidebar.
Riesgos por **CSS embebido/inline que ignora estas reglas**:

| Ruta | 320 | 390 | 768 | 1024 | 1440 | Problemas / riesgos |
|---|---|---|---|---|---|---|
| `/` Landing | ✅ | ✅ | ✅ | ✅ | ✅ | media queries propias OK; verificar a ojo |
| `/login` | ✅ | ✅ | ✅ | ✅ | ✅ | tarjeta centrada; OK |
| `/mechanic` dashboard | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | `<style>` embebido define grids propios; revisar KPIs en 320 |
| `/mechanic/new-order` | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | **wizard pesado en móvil** (prioridad); inputs/cards embebidos |
| `/mechanic/quotations*` | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | `Quotations.css` no responsive-token |
| `/mechanic/order/:id` | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | `OrderDetail.css` + pagos inline; verificar tablas/acciones en móvil |
| Pagos/abono (modal) | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | `OrderPaymentsSection` inline; confirmar modal en 320 |
| `/mechanic/clients` | ✅ | ✅ | ✅ | ✅ | ✅ | usa cards globales; OK |
| `/mechanic/appointments` | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | calendario en móvil a revisar |
| admin/* tablas | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ | tablas anchas: hoy scroll contenido (sin overflow de página), pero no card-mobile |
| super/* | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | layout oscuro propio |

Flujos críticos a validar en móvil real: **crear orden, crear cotización, registrar pago, buscar
cliente, cambiar estado.**

---

## 25. Hallazgos CRÍTICOS
- **Ninguno confirmado como bloqueante de flujo por código** (build pasa, rutas resuelven, prod
  responde 200). Los riesgos de "modal fuera de pantalla / wizard inusable en 320px" son
  **probables pero no verificables sin navegador** → marcados como ALTO-a-validar, no Crítico.

## 26. Hallazgos ALTOS
1. `NewServiceOrder.jsx` (crear orden): paleta vieja, `Segoe UI`, header oscuro, botones mezclados.
2. `OrderDetail.css` + `OrderPaymentsSection` (detalle/pagos): `Inter`, 26–37 hex viejos.
3. `Quotations.css` (cotizaciones): `Inter`, paleta vieja.
4. Tipografía inconsistente por CSS por página (`Inter`/`Segoe UI` vs sistema).
5. Coexistencia de 3 azules (`#2563eb`, `#0071e3`, rojo-logo) → identidad incoherente.
6. `AppointmentCalendar` y `AuxiliaryDashboard`: alto inline + gradientes.

## 27. Hallazgos MEDIOS
- Toast/ConnectionStatus/NoChatWarning/WhatsAppSendModal con CSS propio sin tokens.
- Badges/estados con tonos hex en lugar de tokens en varias páginas.
- Íconos sin tamaño/peso estandarizado.
- admin/* y super/* con `<style>` embebido y paleta slate vieja.

## 28. Hallazgos BAJOS
- Microcopy y márgenes irregulares en páginas embebidas.
- Hover inconsistente en botones inline.
- Plantillas PDF con `Segoe UI` (aceptable).

## 29. Componentes duplicados / a unificar
- **Botones**: `.btn-*` global vs `mp-btn-*` (landing) vs `<button>` inline → unificar en 1 `Button`.
- **Inputs**: `.form-input` global vs inputs inline (admin/super/onboarding) → unificar.
- **Modales**: `.modal` global vs `WhatsAppSendModal.css` vs modales inline → unificar.
- **Stepper/pasos**: wizard de orden/cotización reimplementa pasos sin componente común.
- **EmptyState/StatusChip/PageHeader**: reimplementados ad-hoc.

## 30. Rutas que conservan diseño viejo (resumen)
`new-order`, `quotations*`, `order/:id` (vía OrderDetail.css), `auxiliaries`, `onboarding`,
`signup`, `client portal`, `blog/cases`, casi todo `admin/*` y `super/*`, `questions/*`.

## 31. Rutas parcialmente rediseñadas
`/` landing, `/login`, dashboard mecánico, `clients`, `appointments`, `history` (acentos azure
ya alineados), shell/sidebar.

## 32. Rutas no revisadas en navegador y motivo
Todas: **no hay navegador en este entorno** → análisis por código + verificación de bundles en
producción. Sin capturas.

## 33. Estrategia recomendada para el rediseño posterior
1. **Decidir identidad de color primero** (azure Apple vs rojo de marca MotoPartes). Bloqueante
   conceptual: define el token `--primary`.
2. **Migrar CSS por página a tokens**: `Quotations.css`, `OrderDetail.css`, `WhatsAppSendModal.css`
   (quitar `Inter`, slate, gradientes).
3. **Tokenizar los `<style>` embebidos** de las páginas de flujo (NewServiceOrder primero).
4. **Crear componentes base reales** (`Button`, `Input`, `Modal`, `Stepper`, `StatusChip`,
   `EmptyState`, `PageHeader`) y reemplazar inline.
5. **Barrido de hex→token** dirigido por los 59 archivos con paleta vieja.
6. **Estandarizar íconos** con wrapper.
7. **QA responsive en navegador** en los 8 anchos, con foco en crear orden/cotización/pago móvil.

## 34. Orden sugerido de implementación
1) Crear orden → 2) Crear cotización → 3) Detalle de orden + pagos → 4) Citas → 5) Clientes
(pulir) → 6) Solicitudes/Auxiliares → 7) Conectar Bot → 8) Admin/* → 9) Super/* → 10) Blog/Cases.

## 35. Riesgos
- Tokenizar `<style>` embebidos y CSS por página es **alto volumen** (≈696 inline + 3 CSS + ~20
  `<style>`). Riesgo de regresión visual → hacer por flujo, con verificación.
- No romper ELIHU: los archivos de flujo son enormes (149 KB NewServiceOrder); editar estilos sin
  tocar lógica requiere cuidado.
- Decisión de marca pendiente puede obligar a re-tocar tokens si cambia después.

## 36. Pendientes
- Decisión de color de marca.
- QA visual en navegador (capturas en 8 anchos).
- Definir set de componentes base a crear.

## 37. Confirmaciones
- **No se aplicó rediseño** en esta tarea.
- No se cambió sidebar, landing, botones, colores ni fuentes.
- No hubo merge ni deploy. ELIHU intacto.

## 38. Conclusión
El rediseño previo es correcto pero **estructuralmente parcial**: cubre la capa global, no la
personalización local. El sistema necesita una **segunda ola de tokenización** (CSS por página +
`<style>` embebidos + estilos inline) y, antes, una **decisión de identidad de color**. Este
documento entrega el mapa completo, las matrices y el orden de ataque para esa ola.

---

## Matriz final de rutas (§17 obligatoria)

Estados: Nuevo consistente · Parcialmente nuevo · Viejo · Mezclado · Roto · No revisado.

| Ruta | Pantalla | Rol | Estado visual | Problema principal | Prioridad | Componentes a rediseñar |
|---|---|---|---|---|---|---|
| `/` | Landing | público | Parcialmente nuevo | gradientes restantes; identidad color | Media | secciones, CTA bands |
| `/login` | Login | público | Nuevo consistente | — | Baja | — |
| `/signup` | Signup | público | Viejo | `<style>` embebido, 16 grad. | Media | form, layout |
| `/onboarding` | Onboarding | auth | Viejo | `<style>` embebido, 23 grad. | Media | wizard |
| `/orden/:token` | ClientPortal | público | Viejo | 34 hex viejos, 34 grad. | Alta | portal cliente |
| `/mechanic` | Dashboard | mecánico | Parcialmente nuevo | `<style>` embebido, KPIs | Media | KPI cards |
| `/mechanic/new-order` | NewServiceOrder | mecánico | **Viejo/Mezclado** | `Segoe UI`, header oscuro, inline | **Alta** | wizard completo |
| `/mechanic/orders` | MechanicOrders | mecánico | Parcialmente nuevo | usa OrderCard | Baja | — |
| `/mechanic/order/:id` | OrderDetail | mecánico/admin | **Mezclado** | `OrderDetail.css` Inter, pagos inline | **Alta** | css+pagos+comisión |
| `/mechanic/quotations` | Quotations | mecánico | **Viejo** | `Quotations.css` Inter | **Alta** | css cotizaciones |
| `/mechanic/quotations/new` | NewQuotation | mecánico | Mezclado | conviven css viejo + .btn | Alta | form |
| `/mechanic/quotations/:id` | QuotationDetail | mecánico | Mezclado | 27 botones, inline | Alta | detalle |
| `/mechanic/clients` | ClientsList | mecánico | Parcialmente nuevo | 2 hex | Media | — |
| `/mechanic/appointments` | AppointmentCalendar | mecánico | Mezclado | 13 hex viejos, grad. | Media-Alta | calendario, modal |
| `/mechanic/history` | MechanicHistory | mecánico | Parcialmente nuevo | headers azul (alineado) | Media | — |
| `/mechanic/earnings` | MechanicEarnings | mecánico | Parcialmente nuevo | 1 hex | Baja | — |
| `/mechanic/requests` | MasterRequests | maestro | Mezclado | 16 inline | Media | cards |
| `/mechanic/auxiliaries` | AuxiliaryDashboard | maestro | Viejo | 46 inline | Media | dashboard |
| `/mechanic/my-requests` | MyRequests | auxiliar | Mezclado | 16 inline | Media | — |
| `/mechanic/my-payments` | AuxiliaryPayments | auxiliar | Mezclado | 20 inline | Media | pagos |
| `/mechanic/whatsapp` | WhatsAppConnect | maestro | Mezclado | 20 inline, grad. | Media | QR, estados |
| `/admin` | AdminDashboard | admin | Parcialmente nuevo | 4 hex | Media | KPIs |
| `/admin/orders` | AdminOrders | admin | Parcialmente nuevo | tabla | Media | tabla |
| `/admin/users` | AdminUsers | admin | Viejo | 60 hex, 18 grad. | Media-Alta | tabla, modales |
| `/admin/billing` | AdminBilling | admin | Viejo | 40 hex, 27 grad. | Media | cards |
| `/admin/referrals` | AdminReferrals | admin | Viejo | 37 hex, 27 grad. | Baja | — |
| `/admin/workspace` | AdminWorkspace | admin | Viejo | 23 hex, `<style>` | Media | form |
| `/admin/shop-qr` | AdminShopQR | admin | Viejo | `<style>` embebido | Baja | — |
| `/admin/integrations` | AdminIntegrations | admin | Viejo | 21 hex | Baja | — |
| `/admin/automations` | AdminAutomations | admin | Viejo | 18 grad. | Baja | — |
| `/admin/templates` | AdminTemplates | admin | Viejo | 12 hex | Baja | — |
| `/admin/tasks` | AdminTasks | admin | Viejo | 11 hex | Baja | — |
| `/admin/bot-health` | AdminBotHealth | admin | Viejo | consola oscura | Baja | — |
| `/admin/support*` | AdminSupport* | admin | Viejo | inline | Baja | — |
| `/admin/mechanics` | AdminMechanics | admin | Mezclado | 14 inline | Baja | — |
| `/admin/analytics` | AdminAnalytics | admin | Parcialmente nuevo | gráficas | Baja | — |
| `/super/*` | Super* (11) | super | Viejo | layout oscuro propio `#0b0f1a` | Baja | panel interno |
| `/blog`, `/casos*` | Blog/Cases | público | Viejo | `<style>` embebido | Baja | marketing |
| `/questions*` | Questions | PIN interno | Viejo | `#0f172a` propio | Baja | interno |
| `*` (404) | — | — | **No existe** | sin página 404 | Media | crear 404 |
