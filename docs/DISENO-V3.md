# Diseño V3: limpio, claro y responsivo (reemplaza el tema "industrial" de V2)

El usuario rechazó el diseño V2: "se ve feo la fuente y colores, el logo se ve mal, no es responsivo, hay celdas fuera de los cuadros de texto, inaceptable". Este documento fija el criterio para TODAS las pantallas.

## Dirección
Panel de trabajo moderno, claro y sobrio (estilo producto SaaS profesional: Linear / Stripe / Notion, no "editorial"). Mucho aire, jerarquía clara, pocas decoraciones. La marca (rojo + negro) aparece como ACENTO, no como fondo.

## Tokens (definir una sola vez en `src/styles/theme.css`, que reemplaza a los de V2)
- Fondo de la app `--bg: #f6f7f9`; superficie (tarjetas, sidebar, topbar) `--surface: #ffffff`; superficie suave `--surface-2: #f1f3f6`.
- Bordes `--line: #e4e7ec`; borde fuerte `--line-strong: #cfd4dc`.
- Texto `--text: #101828`; secundario `--text-2: #475467`; apagado `--text-3: #98a2b3`.
- Marca `--brand: #d92d20` (rojo), hover `#b42318`, fondo tenue `--brand-50: #fef3f2`, borde tenue `--brand-200: #fecdca`.
- Estados: éxito `#067647` / fondo `#ecfdf3`; aviso `#b54708` / `#fffaeb`; error `#b42318` / `#fef3f2`; info `#175cd3` / `#eff8ff`.
- Radios: controles 10 px, tarjetas 14 px, chips 999 px. Sombras SUAVES: `0 1px 2px rgba(16,24,40,.06)` y para elevadas `0 8px 24px rgba(16,24,40,.08)`. PROHIBIDAS las sombras duras con desplazamiento y los bordes gruesos.
- Espaciado en escala de 4 px (4, 8, 12, 16, 20, 24, 32, 40).

## Tipografía
- UNA sola familia: **Inter** (Google Fonts, pesos 400/500/600/700) con `font-feature-settings: "tnum"` solo para cifras/dinero (`.tnum`). Sin Barlow Condensed, sin Instrument Sans, sin JetBrains Mono, SIN mayúsculas forzadas en títulos ni etiquetas (quitar `text-transform: uppercase` y `letter-spacing` amplio).
- Escala: título de página 24/28 px 700 (20/24 en móvil); título de sección 16/24 600; texto 14/20 400; secundario 13/18; micro 12/16. Interlineado cómodo. Quitar la letra "de máquina de escribir" de folios (usar Inter 600 con tnum).
- Mínimo 14 px en texto de lectura y 16 px en inputs (evita el zoom en iOS).

## Estructura (shell)
- **Sidebar CLARO** (blanco, borde derecho `--line`), ancho 248 px en escritorio, colapsa a **cajón** (drawer) bajo 1024 px con botón de menú en la barra superior. Grupos plegables con títulos pequeños en `--text-3` (13 px, 600, sin mayúsculas forzadas). Ítem activo: fondo `--brand-50`, texto `--brand`, indicador sutil; hover `--surface-2`. Íconos lucide 18 px.
- **Logo**: el archivo `public/logo-motopartes.png` es cuadrado con muchísimo margen blanco; NO usarlo tal cual ni dentro de una cajita. Generar versiones recortadas al emblema (`public/logo-mark.png` recortada sin margen, y si conviene `public/logo-mark@2x.png`; sharp/PIL, o recorte por CSS solo como último recurso) y usarlas sobre fondo BLANCO (sidebar claro, login, topbar móvil) con alto 40 px en sidebar y 32 px en móvil, nunca deformado. Texto "MotoPartes" opcional al lado en Inter 700. Favicon sin cambios.
- **Topbar**: blanca, 56 px, altura fija; título de página a la izquierda en móvil, campanita (con contador y la animación sutil actual) y avatar/menú a la derecha. Sticky.
- Contenido: `max-width: 1280px` centrado, padding 24 px (16 px en móvil), `gap` entre bloques 16–24 px. Layouts de 2 columnas (CSS grid) solo desde 1024 px; por debajo, una columna.

## Componentes (en `src/components/ui/kit.jsx` + `src/styles/primitives.css`; mismos nombres de clase `k-*` para no romper pantallas)
- Botón primario relleno `--brand`, secundario con borde `--line-strong` fondo blanco, terciario sin borde, destructivo en rojo tenue; alto 40 px (44 px táctil en móvil), radio 10 px, foco visible con anillo `0 0 0 3px var(--brand-200)`.
- Inputs/select/textarea: alto 40 px, borde `--line-strong`, fondo blanco, radio 10 px, `width: 100%`, `min-width: 0`, `box-sizing: border-box`; foco con borde `--brand` + anillo. Etiquetas 13 px 500 `--text-2` encima. Mensajes de error 13 px en rojo.
- Tarjeta: fondo blanco, borde 1 px `--line`, radio 14 px, sombra suave, padding 16–20 px. Tablas/listas con filas separadas por línea fina, sin cebra, con cabecera 12 px `--text-3` 600 (SIN mayúsculas forzadas).
- Chips/insignias 12–13 px, 500, radio 999, colores de estado suaves (fondo tenue + texto fuerte).
- Estados vacío (ícono suave + frase + acción), cargando (skeleton), error (aviso con reintentar).

