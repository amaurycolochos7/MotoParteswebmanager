# MotoPartes — Apple-Style Redesign · Reporte final

Rama: **`feature/apple-style-redesign`**
Stack: React 19 · Vite 7 · React Router 7 · **CSS plano global** (no Tailwind) · `lucide-react`.

---

## 1. Resumen ejecutivo

Se realizó una refactorización visual centralizada del frontend de MotoPartes hacia un
lenguaje visual premium inspirado en Apple (claro, espacioso, tipografía de sistema, pocas
sombras, acento azul único). El cambio es **estructural, no superficial**: se reescribió el
sistema de diseño global (tokens + componentes base en `index.css`), lo que **cascada a todo
el sistema** porque la app usa variables CSS (`var(--token)`, 423 usos) y clases semánticas
compartidas (`.btn`, `.card`, `.table`, `.modal`, `.badge`, `.sidebar`, `.kpi-card`) en 58
archivos. Encima de eso se rediseñaron a mano las superficies de mayor impacto: **shell
(sidebar claro + header móvil), Login y Landing**, y se alinearon acentos en páginas de
mecánico de alto tráfico.

**Build: PASS.** No se rompió funcionalidad (cambios sólo de estilo; sin tocar lógica, API,
rutas ni flujos). **Lint: 0 errores nuevos** (los 98 existentes son deuda previa en archivos
no tocados).

## 2. Problema visual inicial

Tema oscuro/genérico, sidebar `#111827` pesado, fuente Inter "de IA", acentos rojos con glows,
botones con gradientes y sombras de color exageradas, círculos decorativos en login, bordes
artificiales. Sensación de plantilla generada.

## 3. Objetivo del rediseño

SaaS premium, claro, limpio, mobile-first, con jerarquía tipográfica fuerte, superficies
blancas sobre lienzo fog `#f5f5f7`, azul `#0071e3` reservado para acciones, sin saturación.

## 4. Rutas auditadas

Inventario completo en `MOTOPARTES-APPLE-STYLE-REDESIGN-QA.md`. Resumen:
- **Públicas**: `/`, `/login`, `/signup`, `/onboarding`, `/orden/:token`, `/blog*`, `/casos*`.
- **Mecánico**: `/mechanic` y 15 subrutas (órdenes, cotizaciones, clientes, citas, historial,
  ganancias, solicitudes, auxiliares, pagos, whatsapp).
- **Admin**: `/admin` y ~20 subrutas.
- **Super-admin**: `/super` y ~11 subrutas.
- **Shell**: `AppLayout` (sidebar + drawer móvil), `ProtectedRoute`. `MobileNav.jsx` = código
  muerto (nunca renderizado).
- **Estilos**: `index.css` global (2624 → ~2980 líneas), más `Quotations.css`,
  `OrderDetail.css`, `WhatsAppSendModal.css` por página.
- **UI lib**: ninguna; CSS propio. **Iconos**: `lucide-react` (set único, moderno — se conserva).
- **Tailwind**: no existe.

## 5. Rutas / archivos modificados

| Archivo | Cambio |
|---|---|
| `src/index.css` | Tokens `:root` reescritos + capa "APPLE-STYLE REDESIGN LAYER" (~353 líneas). |
| `src/components/layout/AppLayout.jsx` | Chips de rol a tints claros (sidebar claro). |
| `src/pages/auth/Login.jsx` | Rediseño limpio completo. |
| `src/pages/public/Landing.jsx` | Retune de su sistema de variables `.mp-*` a paleta azure. |
| `src/pages/mechanic/AppointmentCalendar.jsx` | Azul `#2563eb`→`#0071e3`, `#1d4ed8`→`#0066cc`. |
| `src/pages/mechanic/NewServiceOrder.jsx` | Azul→azure. |
| `src/pages/mechanic/MechanicHistory.jsx` | Azul→azure. |
| `src/pages/mechanic/OrderDetail.jsx` | Info-icon a tokens. |

## 6. Componentes creados

Ninguno nuevo (decisión deliberada / "lazy senior": el sistema ya tenía clases base
reutilizables; crear componentes React nuevos habría requerido reescribir 58 archivos sin
beneficio). En su lugar se **re-especificó el sistema de clases base existente**, que es el
punto de apalancamiento real para consistencia global.

## 7. Componentes modificados (clases base)

Botones (todas las variantes + neutralización de gradientes ruidosos), Cards, KPI cards,
Inputs/Select/Textarea, Badges/Status, Tablas, Modales, Empty states, Sidebar, Nav items,
User menu, Page header, Tabs, Toasts, Spinner, Skeleton, Glassmorphism.

## 8. Tokens de diseño creados

Paleta canónica (`--color-ink/graphite/slate/ash/fog/snow/obsidian/silver-mist/azure/
cobalt-link/caution`), superficies (`--surface-canvas/card/recessed/dark`), escala de
espaciado 4px (`--space-4..--space-120`), escala tipográfica (`--text-caption..--text-display`),
radios (`--radius-sm/md/lg/xl/full/card/pill`), stack tipográfico de sistema
(`--font-display/--font-text`), sombras suaves, transiciones. **Los nombres legacy
(`--primary`, `--bg-body`, `--text-primary`, etc.) se preservaron y remapearon** para que los
423 usos existentes adopten el nuevo lenguaje sin tocar el markup.

