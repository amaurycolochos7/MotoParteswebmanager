/* =========================================================================
   MotoPartes — UI component library (real, reusable, token-driven).
   Apple-inspired: clean surfaces, soft borders, refined type, brand red used
   with restraint. Styles live in ./components.css.
   ========================================================================= */
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import './components.css';

/* ---- Button ---------------------------------------------------------- */
export function Button({
  as: Comp = 'button',
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  leftIcon = null,
  rightIcon = null,
  className = '',
  children,
  ...props
}) {
  const cls = `mp-btn mp-btn--${variant} mp-btn--${size}${block ? ' mp-btn--block' : ''} ${className}`.trim();
  return (
    <Comp className={cls} aria-busy={loading || undefined} {...props}>
      {loading && <span className="mp-btn__spin" aria-hidden="true" />}
      {!loading && leftIcon}
      {children && <span className="mp-btn__label">{children}</span>}
      {!loading && rightIcon}
    </Comp>
  );
}

/* ---- IconButton ------------------------------------------------------ */
export function IconButton({ variant = 'ghost', size = 'md', className = '', children, ...props }) {
  return (
    <button className={`mp-iconbtn mp-iconbtn--${variant} mp-iconbtn--${size} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

/* ---- Card ------------------------------------------------------------ */
export function Card({ className = '', interactive = false, children, ...props }) {
  return (
    <div className={`mp-card${interactive ? ' mp-card--interactive' : ''} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

/* ---- SectionCard (titled card for forms/sections) ------------------- */
export function SectionCard({ title, subtitle, icon = null, action = null, className = '', children }) {
  return (
    <section className={`mp-section ${className}`.trim()}>
      {(title || action) && (
        <header className="mp-section__head">
          <div className="mp-section__heading">
            {icon && <span className="mp-section__icon">{icon}</span>}
            <div>
              {title && <h3 className="mp-section__title">{title}</h3>}
              {subtitle && <p className="mp-section__sub">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className="mp-section__body">{children}</div>
    </section>
  );
}

/* ---- PageHeader ------------------------------------------------------ */
export function PageHeader({ title, subtitle, onBack = null, backTo = null, actions = null }) {
  const Back = backTo
    ? <Link to={backTo} className="mp-pageheader__back" aria-label="Atrás"><ChevronLeft size={20} /></Link>
    : onBack
      ? <button onClick={onBack} className="mp-pageheader__back" aria-label="Atrás"><ChevronLeft size={20} /></button>
      : null;
  return (
    <header className="mp-pageheader">
      <div className="mp-pageheader__left">
        {Back}
        <div>
          <h1 className="mp-pageheader__title">{title}</h1>
          {subtitle && <p className="mp-pageheader__sub">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="mp-pageheader__actions">{actions}</div>}
    </header>
  );
}

/* ---- FormField + Input/Textarea/Select ------------------------------ */
export function FormField({ label, hint, error, required = false, htmlFor, children }) {
  return (
    <div className={`mp-field${error ? ' mp-field--error' : ''}`}>
      {label && (
        <label className="mp-field__label" htmlFor={htmlFor}>
          {label}{required && <span className="mp-field__req"> *</span>}
        </label>
      )}
      {children}
      {error ? <span className="mp-field__msg mp-field__msg--error">{error}</span>
        : hint ? <span className="mp-field__msg">{hint}</span> : null}
    </div>
  );
}

export function Input({ className = '', ...props }) {
  return <input className={`mp-input ${className}`.trim()} {...props} />;
}
export function Textarea({ className = '', ...props }) {
  return <textarea className={`mp-input mp-textarea ${className}`.trim()} {...props} />;
}
export function Select({ className = '', children, ...props }) {
  return <select className={`mp-input mp-select ${className}`.trim()} {...props}>{children}</select>;
}

/* ---- Badge / StatusChip --------------------------------------------- */
export function Badge({ tone = 'neutral', className = '', children }) {
  return <span className={`mp-badge mp-badge--${tone} ${className}`.trim()}>{children}</span>;
}

// Maps an order/quote status name to a sober tone.
export function statusTone(name = '') {
  const n = (name || '').toLowerCase();
  if (n.includes('lista') || n.includes('entregar') || n.includes('pagad') || n.includes('entregada') || n.includes('convertida') || n.includes('acept')) return 'success';
  if (n.includes('cancel') || n.includes('rechaz')) return 'danger';
  if (n.includes('autorizada') || n.includes('proceso') || n.includes('repar')) return 'brand';
  if (n.includes('diagn') || n.includes('espera') || n.includes('pendiente') || n.includes('enviada') || n.includes('refacc')) return 'warning';
  return 'neutral';
}
export function StatusChip({ status, className = '' }) {
  return <span className={`mp-badge mp-badge--${statusTone(status)} ${className}`.trim()}>{status}</span>;
}

/* ---- MetricCard ------------------------------------------------------ */
export function MetricCard({ value, label, icon = null, tone = 'ink', onClick }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp className={`mp-metric${onClick ? ' mp-metric--clickable' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className={`mp-metric__value mp-metric__value--${tone}`}>
        {icon && <span className="mp-metric__icon">{icon}</span>}{value}
      </span>
      <span className="mp-metric__label">{label}</span>
    </Comp>
  );
}

/* ---- ActionCard (big tappable primary action) ----------------------- */
export function ActionCard({ to, onClick, icon, title, subtitle, tone = 'brand' }) {
  const inner = (
    <>
      <span className={`mp-action__icon mp-action__icon--${tone}`}>{icon}</span>
      <span className="mp-action__body">
        <span className="mp-action__title">{title}</span>
        {subtitle && <span className="mp-action__sub">{subtitle}</span>}
      </span>
      <ChevronRight size={20} className="mp-action__chev" />
    </>
  );
  return to
    ? <Link to={to} className={`mp-action mp-action--${tone}`}>{inner}</Link>
    : <button onClick={onClick} className={`mp-action mp-action--${tone}`} type="button">{inner}</button>;
}

/* ---- EmptyState ------------------------------------------------------ */
export function EmptyState({ icon = null, title, message, action = null }) {
  return (
    <div className="mp-empty">
      {icon && <div className="mp-empty__icon">{icon}</div>}
      {title && <p className="mp-empty__title">{title}</p>}
      {message && <p className="mp-empty__msg">{message}</p>}
      {action && <div className="mp-empty__action">{action}</div>}
    </div>
  );
}

/* ---- Stepper --------------------------------------------------------- */
export function Stepper({ steps = [], current = 0 }) {
  return (
    <div className="mp-stepper" role="list">
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <div className="mp-step" data-state={state} role="listitem" key={i}>
            <span className="mp-step__dot">{i < current ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
            <span className="mp-step__label">{label}</span>
            {i < steps.length - 1 && <span className="mp-step__bar" />}
          </div>
        );
      })}
    </div>
  );
}

/* ---- Modal ----------------------------------------------------------- */
export function Modal({ open, onClose, title, footer = null, size = 'md', children }) {
  if (!open) return null;
  return (
    <div className="mp-modal__overlay" onClick={onClose}>
      <div className={`mp-modal mp-modal--${size}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {title && (
          <header className="mp-modal__head">
            <h3 className="mp-modal__title">{title}</h3>
            <button className="mp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
          </header>
        )}
        <div className="mp-modal__body">{children}</div>
        {footer && <footer className="mp-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}
