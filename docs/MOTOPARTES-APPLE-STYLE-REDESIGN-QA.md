# MotoPartes — Apple-Style Redesign · QA visual

Rama: `feature/apple-style-redesign`
Build: `npm run build` → **PASS** (vite 7.3.2, 2078 módulos, `dist/assets/*.css` 92.95 kB).

## Cómo leer esta tabla

- **Code/Build**: verificado por mí — el código compila y la regla de estilo aplica
  por cascada de tokens/clases globales. ✅ = aplicado y compila.
- **Desktop / Tablet / Mobile (visual)**: **PENDIENTE de revisión humana en navegador**.
  Este entorno no renderiza el navegador, así que NO afirmo "PASS" visual de algo que no
  pude ver. La columna marca qué reglas responsivas existen en CSS y deben confirmarse a ojo.

Anchos a verificar manualmente: **320 · 360 · 390 · 430 · 768 · 1024 · 1280 · 1440**.

---

## Rutas auditadas (mapa real del proyecto)

### Públicas
| Ruta | Componente | Code/Build | Notas |
|---|---|---|---|
| `/` (no auth) | `pages/public/Landing.jsx` | ✅ | Retune completo a paleta azure + tipografía sistema, pills, sin glows rojos. Mobile-first ya existente. |
| `/login` | `pages/auth/Login.jsx` | ✅ | Rediseño limpio: sin círculos decorativos, CTA pill azure, foco azure. |
| `/signup` | `pages/auth/Signup.jsx` | ⚠️ cascada | Hereda tokens/clases globales (inputs, botones). No reescrito a mano. |
| `/onboarding` | `pages/auth/Onboarding.jsx` | ⚠️ cascada | Idem. |
| `/orden/:token` | `pages/public/ClientPortal.jsx` | ⚠️ cascada | Portal cliente; hereda tokens. |
| `/blog`, `/casos`, ... | `pages/public/*` | ⚠️ cascada | Heredan tokens. |

### Mecánico (`/mechanic/*`)
| Ruta | Componente | Code/Build | Notas |
|---|---|---|---|
| `/mechanic` | `MechanicDashboard.jsx` | ✅ cascada | KPI/cards/botones por tokens. Ink local `#0F172A` ≈ nuevo ink. |
| `/mechanic/new-order` | `NewServiceOrder.jsx` | ✅ cascada + swap azul | Flujo crear orden; azul alineado a azure. |
| `/mechanic/orders` | `MechanicOrders.jsx` | ✅ cascada | Order cards por tokens. |
| `/mechanic/order/:id` | `OrderDetail.jsx` | ✅ cascada + tokens | Header/cards/pagos por tokens; info-icon a tokens. |
| `/mechanic/quotations` | `Quotations.jsx` (+`.css`) | ✅ cascada | Usa `Quotations.css` propio. |
| `/mechanic/quotations/new` | `NewQuotation.jsx` | ✅ cascada | Hereda inputs/botones. |
| `/mechanic/quotations/:id` | `QuotationDetail.jsx` | ✅ cascada | Idem. |
| `/mechanic/clients` | `ClientsList.jsx` | ✅ cascada | Client cards + búsqueda por tokens. |
| `/mechanic/appointments` | `AppointmentCalendar.jsx` | ✅ cascada + swap azul | Badges/gradientes alineados a azure/cobalt. |
| `/mechanic/history` | `MechanicHistory.jsx` | ✅ cascada + swap azul | Headers alineados a azure. |
| `/mechanic/earnings` | `MechanicEarnings.jsx` | ✅ cascada | KPIs por tokens. |
| `/mechanic/requests` | `MasterRequests.jsx` | ✅ cascada | |
| `/mechanic/auxiliaries` | `AuxiliaryDashboard.jsx` | ✅ cascada | |
| `/mechanic/my-requests` | `MyRequests.jsx` | ✅ cascada | |
| `/mechanic/my-payments` | `AuxiliaryPayments.jsx` | ✅ cascada | |
| `/mechanic/whatsapp` | `WhatsAppConnect.jsx` | ✅ cascada | Conectar Bot. |

### Admin (`/admin/*`)
Dashboard, Orders, Clients, Users, Mechanics, Analytics, Workspace, Billing,
Automations, Templates, Tasks, BotHealth, Referrals, ShopQR, Integrations, Support.
→ Todas ✅ **cascada**: heredan tokens + clases base (`.btn`, `.card`, `.table`, `.modal`,
`.badge`, `.kpi-card`, sidebar claro). No reescritas a mano una por una.

### Super-admin (`/super/*`)
Layout propio + Dashboard/Workspaces/Tickets/Users/Audit/Payouts/Canned/Billing/Settings.
→ ✅ **cascada** (tokens). Panel interno, menor prioridad visual.

