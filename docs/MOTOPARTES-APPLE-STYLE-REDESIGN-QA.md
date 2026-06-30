# MotoPartes — QA visual · Redesign alineado a marca (rojo)

Build: **PASS** (`npm run build`, exit 0). Lint: 0 errores nuevos.
**Limitación:** sin navegador en este entorno → no hay capturas; QA visual en los 8 anchos
queda **NEEDS_REVIEW** (validación humana). El estado refleja verificación por código + build.

Estados: PASS · FAIL · BLOCKED · NEEDS_REVIEW.

| Ruta | Desktop | Tablet | Mobile | Estado visual | Problemas | Resultado |
|---|---|---|---|---|---|---|
| `/` Landing | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | Nuevo (rojo marca) | bandas en gradiente (acento) | NEEDS_REVIEW |
| `/login` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | Nuevo | — | NEEDS_REVIEW |
| `/signup` | NEEDS_REVIEW | — | NEEDS_REVIEW | **Viejo** (pendiente) | `<style>` slate | NEEDS_REVIEW |
| `/onboarding` | NEEDS_REVIEW | — | NEEDS_REVIEW | **Viejo** (pendiente) | `<style>` slate | NEEDS_REVIEW |
| `/mechanic` dashboard | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | Parcial (token + acento rojo) | KPIs por revisar | NEEDS_REVIEW |
| `/mechanic/new-order` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | **Nuevo** (header oscuro eliminado, total rojo) | revisar wizard móvil | NEEDS_REVIEW |
| `/mechanic/orders` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | Nuevo (OrderCard) | — | NEEDS_REVIEW |
| `/mechanic/order/:id` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | **Nuevo** (OrderDetail.css migrado) | revisar pagos/comisión | NEEDS_REVIEW |
| `/mechanic/quotations` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | **Nuevo** (Quotations.css migrado) | — | NEEDS_REVIEW |
| `/mechanic/quotations/new` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | Nuevo | — | NEEDS_REVIEW |
| `/mechanic/quotations/:id` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | Nuevo | — | NEEDS_REVIEW |
| `/mechanic/clients` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | Nuevo | — | NEEDS_REVIEW |
| `/mechanic/appointments` | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | Parcial (acento rojo) | calendario móvil | NEEDS_REVIEW |
| Pagos y saldo (OrderPaymentsSection) | NEEDS_REVIEW | — | NEEDS_REVIEW | Parcial (tokens + inline) | inline restante | NEEDS_REVIEW |
| Comisión (CommissionSection) | NEEDS_REVIEW | — | NEEDS_REVIEW | Parcial | inline restante | NEEDS_REVIEW |
| WhatsApp modal | NEEDS_REVIEW | — | NEEDS_REVIEW | Nuevo (CSS migrado) | — | NEEDS_REVIEW |
| `/mechanic/auxiliaries` | NEEDS_REVIEW | — | NEEDS_REVIEW | **Viejo** (pendiente) | 46 inline | NEEDS_REVIEW |
| `/admin` dashboard | NEEDS_REVIEW | — | NEEDS_REVIEW | Parcial | KPIs token | NEEDS_REVIEW |
| `/admin/users` | NEEDS_REVIEW | — | NEEDS_REVIEW | **Viejo** (pendiente) | `<style>` slate | NEEDS_REVIEW |
| `/admin/orders` | NEEDS_REVIEW | — | NEEDS_REVIEW | Parcial | tabla | NEEDS_REVIEW |
| `/super/*` | NEEDS_REVIEW | — | NEEDS_REVIEW | **Viejo** (pendiente) | layout oscuro propio | NEEDS_REVIEW |
| `/questions` | NEEDS_REVIEW | — | NEEDS_REVIEW | **Viejo** (pendiente) | propio `#0f172a` | NEEDS_REVIEW |
| `/orden/:token` portal | NEEDS_REVIEW | — | NEEDS_REVIEW | **Viejo** (pendiente) | inline | NEEDS_REVIEW |
| `*` 404 | NEEDS_REVIEW | NEEDS_REVIEW | NEEDS_REVIEW | **Nuevo** (creada) | — | NEEDS_REVIEW |

## Smoke verificable por build
- Compila: PASS. Rutas resuelven (router intacto). 404 ahora renderiza página diseñada.
- Identidad de color: rojo de marca aplicado a tokens globales + landing + login + flujo orden.
- `Inter` eliminado de CSS de UI (0). Los 3 CSS por pantalla migrados a tokens.

## Segunda ola aplicada (codemod de paleta)
Las filas marcadas antes como **Viejo (pendiente)** (admin/*, super/*, questions/*, Onboarding,
Signup, ClientPortal, Blog, Cases) recibieron el codemod de paleta (753 reemplazos, 54 archivos):
slate/azul viejo → neutrales de marca + rojo. Su estado pasa de **Viejo** a **Parcial/Nuevo**
(tono de marca correcto; quedan estilos inline estructurales menores). Build re-verificado: PASS.

## Pendiente de QA humano (8 anchos: 320/360/390/430/768/1024/1280/1440)
Foco: crear orden, crear cotización, registrar pago, buscar cliente, cambiar estado (móvil).