## 9–16. Cambios por área

- **Layout**: lienzo `#f5f5f7`, contenido con padding `32px` (desktop) / `16–12px` (móvil).
- **Landing**: hero limpio, acento azure sólido, pills planos, sin glows rojos, fuente
  de sistema; mockup de WhatsApp conserva su verde auténtico `#00a884`.
- **Sidebar**: Opción A — claro `#ffffff`, items pill, activo en fog con icono azure, footer
  con perfil. Header móvil translúcido con blur.
- **Mobile nav**: drawer deslizante del sidebar + overlay con blur (el `MobileNav` bottom-bar
  no se usa en el shell actual).
- **Formularios**: labels 600, inputs radio 14px / 16px font (anti-zoom iOS), foco azure suave,
  errores legibles.
- **Tablas**: scroll horizontal **contenido** (no empuja la página), encabezados sutiles.
- **Modales**: radio 26px, overlay con blur, full-width móvil anclado abajo.
- **Dashboard**: KPI cards blancas sobre fog, números grandes, labels pequeños, sin saturación.

## 17. Cambios responsivos

`body { overflow-x:hidden }` + `*{min-width:0}` como red de seguridad anti-overflow; grids
apilan ≤768px; KPI a 1 columna; targets ≥44px; modales full-width móvil; landing con
`overflow-x: clip` y media queries propias por sección.

## 18–20. Pruebas / build / tests

- `npm install`: ✅
- `npm run build`: ✅ **PASS** (exit 0, 2078 módulos, CSS 92.95 kB, 17.8s).
- `npm run lint`: 98 errores **pre-existentes** (archivos no tocados); **0 nuevos**. Los
  hallazgos en mis archivos (`Login` `loading` sin usar, `Landing` `t`/setState-in-effect,
  `AppLayout` `isMechanic`/`hasPermission`) **ya existían** antes (sólo edité CSS/estilos).
- `prisma validate/generate`: **N/A** — no hubo cambios de backend ni de esquema.
- Tests de API: no aplican (cambios sólo de frontend visual).

## 21. Problemas encontrados / corregidos

Ver QA. Resumen: login plantilla→limpio; sidebar oscuro→claro; landing roja→azure; botones
gradiente→pills planos. Todos corregidos.

## 22. Pendientes reales

1. **QA visual humano** en 8 anchos (este entorno no renderiza navegador; no afirmo PASS visual).
2. **Deuda de estilos inline** (~600 `style={{}}` con hex en 58 archivos): la mayoría ya
   armoniza con la paleta; quedan headers con gradiente oscuro y tints sueltos para una 2ª
   pasada token-izándolos (no bloqueante, no rompe nada).
3. **Tabla→tarjeta por fila** en móvil necesita `data-label` en el markup (hoy: scroll contenido).

## 23. Riesgos

- Bajo. Cambios sólo de presentación; sin tocar lógica, estado, API, rutas ni datos.
- El riesgo principal es **estético** (algún tint inline residual fuera de tono), no funcional.
- Reversible al 100% (rama aislada; revertir = volver a `main`).

## 24. Flujos ELIHU — confirmación

No se modificó ningún archivo de lógica de negocio: cotización→orden, autorización, pagos/
abonos, saldo, comisión, fecha estimada, estados, recibos, PDF, WhatsApp y dashboard quedan
**intactos** (sólo cambió su apariencia vía tokens/clases). El build compila todos esos módulos
sin error.

## 25. Build / rama / deploy

- **Build**: PASS.
- **Rama**: `feature/apple-style-redesign`.
- **Commit**: ver salida de `git log` (incluido en la entrega).
- **Deploy**: **NO ejecutado a producción.** Razón de seguridad (ver §26).

## 26. Deploy — runbook (gated)

Producción (`motopartes.cloud`) corre en **Dokploy con git-sync desde `main`**: hacer push a
`main` dispara build+deploy en el VPS. Por política de seguridad **no se hace push directo a
`main` ni deploy a producción sin confirmación humana**, y porque **un rediseño visual no debe
ir a producción sin QA visual previo** (el build pasa, pero "compila" ≠ "se ve bien").

Pasos para desplegar de forma segura cuando se apruebe:

1. **Revisión local**: `cd apps/frontend && npm run dev`, validar los 8 anchos y consola limpia.
2. **PR**: `feature/apple-style-redesign` → `main` en GitHub
   (`https://github.com/amaurycolochos7/MotoParteswebmanager`), revisar diff.
3. **Merge a `main`** (tras aprobación). Dokploy sincroniza y reconstruye el contenedor del
   frontend automáticamente.
4. **Sin migración**: no hay cambios de DB → no se requiere backup ni `prisma migrate`.
5. **Verificación post-deploy** (humano): landing carga, login carga, dashboard, sidebar, menú
   móvil, cotizaciones, órdenes, clientes, detalle de orden, pagos/saldo; sin pantalla blanca,
   sin 500, consola sin errores críticos, responsive correcto en móvil.

> Las API keys de VPS/Dokploy provistas se tratan como secretos; no se usaron para empujar
> cambios a producción sin confirmación, conforme a la política de seguridad.
