/* =============================================================================
   Kit "taller": piezas nuevas del sistema de diseño (Tabs, Avatar, Skeleton,
   Drawer, Toolbar, Chip, Stat, Segmented, Switch, SectionTitle, Panel).
   Estilos en src/styles/primitives.css. Sin emojis; iconos con lucide-react.
   ============================================================================= */
import { useEffect } from 'react';
import { X } from 'lucide-react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/* Iniciales para avatares */
export function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/* Avatar con color estable por nombre */
const AVATAR_TONES = ['ink', 'red', 'olive', 'steel', 'sand'];
export function Avatar({ name = '', size = 'md', tone, className = '', src = null }) {
  const t = tone || AVATAR_TONES[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className={cx('k-avatar', `k-avatar--${size}`, `k-avatar--${t}`, src && 'k-avatar--photo', className)} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" draggable="false" /> : initialsOf(name)}
    </span>
  );
}

/* Chip / etiqueta compacta */
export function Chip({ tone = 'neutral', icon = null, className = '', children }) {
  return (
    <span className={cx('k-chip', `k-chip--${tone}`, className)}>
      {icon}
      {children}
    </span>
  );
}

/* Tabs: items = [{ id, label, count? }] */
export function Tabs({ items, value, onChange, className = '', variant = 'line' }) {
  return (
    <div className={cx('k-tabs', `k-tabs--${variant}`, className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          className={cx('k-tab', value === it.id && 'is-active')}
          onClick={() => onChange(it.id)}
        >
          <span>{it.label}</span>
          {it.count !== undefined && it.count !== null && <span className="k-tab__count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* Control segmentado (para filtros cortos) */
export function Segmented({ items, value, onChange, className = '' }) {
  return <Tabs items={items} value={value} onChange={onChange} variant="pill" className={className} />;
}

/* Skeleton de carga */
export function Skeleton({ w = '100%', h = 14, r = 6, className = '', style }) {
  return <span className={cx('k-skel', className)} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}

/* Barra de herramientas: búsqueda + filtros + acciones */
export function Toolbar({ children, className = '' }) {
  return <div className={cx('k-toolbar', className)}>{children}</div>;
}

/* Título de sección con línea */
export function SectionTitle({ title, hint = null, action = null, className = '' }) {
  return (
    <div className={cx('k-sectiontitle', className)}>
      <div>
        <h2 className="k-sectiontitle__t">{title}</h2>
        {hint && <p className="k-sectiontitle__h">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* Panel con borde definido y cabecera opcional */
export function Panel({ title, hint = null, action = null, icon = null, padded = true, className = '', children }) {
  return (
    <section className={cx('k-panel', className)}>
      {(title || action) && (
        <header className="k-panel__head">
          <div className="k-panel__ttl">
            {icon && <span className="k-panel__ico">{icon}</span>}
            <div>
              <h3>{title}</h3>
              {hint && <p>{hint}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={cx('k-panel__body', padded && 'is-padded')}>{children}</div>
    </section>
  );
}

/* Cifra destacada */
export function Stat({ label, value, hint = null, tone = 'ink', className = '' }) {
  return (
    <div className={cx('k-stat', `k-stat--${tone}`, className)}>
      <span className="k-stat__l">{label}</span>
      <span className="k-stat__v">{value}</span>
      {hint && <span className="k-stat__h">{hint}</span>}
    </div>
  );
}

/* Interruptor accesible */
export function Switch({ checked, onChange, label, hint = null, disabled = false, className = '' }) {
  return (
    <label className={cx('k-switch', disabled && 'is-disabled', className)}>
      <span className="k-switch__txt">
        <span className="k-switch__l">{label}</span>
        {hint && <span className="k-switch__h">{hint}</span>}
      </span>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="k-switch__track" aria-hidden="true"><span className="k-switch__dot" /></span>
    </label>
  );
}

/* Cajón lateral (derecha en escritorio, hoja inferior en móvil) */
export function Drawer({ open, onClose, title, subtitle = null, footer = null, width = 460, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="k-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="k-drawer__scrim" onClick={onClose} />
      <aside className="k-drawer__sheet" style={{ '--drawer-w': `${width}px` }}>
        <header className="k-drawer__head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="k-drawer__x" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="k-drawer__body">{children}</div>
        {footer && <footer className="k-drawer__foot">{footer}</footer>}
      </aside>
    </div>
  );
}

/* Formato de dinero y fechas compartido */
export const fmtMXN = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);
export const fmtMXN0 = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n) || 0);
export function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === y.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}
