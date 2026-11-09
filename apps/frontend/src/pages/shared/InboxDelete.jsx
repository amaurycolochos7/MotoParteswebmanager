/* Eliminar mensajes en Conversaciones, como en WhatsApp Web: menú del mensaje y cuadro "¿Eliminar mensaje?". */
import { useEffect, useRef } from 'react';
import { Copy, ListChecks, Loader2, Trash2 } from 'lucide-react';

/** Menú que abre la flechita de cada mensaje (también clic derecho). Se cierra al tocar fuera o con Escape. */
export function MessageMenu({ m, hasText, onAction, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  return (
    <div className={`ib-menu ${m.direction === 'out' ? 'is-out' : 'is-in'}`} role="menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      {hasText && <button type="button" role="menuitem" onClick={() => onAction('copy', m)}><Copy size={16} /> Copiar</button>}
      <button type="button" role="menuitem" onClick={() => onAction('select', m)}><ListChecks size={16} /> Seleccionar</button>
      <button type="button" role="menuitem" className="is-danger" onClick={() => onAction('delete', m)}><Trash2 size={16} /> Eliminar</button>
    </div>
  );
}

/**
 * Cuadro de confirmación. "Eliminar para todos" solo aparece si TODOS los mensajes elegidos se pueden revocar en WhatsApp
 * (propios y dentro del tiempo que permite WhatsApp); "Eliminar para mí" siempre.
 */
export function DeleteDialog({ count, canEveryone, busy, onCancel, onDelete }) {
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, onCancel]);
  return (
    <div className="ib-modal ib-modal--center" role="alertdialog" aria-modal="true" aria-labelledby="ib-del-title" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="ib-del">
        <h3 id="ib-del-title">{count === 1 ? '¿Eliminar mensaje?' : `¿Eliminar ${count} mensajes?`}</h3>
        {!canEveryone && <p>Solo puedes eliminarlo para todos si lo enviaste hace menos de 2 días y medio. Si no, se elimina solo para ti: el resto del equipo lo seguirá viendo.</p>}
        {canEveryone && <p>"Para todos" lo borra también del WhatsApp del cliente. "Para mí" solo lo quita de tu vista.</p>}
        <div className="ib-del__btns">
          {canEveryone && (
            <button type="button" className="ib-del__btn" onClick={() => onDelete('everyone')} disabled={busy} ref={first}>
              {busy ? <Loader2 size={16} className="ib-spin" /> : null} Eliminar para todos
            </button>
          )}
          <button type="button" className="ib-del__btn" onClick={() => onDelete('me')} disabled={busy} ref={canEveryone ? null : first}>
            {busy && !canEveryone ? <Loader2 size={16} className="ib-spin" /> : null} Eliminar para mí
          </button>
          <button type="button" className="ib-del__btn ib-del__btn--ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