### Shell compartido
| Componente | Code/Build | Notas |
|---|---|---|
| `components/layout/AppLayout.jsx` | ✅ | Sidebar **claro** (Opción A), header móvil con blur, chips de rol en tints claros. Drawer móvil = sidebar deslizante. |
| `components/layout/ProtectedRoute.jsx` | n/a | Sin cambios visuales. |
| `components/layout/MobileNav.jsx` | n/a | **Código muerto** (nunca se renderiza). No tocado. |
| `components/layout/TopBar.jsx` | ⚠️ cascada | No montado en AppLayout actual. |

---

## Checklist de componentes base (verificado en CSS)

| Componente | Regla aplicada | Code/Build |
|---|---|---|
| Tokens de color | `:root` remapeado a paleta Apple, nombres legacy preservados | ✅ |
| Tipografía | Stack de sistema (sin Inter), headings `letter-spacing -0.022em` | ✅ |
| Botones | Pill `999px`, `min-height 44px`, variantes primary/secondary/ghost/danger/success | ✅ |
| Botones legacy ruidosos | `.btn-new-order/.btn-finish/.btn-payment/.btn-gradient` aplanados a pill azure/verde | ✅ |
| Cards | Radio `22px`, sin sombra dura, borde suave | ✅ |
| Inputs/select/textarea | Radio `14px`, `font-size 16px` (anti-zoom iOS), foco azure suave | ✅ |
| Badges/estado | Fondos en tints suaves, texto legible, sin mayúsculas forzadas | ✅ |
| Tablas | Scroll contenido (sin overflow de página), th sutil | ✅ |
| Modales | Radio `26px`, overlay con blur, full-width en móvil anclado abajo | ✅ |
| Empty states | Iconos suaves, títulos ink | ✅ |
| Sidebar | Claro, items pill `44px`, activo en fog, icono activo azure | ✅ |
| Foco accesible | `:focus-visible` azul global | ✅ |
| Motion | Transiciones `100/200ms`, `prefers-reduced-motion` respetado | ✅ |

---

## Responsividad (reglas presentes — confirmar a ojo)

| Garantía | Mecanismo en CSS | Code/Build | Visual |
|---|---|---|---|
| Sin overflow horizontal | `body { overflow-x: hidden }` + `*{min-width:0}` + tablas con scroll contenido + landing `overflow-x: clip` | ✅ | PENDIENTE |
| Targets táctiles ≥44px | `.btn`, `.nav-item` `min-height: 44–46px` | ✅ | PENDIENTE |
| Grids apilan en móvil | `.grid-2/3/4`, `.kpi-grid` → `1fr` ≤768px | ✅ | PENDIENTE |
| Modales móvil | full-width, anclado abajo ≤480px | ✅ | PENDIENTE |
| Inputs sin zoom iOS | `font-size: 16px` | ✅ | PENDIENTE |
| Nav móvil | drawer del sidebar en AppLayout, overlay con blur | ✅ | PENDIENTE |

---

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| `npm install` | ✅ up to date |
| `npm run build` | ✅ PASS (exit 0) |
| `npm run lint` | ⚠️ 98 errores **pre-existentes** en archivos NO tocados; **0 nuevos** introducidos por el rediseño |
| Pruebas manuales (login, dashboard, cotización, orden, pagos, cliente, menú móvil, landing) | **PENDIENTE** (requiere navegador / entorno corriendo) |
| Revisión consola navegador | **PENDIENTE** |

---

## Problemas encontrados / corregidos

- **Encontrado**: Login con look "plantilla IA" (círculos gradiente, sombra negra fuerte,
  botón gradiente oscuro, acento rojo). **Corregido**: limpio, pill azure, sin decoraciones.
- **Encontrado**: Sidebar oscuro `#111827` anticuado. **Corregido**: sidebar claro Opción A.
- **Encontrado**: Landing con acento rojo + glows + fuente Inter. **Corregido**: azure, sistema, pills planos.
- **Encontrado**: Botones globales con gradientes y sombras de color exageradas. **Corregido**: pills planos por token.

## Pendientes reales

- QA visual humano en los 8 anchos (este entorno no renderiza navegador).
- Deuda de estilos inline: ~600 `style={{}}` con hex hardcodeados en 58 archivos. La mayoría
  ya cae bien con la nueva paleta, pero algunos headers con gradiente oscuro y tints sueltos
  conviene migrarlos a tokens en una segunda pasada (no bloqueante).
- Conversión tabla→tarjeta por fila en móvil requiere `data-label` en el markup de cada tabla
  (hoy se garantiza scroll contenido, que evita overflow de página).