## Responsivo (OBLIGATORIO en cada pantalla)
Verificar a **360, 390, 768, 1024 y 1440 px** de ancho. Reglas: `box-sizing: border-box` global; todo hijo de flex/grid con `min-width: 0`; textos largos con `overflow-wrap: anywhere` o truncado con `text-overflow: ellipsis` solo donde sea intencional; imágenes `max-width: 100%`; tablas anchas dentro de un contenedor con scroll horizontal PROPIO (no de la página) o convertidas a tarjetas en móvil; ningún elemento puede salirse de su tarjeta ni provocar scroll horizontal de la página. Botones y filas táctiles de al menos 44 px. Modales/cajones a pantalla completa en móvil, con cierre claro.

## Detector de desbordes (úsalo con `javascript_tool` en CADA pantalla y ancho; el resultado debe ser vacío)
```js
(() => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push('PAGINA con scroll horizontal: ' + document.documentElement.scrollWidth + ' > ' + vw);
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[aria-hidden="true"], [hidden]')) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const p = el.parentElement; if (!p) return;
    const pr = p.getBoundingClientRect(); const pcs = getComputedStyle(p);
    const clips = /(auto|scroll|hidden|clip)/.test(pcs.overflowX);
    if (!clips && (r.right > pr.right + 1 || r.left < pr.left - 1) && pr.width > 0 && cs.position !== 'fixed' && cs.position !== 'absolute')
      out.push('FUERA DEL PADRE: ' + el.tagName + '.' + String(el.className).slice(0, 40) + ' (' + Math.round(r.right - pr.right) + 'px)');
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === 'visible' && el.children.length === 0 && el.textContent.trim())
      out.push('TEXTO DESBORDADO: ' + el.tagName + '.' + String(el.className).slice(0, 40) + ' "' + el.textContent.trim().slice(0, 30) + '"');
  });
  return out.slice(0, 40);
})()
```
Para medir un ancho de móvil dentro del navegador de pruebas, abre la pantalla dentro de un `<iframe>` del ancho deseado (no redimensiones la ventana principal) y ejecuta el detector dentro del iframe (`iframe.contentWindow.eval(...)`).

## Prohibido
Mayúsculas forzadas, fuentes condensadas/monoespaciadas decorativas, sombras duras, bordes de 2+ px decorativos, fondos crema, tarjetas oscuras de color negro como protagonistas, emojis en la interfaz, texto que se sale de su caja, scroll horizontal de página, elementos que dependan de un ancho fijo en px mayor que la pantalla.

## Definición de terminado (por pantalla)
1. Se ve coherente con este documento a los 5 anchos; 2. el detector devuelve vacío; 3. estados vacío/cargando/error cuidados; 4. conserva TODAS las funciones; 5. `npm run build` sin errores; 6. revisión visual con capturas a 390 y 1440 px.

---

## FUNDACION LISTA (Agente 1, tema + logo + shell ya aplicados)

Archivos de la base (SOLO el Agente 1 los edita; si necesitas un cambio, pídelo por SendMessage o usa CSS propio de tu página):
`src/styles/theme.css`, `src/styles/primitives.css`, `src/components/ui/kit.jsx`, `src/components/layout/AppLayout.jsx`, `src/components/layout/NotificationBell.jsx`, `src/index.css`, `index.html`.

**Fuente**: Inter (400/500/600/700) cargada en index.html. `--font-display`, `--font-text`, `--font-family` y `--font-mono` ya apuntan todas a Inter. Una regla global en theme.css anula `text-transform`/`letter-spacing` de TODO salvo `.tk-paper` (ticket): no hace falta que la quites en tu CSS, pero no la reintroduzcas.

**Tokens V3** (usa estos): `--bg --surface --surface-2 --surface-3 --line --line-strong --text --text-2 --text-3 --brand --brand-hover --brand-deep --brand-50 --brand-200 --success --success-bg --success-line --warning --warning-bg --warning-line --danger --danger-bg --danger-line --info --info-bg --info-line --r-control(10px) --r-card(14px) --r-pill --sh-1 --sh-2 --sh-3 --ring --sp-1..--sp-10 --font-sans`.
Alias V2 que SIGUEN funcionando (ya remapeados a V3): `--paper --paper-2 --paper-3 --card --line-soft --ink --ink-2 --ink-3 --ink-4 --red --red-dark --red-deep --red-soft --red-line --ok --ok-soft --warn --warn-soft --info-soft --radius-sm/md/lg/xl/card --shadow-sm/md/lg/xl`. OJO: lo que en V2 era `background: var(--ink)` (negro) ahora sigue siendo casi negro: en tus pantallas cámbialo a `--brand`/`--surface-2` según el caso (nada de bloques negros protagonistas).

