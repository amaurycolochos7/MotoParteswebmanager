import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, MessageSquare } from 'lucide-react';

/**
 * Campanita de la barra superior. Con pendientes tiembla suavemente y late un halo rojo.
 * Al abrirla lista que hay por atender y lleva directo a Citas o Conversaciones.
 */
export default function NotificationBell({ appts = 0, unread = 0, appointmentsPath, inboxPath, showInbox }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const total = appts + (showInbox ? unread : 0);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const go = (path) => { setOpen(false); navigate(path); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`bell${total > 0 ? ' bell--alert' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={total > 0 ? `${total} avisos pendientes` : 'Sin avisos'}
        aria-expanded={open}
      >
        <Bell size={21} />
        {total > 0 && <span className="bell__badge">{total > 99 ? '99+' : total}</span>}
      </button>

      {open && (
        <div className="bell-pop" role="menu">
          <div className="bell-pop__head">Pendientes</div>
          {total === 0 && <div className="bell-pop__empty">Todo al día. No hay citas ni mensajes por atender.</div>}
          {appts > 0 && (
            <button type="button" className="bell-pop__item" onClick={() => go(appointmentsPath)}>
              <span className="bell-pop__ico"><CalendarClock size={18} /></span>
              <span className="bell-pop__txt">
                <strong>{appts === 1 ? 'Una cita por revisar' : `${appts} citas por revisar`}</strong>
                <span>Acepta, propone otra hora o rechaza</span>
              </span>
              <span className="bell-pop__n">{appts}</span>
            </button>
          )}
          {showInbox && unread > 0 && (
            <button type="button" className="bell-pop__item" onClick={() => go(inboxPath)}>
              <span className="bell-pop__ico"><MessageSquare size={18} /></span>
              <span className="bell-pop__txt">
                <strong>{unread === 1 ? 'Un mensaje sin leer' : `${unread} mensajes sin leer`}</strong>
                <span>Responde desde Conversaciones</span>
              </span>
              <span className="bell-pop__n">{unread}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
