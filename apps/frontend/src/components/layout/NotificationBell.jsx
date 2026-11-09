import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock } from 'lucide-react';

/**
 * Campanita de la barra superior. Avisa SOLO de solicitudes de citas por revisar:
 * con pendientes tiembla suavemente y late un halo rojo; al abrirla lleva directo a Citas.
 * (Los mensajes de WhatsApp no pasan por aqui: tienen su insignia junto a "Conversaciones" en el menu.)
 */
export default function NotificationBell({ appts = 0, appointmentsPath }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

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
        className={`bell${appts > 0 ? ' bell--alert' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={appts > 0 ? `${appts} citas por revisar` : 'Sin citas por revisar'}
        aria-expanded={open}
      >
        <Bell size={21} />
        {appts > 0 && <span className="bell__badge">{appts > 99 ? '99+' : appts}</span>}
      </button>

      {open && (
        <div className="bell-pop" role="menu">
          <div className="bell-pop__head">Citas por revisar</div>
          {appts === 0 && <div className="bell-pop__empty">Todo al día. No hay solicitudes de cita por revisar.</div>}
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
        </div>
      )}
    </div>
  );
}
