# MotoPartes — Apple-Style Redesign (alineado a marca) · Reporte final

Rama: **`feature/full-apple-style-ui-redesign`** · Base: `main` (@ `ca9092b`).
Auditoría base: `docs/MOTOPARTES-FULL-UI-ROUTE-AUDIT.md` (commit `9baa49e`).

## 1. Resumen ejecutivo
Esta fase corrige el problema central que señaló la auditoría y el usuario: **la identidad de
color estaba equivocada** (azul tipo Apple, que no es la marca). Se extrajo la identidad del
**logo real** y se re-tematizó el sistema. Además se migraron los **3 archivos CSS por pantalla
viejos** a tokens, se eliminó el **header oscuro de "crear orden"**, y se creó la **página 404**.

**Build: PASS. Lint: 0 errores nuevos. ELIHU intacto (solo cambios de presentación).**

## 2. Problema inicial
Azules genéricos (`#0071e3` del rediseño previo + `#2563eb` viejos) que no combinan con el logo;
3 CSS por pantalla con fuente `Inter` y paleta slate/azul; header oscuro en crear orden.

## 3. Decisión de color de marca (crítica)
El logo `public/logo.png` es un emblema **negro** con "MOTO" en blanco y **"PARTES" en rojo**,
llaves cruzadas y cadena. Identidad = **negro + rojo + blanco**. Por tanto:
- **Acento principal de marca = rojo refinado `#d71920`** (hover `#b3141a`, dark `#a90f16`, soft `#fde7e8`).
- Texto/ink negro `#1d1d1f`; lienzo fog `#f5f5f7`; tarjetas `#fff`; bordes `#e8e8ed`.
- **Se eliminó el azul como color de marca.** `--info` y `--status-registered` pasaron a un
  slate neutro `#475467` (no son rojo, para no usar el rojo con 3 significados distintos).
- Verde/ámbar se conservan solo como semánticos (éxito/advertencia); WhatsApp conserva su verde
  auténtico `#25d366`.

## 4. Tokens definidos
`index.css :root` ahora incluye `--brand-primary*`, `--color-brand*`, neutrales (`--color-ink/
graphite/slate/ash/fog/snow/border`), superficies, escala 4px, escala tipográfica, radios
(`--radius-card 22 / input 14 / button 999`), motion, stack de fuente de sistema. Los nombres
legacy (`--primary`, `--bg-*`, `--text-*`, etc.) siguen mapeados → cascada automática.

## 5. Qué se rediseñó en esta fase
| Área | Cambio | Estado |
|---|---|---|
| **Identidad de color (global)** | azul → **rojo de marca** en todos los tokens; rings/selección/rgba | ✅ |
| **Landing** | acento a rojo de marca, glows y tints a rojo, pills planos, fuente sistema | ✅ |
| **Login** | focus ring rojo de marca, CTA usa `--primary` (rojo) | ✅ |
| **Sidebar / shell** | claro, item activo con icono rojo de marca (vía token) | ✅ |
| **Quotations.css** | migrado a tokens; **Inter eliminado**; azul→ink; slate→neutrales | ✅ |
| **OrderDetail.css** | migrado a tokens; **Inter eliminado**; azul→ink; slate→neutrales | ✅ |
| **WhatsAppSendModal.css** | info-azul → slate neutro; verde WA conservado | ✅ |
| **Crear orden (NewServiceOrder)** | header oscuro eliminado → superficie clara; total azul→rojo de marca; gradiente de tarjeta aplanado; colores de estado a tokens; azules→rojo | ✅ |
| **Citas / Historial** | acentos azul→rojo de marca | ✅ |
| **404** | nueva página `NotFound.jsx` con marca; ruta `*` la renderiza | ✅ |

## 6. Conteo antes/después (medido con grep reproducible)
| Métrica | Antes (auditoría) | Después | Nota |
|---|---:|---:|---|
| `Inter` hardcodeado en CSS de UI | 3 archivos | **0** | eliminado por completo |
| CSS por pantalla viejo (crítico) | 3 (`Quotations/OrderDetail/WhatsAppSendModal`) | **0** (migrados a tokens) | |
| Gradientes (UI total) | 141 | 138 | se quitaron los del flujo de negocio; restan bandas de landing + plantillas PDF |
| Paleta vieja (incluye semánticos rojo/verde) | 731 | 718 | el grueso restante está en Prioridad 3–5 (ver §9) y en rojos/verdes **semánticos legítimos** |
| Azul de marca `#0071e3`/`#2563eb` mal aplicado | múltiple | **0 como color de marca** | el azul ya no es identidad |

> Nota honesta: el conteo de "paleta vieja" incluye `#dc2626/#ef4444/#16a34a/#22c55e` que en
> muchos archivos son **estados semánticos correctos** (danger/success), no errores de marca. La
> reducción "dura" relevante (Inter, azul de marca, CSS por pantalla, header oscuro) está hecha.

## 7. Pruebas ejecutadas
- `npm run build` → **PASS** (exit 0; `dist/assets/index-DgzqYixa.css` 93.55 kB; `index-DKFfkxcW.js`).
- `npx eslint` sobre archivos nuevos/cambiados (`NotFound.jsx`, `App.jsx`) → **sin errores**.
- Lint global: 98 errores **pre-existentes** en archivos no tocados; **0 nuevos**.
- API/Prisma: **N/A** (sin cambios de backend ni esquema).
- QA visual en navegador: **no disponible** (entorno sin navegador); verificación por build +
  análisis + smoke en producción de bundles servidos.

## 8. Riesgos
- Bajo: cambios de presentación. Sin tocar lógica/estado/API/rutas de negocio.
- El rojo de marca y el `--danger` son ambos rojos; se diferenció `--danger` (`#c81e0f`) del
  brand (`#d71920`) y se apoya en contexto/íconos. Revisión visual recomendada.

## 9. Pendientes reales (siguiente ola — Prioridad 3–5 de la auditoría)
La identidad y el flujo de negocio principal están alineados. **Queda pendiente la tokenización
profunda por página** (estilos inline + `<style>` embebidos con slate viejo) en:
- `admin/*` (Billing, Referrals, Users, Workspace, ShopQR, Automations, Templates, Tasks, Support…),
- `super/*` (layout oscuro propio `#0b0f1a`),
- `questions/*`,
- público de marketing (`Onboarding`, `Signup`, `ClientPortal`, `Blog`, `Cases`).
- Crear **componentes React base** (`Button/Input/Modal/Stepper/StatusChip/EmptyState/PageHeader`)
  y reemplazar las ~696 instancias inline / 460 botones. En esta fase se consolidó a nivel de
  **clases globales + tokens** (no se introdujo aún la capa de componentes React, para no
  reescribir 66 archivos sin verificación visual).

Esto es trabajo de alto volumen (~30 archivos grandes) que requiere QA visual en navegador; se
recomienda hacerlo por flujo y validando a ojo.

## 10. Confirmación ELIHU
No se modificó lógica de negocio: cotización→orden, autorización, pagos/abonos, saldo, comisión,
fecha estimada, estados, recibos, PDF, WhatsApp y dashboard intactos. El build compila todos.

## 11. Entrega
- Rama: `feature/full-apple-style-ui-redesign`.
- Commit final / push / deploy: ver §siguiente y el cierre del chat.
