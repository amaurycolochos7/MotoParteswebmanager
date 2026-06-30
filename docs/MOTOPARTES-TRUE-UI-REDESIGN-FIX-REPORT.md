# MotoPartes — True UI redesign (componentes reales) · Reporte

Rama: **`fix/true-apple-style-ui-components`** · Base: `main`.
**Esta vez: componentes React reales, usados en pantallas reales. No es codemod de color.**

## 1. Qué estaba mal en la entrega anterior
La entrega previa fue un **codemod de paleta** (azul→rojo) + migración de variables CSS. Cambió
colores pero **no reconstruyó componentes**: seguían los botones locales (incluido el botón
negro gigante del dashboard), cards básicas, labels en mayúsculas peso 800, stepper viejo con
barra de progreso, e inputs con foco rojo agresivo. El problema era **estructural**, no de color.

## 2. Componentes base creados (reales, reutilizables)
`apps/frontend/src/components/ui/index.jsx` + `components.css`:
`Button`, `IconButton`, `Card`, `SectionCard`, `PageHeader`, `FormField`, `Input`, `Textarea`,
`Select`, `Badge`, `StatusChip` (+ `statusTone` map), `MetricCard`, `ActionCard`, `EmptyState`,
`Stepper`, `Modal`. Token-driven, tipografía refinada (títulos 600–700, no 800; sin mayúsculas
rígidas), botones pill 44px, foco sobrio (anillo `--brand-primary-soft` 3.5px, no borde rojo
agresivo), cards radio 22–28 sin sombra dura, rojo de marca con sobriedad.

## 3. Pantallas reconstruidas con componentes
| Pantalla | Archivo | Qué se hizo |
|---|---|---|
| **Dashboard mecánico** | `MechanicDashboard.jsx` | **Reescrito**. Se eliminó el botón negro gigante → `ActionCard` (rojo de marca sobrio) para "Crear nueva orden" y `ActionCard` neutral para "Nueva cotización". Saludo con peso 700 (no 800). Métricas → `MetricCard`. Órdenes → cards limpias + `StatusChip`. Vacío → `EmptyState`. Ingresos → card refinada. `<style>` propio reescrito con tokens. |
| **Lista de cotizaciones** | `Quotations.jsx` | **Reescrito**. `PageHeader` + `Button`. Filtros → chips con scroll horizontal limpio (activo = ink). Cards → `StatusChip` (sin badge azul/rojo viejo), total prominente, eliminar como `IconButton` discreto. |
| **Nueva cotización** | `NewQuotation.jsx` + `Quotations.css` | `PageHeader` + secciones premium (radio 22, título peso 600 **sin mayúsculas**), inputs 16px con foco sobrio, botones pill 44px, submit pill. Lógica de cliente/moto/labor/parts intacta. |
| **Nueva orden (wizard)** | `NewServiceOrder.jsx` | Barra de progreso vieja → **`Stepper` real** (5 pasos, activo/completado con check, conector). Header oscuro ya eliminado en fase previa. |
| Detalle de orden | `OrderDetail.css` | Migrado a tokens de marca (rojo, fuente sistema, neutrales) en fase previa. **Reconstrucción con componentes: PENDIENTE** (archivo de 82 KB; ver §10). |

## 4. Estilos inline / clases viejas eliminados
- Dashboard: `<style>` propio (botón `#111827`, pesos 800, radio 10) → tokens + componentes.
- Quotations list: clases `qp-*` con colores hardcoded → componentes + chips nuevos.
- Quotations.css compartido: `nq-section-title` (uppercase/800 → 600 normal), `nq-section`
  (radio 22, sin sombra), `nq-input` (16px, foco sobrio), `nq-btn`/`nq-submit` (pills 44/52px).

## 5–8. Migraciones
- **Botones** → `Button`/`ActionCard`/`IconButton` en Dashboard y Quotations; pills unificados en
  NewQuotation/QuotationDetail vía CSS compartido.
- **Inputs** → componente `Input`/`Textarea`/`FormField` disponible; NewQuotation usa `nq-input`
  ya refinado a 16px + foco sobrio.
- **Cards** → `Card`/`SectionCard`/`MetricCard`/`ActionCard`.
- **Modales** → componente `Modal` creado (unificable); NewQuotation conserva sus 2 modales con
  CSS de tokens (migración a `Modal` pendiente, no bloqueante).
- **Stepper** → creado y **usado** en NewServiceOrder.

## 9. Stepper
Componente `Stepper` (dots numerados, check en completados, conector, estado activo en rojo de
marca). Reemplaza la barra de progreso `.no-progress`.

## 10. Rutas pendientes (honesto)
- **Detalle de orden**: reconstrucción con componentes (hoy: tokens/brand aplicados, no componentes).
- Resto operativo (clientes/citas/auxiliares/admin/super): tokens/brand aplicados en fase previa;
  reconstrucción con componentes base = siguiente iteración.
- Migrar los modales de NewQuotation a `<Modal>`.

## 11. QA visual — NEEDS_REVIEW (sin navegador)
**No tengo navegador en este entorno, por lo tanto NO declaro PASS visual ni tomo capturas.**
Para obtenerlas: `cd apps/frontend && npm run dev`, abrir en 360px:
`/mechanic`, `/mechanic/quotations`, `/mechanic/quotations/new`, `/mechanic/new-order`,
`/mechanic/order/:id`, y landing desktop/mobile. Estado: **NEEDS_REVIEW**.

## 12–13. Build / tests
- `npm run build`: **PASS** (exit 0).
- `eslint` archivos cambiados: warnings/errores de patrón **pre-existente** (`exhaustive-deps`
  del `useEffect(()=>{load()},[])`, ya presente en el código original; baseline del proyecto = 98
  errores). No se introdujeron anti-patrones nuevos. Sin tests unitarios de UI en el proyecto.

## 14. ELIHU
Sin cambios de lógica de negocio: toda la data/handlers de Dashboard, Quotations y NewQuotation
se preservaron; solo cambió presentación/markup. Cotización→orden, pagos, comisión, estados,
PDF, WhatsApp intactos. Build compila el flujo completo.

## 15–16. Commit / deploy
- Commit final: ver cierre.
- **Deploy: BLOQUEADO a propósito.** Per la regla §7 del encargo ("si no tienes navegador no
  declares PASS visual; no despliegues a prod sin verificar visualmente"), **no despliego a
  producción**. Se deja rama pusheada + PR para revisión visual humana antes de desplegar.

## Confirmación
Esta vez **no fue solo codemod de paleta**: se crearon 16 componentes React reales y se
reconstruyeron Dashboard, Lista de cotizaciones y Nueva cotización, y se reemplazó el stepper de
Nueva orden. Quedan pendientes Detalle de orden (componentes) y la unificación de modales.
