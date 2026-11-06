import { useState, useEffect } from 'react';
import { X, Send, CalendarOff, Trash2, MessageCircle, Copy, Check, AlertTriangle } from 'lucide-react';
import { appointmentsService } from '../../lib/api';

// Todas las fechas del flujo se manejan en hora de Chiapas (UTC-6), igual que la API.
export const MX_OFFSET = '-06:00';
const pad2 = (n) => String(n).padStart(2, '0');
export function mxParts(iso) {
    const d = new Date(new Date(iso).getTime() - 6 * 3600 * 1000);
    return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}
export const mxToIso = (date, time) => new Date(`${date}T${time}:00${MX_OFFSET}`).toISOString();
export function fmtLong(iso) {
    return new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });
}
export function fmtHour(iso) {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' });
}
const todayMx = () => mxParts(new Date().toISOString()).date;

const WA_REASONS = {
    whatsapp_desconectado: 'WhatsApp no está conectado',
    sin_telefono: 'La cita no tiene teléfono',
};
const reasonText = (r) => WA_REASONS[r]
    || (/^bot_|fetch failed|ECONN|timeout|aborted/i.test(String(r || '')) ? 'El bot de WhatsApp no responde' : r || 'error desconocido');

/* ── Resultado del envío por WhatsApp (con respaldo manual) ───────────── */
export function WhatsAppNotice({ result, onClose }) {
    const [copied, setCopied] = useState(false);
    if (!result) return null;
    const { sent, reason, text, phone, link } = result;
    const copy = async () => {
        try { await navigator.clipboard.writeText(text); }
        catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
        setCopied(true); setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className={`af-notice ${sent ? 'ok' : 'warn'}`} role="status">
            <button className="af-notice-x" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
            {sent ? (
                <p><Check size={16} /> Listo. Se envió el mensaje al cliente por WhatsApp{phone ? ` (+${phone})` : ''}.</p>
            ) : (
                <>
                    <p><AlertTriangle size={16} /> No se pudo enviar por WhatsApp ({reasonText(reason)}). La cita sí se guardó; mándale tú este mensaje:</p>
                    <textarea className="af-notice-text" readOnly rows={7} value={text} onFocus={e => e.target.select()} />
                    <div className="af-notice-actions">
                        {phone && (
                            <a className="af-btn wa" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`}>
                                <MessageCircle size={15} /> Abrir WhatsApp
                            </a>
                        )}
                        <button className="af-btn" onClick={copy}>{copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar mensaje</>}</button>
                    </div>
                    {link && <p className="af-notice-link">Enlace del cliente: {link}</p>}
                </>
            )}
        </div>
    );
}

/* ── Proponer otra fecha ──────────────────────────────────────────────── */
export function ProposeModal({ apt, name, blockedDays = [], onClose, onSubmit }) {
    const base = mxParts(apt.proposed_date || apt.scheduled_date);
    const [date, setDate] = useState('');
    const [time, setTime] = useState(base.time);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const fromConfirmed = apt.status === 'confirmed';
    const blocked = blockedDays.find(b => b.date === date);
    const valid = date && time && !blocked;

    const submit = async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true); setErr('');
        try { await onSubmit({ scheduled_date: mxToIso(date, time), note: note.trim() }); }
        catch (ex) { setErr(ex?.message || 'No se pudo enviar la propuesta.'); setBusy(false); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <form className="modal af-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
                <div className="modal-header">
                    <h3 className="modal-title"><Send size={18} /> {fromConfirmed ? 'Proponer un cambio' : 'Proponer otra fecha'}</h3>
                    <button type="button" className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="modal-body">
                    <p className="af-hint">
                        {name} pidió <strong>{fmtLong(apt.scheduled_date)} a las {fmtHour(apt.scheduled_date)}</strong>.
                        {fromConfirmed ? ' Es una cita confirmada: el cambio solo se aplica si el cliente lo acepta.' : ''}
                    </p>
                    <div className="af-row">
                        <div className="form-group">
                            <label className="form-label">Nueva fecha *</label>
                            <input type="date" className="form-input" min={todayMx()} value={date} onChange={e => setDate(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Hora *</label>
                            <input type="time" className="form-input" step={900} min="07:00" max="21:00" value={time} onChange={e => setTime(e.target.value)} required />
                        </div>
                    </div>
                    {blocked && <p className="af-warn"><CalendarOff size={14} /> Marcaste ese día sin servicio{blocked.reason ? ` (${blocked.reason})` : ''}. Elige otro.</p>}
                    <div className="form-group">
                        <label className="form-label">Mensaje para el cliente <span className="af-opt">(opcional)</span></label>
                        <textarea className="form-textarea" rows={3} maxLength={300} value={note} onChange={e => setNote(e.target.value)}
                            placeholder="Ej: Ese día no laboramos, ¿te sirve el viernes?" />
                    </div>
                    <p className="af-hint small">
                        El cliente recibe un WhatsApp con un enlace para <strong>aceptar</strong> o elegir otro día. El horario queda apartado 24 horas.
                    </p>
                    {err && <p className="af-warn">{err}</p>}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>Cerrar</button>
                    <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
                        <Send size={16} /> {busy ? 'Enviando…' : 'Enviar propuesta'}
                    </button>
                </div>
            </form>
        </div>
    );
}

/* ── Motivo (No disponible / Cancelar) ────────────────────────────────── */
export function ReasonModal({ title, intro, placeholder, confirmText, danger, required, onClose, onSubmit }) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const submit = async (e) => {
        e.preventDefault();
        if (busy || (required && !reason.trim())) return;
        setBusy(true); setErr('');
        try { await onSubmit(reason.trim()); }
        catch (ex) { setErr(ex?.message || 'No se pudo completar la acción.'); setBusy(false); }
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <form className="modal af-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
                <div className="modal-header">
                    <h3 className="modal-title">{title}</h3>
                    <button type="button" className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="modal-body">
                    {intro && <p className="af-hint">{intro}</p>}
                    <div className="form-group">
                        <label className="form-label">Motivo {required ? '*' : <span className="af-opt">(opcional, se le envía al cliente)</span>}</label>
                        <textarea className="form-textarea" rows={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder={placeholder} />
                    </div>
                    {err && <p className="af-warn">{err}</p>}
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={onClose}>Cerrar</button>
                    <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy || (required && !reason.trim())}>
                        {busy ? 'Enviando…' : confirmText}
                    </button>
                </div>
            </form>
        </div>
    );
}

/* ── Días sin servicio ────────────────────────────────────────────────── */
export function BlockedDaysModal({ onClose, onChanged }) {
    const [days, setDays] = useState([]);
    const [date, setDate] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [affected, setAffected] = useState([]);

    const load = async () => {
        try { const rows = await appointmentsService.blockedDays(); setDays(Array.isArray(rows) ? rows : []); onChanged?.(rows); }
        catch (e) { setErr(e?.message || 'No se pudo cargar.'); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const add = async (e) => {
        e.preventDefault();
        if (!date || busy) return;
        setBusy(true); setErr(''); setAffected([]);
        try {
            const res = await appointmentsService.addBlockedDay({ date, reason: reason.trim() });
            setAffected(res?.affected || []);
            setDate(''); setReason('');
            await load();
        } catch (ex) { setErr(ex?.message || 'No se pudo guardar.'); }
        finally { setBusy(false); }
    };
    const remove = async (id) => {
        try { await appointmentsService.removeBlockedDay(id); await load(); }
        catch (ex) { setErr(ex?.message || 'No se pudo quitar.'); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal af-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title"><CalendarOff size={18} /> Días sin servicio</h3>
                    <button type="button" className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="modal-body">
                    <p className="af-hint">Los días que marques no aparecen disponibles en el formulario ni en el enlace del cliente.</p>
                    <form className="af-row af-blocked-form" onSubmit={add}>
                        <div className="form-group">
                            <label className="form-label">Fecha</label>
                            <input type="date" className="form-input" min={todayMx()} value={date} onChange={e => setDate(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Motivo <span className="af-opt">(opcional)</span></label>
                            <input type="text" className="form-input" maxLength={120} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Descanso, feriado" />
                        </div>
                        <button type="submit" className="btn btn-primary af-add" disabled={!date || busy}>{busy ? '…' : 'Agregar'}</button>
                    </form>
                    {affected.length > 0 && (
                        <div className="af-warn-box">
                            <strong><AlertTriangle size={14} /> Ya hay {affected.length} cita{affected.length > 1 ? 's' : ''} ese día:</strong>
                            <ul>{affected.map(a => <li key={a.id}>{a.hora} · {a.nombre} · {a.servicio || 'Servicio'}</li>)}</ul>
                            <span>Búscalas en Citas y usa “Proponer otra fecha” para moverlas.</span>
                        </div>
                    )}
                    {err && <p className="af-warn">{err}</p>}
                    <div className="af-days">
                        {days.length === 0 ? <p className="af-hint small">No hay días marcados.</p> : days.map(d => (
                            <div key={d.id} className="af-day">
                                <div>
                                    <strong>{fmtLong(`${d.date}T12:00:00${MX_OFFSET}`)}</strong>
                                    {d.reason && <span>{d.reason}</span>}
                                </div>
                                <button type="button" className="af-day-x" onClick={() => remove(d.id)} title="Quitar"><Trash2 size={15} /></button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={onClose}>Cerrar</button></div>
            </div>
        </div>
    );
}

/* ── Estilos del flujo ────────────────────────────────────────────────── */
export function FlowStyles() {
    return (
        <style>{`
            .af-modal { max-width: 480px; }
            .af-hint { color: var(--text-secondary); font-size: .9rem; line-height: 1.5; margin: 0 0 14px; }
            .af-hint.small { font-size: .8rem; margin: 6px 0 0; }
            .af-opt { color: var(--text-muted, #86868b); font-weight: 400; }
            .af-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
            .af-warn { display: flex; align-items: center; gap: 6px; color: #b91c1c; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 8px 12px; font-size: .85rem; font-weight: 600; margin: 4px 0 10px; }
            .af-warn-box { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; border-radius: 8px; padding: 10px 14px; font-size: .85rem; margin-bottom: 12px; }
            .af-warn-box ul { margin: 6px 0 6px 18px; }
            .af-blocked-form { grid-template-columns: 1fr 1.4fr auto; align-items: end; }
            .af-add { margin-bottom: 14px; }
            .af-days { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; }
            .af-day { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-hover); }
            .af-day strong { display: block; font-size: .9rem; text-transform: capitalize; }
            .af-day span { font-size: .78rem; color: var(--text-secondary); }
            .af-day-x { border: 0; background: transparent; color: #dc2626; cursor: pointer; padding: 6px; border-radius: 6px; }
            .af-day-x:hover { background: #fee2e2; }

            .af-notice { position: relative; width: 100%; max-width: 560px; border-radius: 10px; padding: 14px 40px 14px 16px; margin-bottom: 16px; font-size: .88rem; }
            .af-notice.ok { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
            .af-notice.warn { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
            .af-notice p { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; font-weight: 600; line-height: 1.45; }
            .af-notice p:last-child { margin-bottom: 0; }
            .af-notice-x { position: absolute; right: 10px; top: 10px; border: 0; background: transparent; cursor: pointer; color: inherit; opacity: .7; }
            .af-notice-text { width: 100%; border: 1px solid rgba(0,0,0,.15); border-radius: 8px; padding: 10px; font: inherit; font-size: .82rem; background: #fff; color: #111; resize: vertical; }
            .af-notice-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
            .af-notice-link { font-weight: 400 !important; font-size: .78rem; word-break: break-all; opacity: .85; }
            .af-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1.5px solid rgba(0,0,0,.18); background: #fff; color: #111; font-size: .82rem; font-weight: 700; cursor: pointer; text-decoration: none; }
            .af-btn.wa { background: #25d366; border-color: #25d366; color: #fff; }

            /* tarjeta de cita: acciones y avisos del cliente */
            .apt-alert { display: flex; gap: 10px; align-items: center; justify-content: space-between; background: #eff6ff; border: 1px solid #93c5fd; color: #1e3a8a; border-radius: 8px; padding: 8px 12px; font-size: .82rem; font-weight: 600; margin: 6px 0 2px; }
            .apt-alert button { border: 0; background: #1d4ed8; color: #fff; border-radius: 6px; padding: 4px 10px; font-size: .75rem; font-weight: 700; cursor: pointer; white-space: nowrap; }
            .apt-proposal { font-size: .82rem; color: #1d4ed8; background: #eff6ff; border-radius: 8px; padding: 6px 10px; margin-top: 4px; line-height: 1.45; }
            .apt-actions .btn-propose, .apt-actions .btn-plain { display: flex; align-items: center; gap: 5px; padding: 6px 14px; border-radius: var(--radius-md); font-size: .8125rem; font-weight: 700; cursor: pointer; border: 1.5px solid var(--border-color); background: #fff; color: var(--text-primary); transition: .15s; }
            .apt-actions .btn-propose { background: #2563eb; border-color: #2563eb; color: #fff; }
            .apt-actions .btn-propose:hover { background: #1d4ed8; }
            .apt-actions .btn-plain:hover { background: var(--bg-hover); }
            .apt-actions .btn-plain.danger { color: #dc2626; border-color: #fca5a5; }
            .apt-actions button:disabled { opacity: .6; cursor: not-allowed; }
            .apt-history-toggle { border: 0; background: transparent; color: var(--text-secondary); font-size: .75rem; font-weight: 600; cursor: pointer; padding: 4px 0; text-align: left; text-decoration: underline; }
            .apt-history { margin: 4px 0 0; padding: 0; list-style: none; font-size: .75rem; color: var(--text-secondary); border-left: 2px solid var(--border-color); }
            .apt-history li { padding: 2px 0 2px 10px; }
            .apt-history b { color: var(--text-primary); }
            .apt-trash { display: flex; align-items: center; justify-content: center; padding: 0 var(--spacing-md); color: var(--text-muted); background: transparent; border: none; cursor: pointer; flex-shrink: 0; }
            .apt-trash:hover { color: #dc2626; background: #fef2f2; }
            @media (max-width: 520px) { .af-row, .af-blocked-form { grid-template-columns: 1fr; } .af-add { width: 100%; } }
        `}</style>
    );
}