**Componentes** (`import { ... } from '../../components/ui/kit'` o desde `components/ui`): `Avatar, Chip(tone: neutral|red|ok|warn|info|ink), Tabs(variant: line|pill), Segmented, Skeleton, Toolbar, SectionTitle, Panel, Stat(tone: ink|red|ok|warn), Switch, Drawer, initialsOf, fmtMXN, fmtMXN0, fmtWhen`.
**Clases** (mismos nombres que V2, nueva apariencia): `k-btn` (primario rojo) `k-btn--ghost` (secundario con borde) `k-btn--quiet` (terciario) `k-btn--danger` `k-btn--sm` `k-btn--block`; `k-input k-select k-textarea k-field k-hint`; `k-search` (con `<input>` dentro); `k-note k-note--info|warn|ok|red`; `k-empty (k-empty__ico, h3, p)`; `k-pagehead (h1, p, k-pagehead__actions)`; `k-panel k-panel__head k-panel__ttl k-panel__ico k-panel__body.is-padded`; `k-chip k-chip--ok...`; `k-tabs k-tabs--line|pill k-tab.is-active k-tab__count`; `k-stat`; `k-switch`; `k-drawer*`; `k-skel`; `k-rise`.
**Utilidades nuevas V3**: `k-card` (tarjeta blanca con padding), `k-grid k-grid--2|3` (1 col móvil, 2/3 en ≥1024; 3 pasa por 2 en ≥768), `k-stack` (columna con gap 16), `k-row` (fila flex con gap 12), `k-muted`, `k-truncate`, `k-tablewrap` (contenedor con scroll horizontal PROPIO para tablas anchas), `k-list` (lista con filas separadas por línea fina), `tnum` (cifras).

**Shell**: sidebar claro 248 px ≥1024; cajón bajo 1024 (botón de menú en la topbar). `.page-content` ya limita a 1280 px y trae padding 24/16. Logo: `public/logo-mark.png` (808x590, recortado, sobre BLANCO; en otros sitios con fondo claro usa `<img src="/logo-mark.png" height=…>` sin cajita). Campanita y avatar en la topbar ya incluidos.

**Pendiente de la fundación**: logo en Login/Signup/Onboarding (lo hace el Agente 1 en su Fase 2). El detector de desbordes sigue siendo obligatorio.

---

## Detector de desbordes v2 (usar ESTE; el anterior no veía elementos dentro de contenedores con overflow)
Reporta: scroll horizontal de la página, scroll horizontal interno de `.page-content`, hijos que se salen de su padre (`FUERA`/`RECORTADO` si el padre corta) y texto que no cabe. Ignora las barras de pestañas pensadas para desplazarse (`.k-tabs`, `.k-tablewrap`, `[data-scroll-x]`) y los elementos `position: fixed`.
```js
window.__det = function(){ const out=[]; const vw=document.documentElement.clientWidth;
 if(document.documentElement.scrollWidth>vw+1) out.push('PAGINA scroll-x: '+document.documentElement.scrollWidth+'>'+vw);
 const pc=document.querySelector('.page-content, .portal-root, main'); if(pc && pc.scrollWidth>pc.clientWidth+1) out.push('CONTENIDO scroll-x: '+pc.className.slice(0,30)+' '+pc.scrollWidth+'>'+pc.clientWidth);
 document.querySelectorAll('body *').forEach(el=>{ const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||el.closest('[aria-hidden="true"],[hidden]')) return; const r=el.getBoundingClientRect(); if(!r.width||!r.height) return; if(cs.position==='fixed') return;
  const p=el.parentElement; if(!p) return; const pr=p.getBoundingClientRect(); const pcs=getComputedStyle(p);
  const cuts=/(hidden|clip)/.test(pcs.overflowX);
  const isScrollHost=/(auto|scroll)/.test(pcs.overflowX) && p.matches('.k-tabs, .k-tablewrap, .k-tabs--pill, .k-tabs--line, [data-scroll-x]');
  if(!isScrollHost && pr.width>0 && cs.position!=='absolute' && (r.right>pr.right+1||r.left<pr.left-1)) out.push((cuts?'RECORTADO: ':'FUERA: ')+el.tagName+'.'+String(el.className).slice(0,40)+' ('+Math.round(r.right-pr.right)+'px) en '+p.tagName+'.'+String(p.className).slice(0,30));
  if(el.scrollWidth>el.clientWidth+1&&cs.overflowX==='visible'&&el.children.length===0&&el.textContent.trim()&&cs.textOverflow!=='ellipsis') out.push('TEXTO: '+el.tagName+'.'+String(el.className).slice(0,40)+' "'+el.textContent.trim().slice(0,30)+'"'); });
 return out.slice(0,14); };
```
Uso: abrir cada ruta en un `<iframe>` del ancho deseado dentro de una pestaña propia y evaluar `iframe.contentWindow.eval('('+window.__det.toString()+')()')`. Datos de prueba recomendados: cliente/moto/orden con nombres y fallas MUY largos (ver `apps/api` seed de pruebas) para forzar los desbordes.
Nota de aprendizaje: `.main-content{height:100vh;overflow:hidden}` + scroll interno recorta el final de la página en navegadores móviles; en < 1024 px el shell usa scroll de página completo (ya aplicado en theme.css).
