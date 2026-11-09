import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { ticketsService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import './AdminV3.css';

function fmtDateTime(d) {
    return new Date(d).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

export default function AdminSupportDetail() {
    const { id } = useParams();
    const toast = useToast();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const end = useRef(null);

    const load = () => ticketsService.get(id).then((r) => setTicket(r.ticket)).finally(() => setLoading(false));
    useEffect(load, [id]);
    useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [ticket?.messages?.length]);

    const send = async () => {
        if (!body.trim()) return;
        setSending(true);
        try { await ticketsService.reply(id, body); setBody(''); await load(); }
        catch (e) { toast.error(e.message); }
        finally { setSending(false); }
    };

    const resolve = async () => {
        if (!confirm('¿Marcar como resuelto?')) return;
        try { await ticketsService.markResolved(id); toast.success('Ticket resuelto'); load(); }
        catch (e) { toast.error(e.message); }
    };

    if (loading) return <div className="adm adm-loading"><Loader2 className="adm-spin" size={26} /></div>;
    if (!ticket) return null;

    const isClosed = ['closed', 'spam'].includes(ticket.status);

    return (
        <div className="adm" style={{ maxWidth: 820 }}>
            <Link to="/admin/support" className="adm-back"><ArrowLeft size={15} /> Volver</Link>

            <header className="adm-head">
                <div>
                    <p style={{ margin: 0 }}>Ticket #{ticket.ticket_number} · {ticket.category}</p>
                    <h1 style={{ marginTop: 4 }}>{ticket.subject}</h1>
                </div>
                {ticket.status === 'resolved' ? (
                    <span className="adm-badge adm-badge--ok"><CheckCircle2 size={14} /> Resuelto</span>
                ) : !isClosed && (
                    <button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={resolve}>
                        <CheckCircle2 size={15} /> Ya quedó resuelto
                    </button>
                )}
            </header>

            <div className="adm-thread">
                {ticket.messages.map((m) => {
                    const isCustomer = m.author_type === 'customer';
                    return (
                        <div key={m.id} className={`adm-msg${isCustomer ? '' : ' is-support'}`}>
                            <div className="adm-msg__head">
                                <strong>
                                    {!isCustomer && <ShieldCheck size={14} />}
                                    {m.author?.full_name || (isCustomer ? 'Tú' : 'Soporte MotoPartes')}
                                </strong>
                                <span>{fmtDateTime(m.created_at)}</span>
                            </div>
                            <div className="adm-msg__body">{m.body_md}</div>
                        </div>
                    );
                })}
                <div ref={end} />
            </div>

            {!isClosed && (
                <div className="adm-reply">
                    <div className="adm-field">
                        <label htmlFor="sp-reply" className="adm-label">Tu respuesta</label>
                        <textarea id="sp-reply" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe tu respuesta…" rows={4} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" className="k-btn" onClick={send} disabled={sending || !body.trim()}>
                            {sending ? <Loader2 className="adm-spin" size={15} /> : <Send size={15} />} Enviar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
