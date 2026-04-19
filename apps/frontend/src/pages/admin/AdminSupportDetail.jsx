import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { ticketsService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

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

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={28} /></div>;
    if (!ticket) return null;

    const isClosed = ['closed', 'spam'].includes(ticket.status);

    return (
        <div style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
            <Link to="/admin/support" style={{ color: '#64748b', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                <ArrowLeft size={14} /> Volver
            </Link>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                <div>
                    <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Ticket #{ticket.ticket_number} · {ticket.category}</div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '4px 0 0' }}>{ticket.subject}</h1>
                </div>
                {ticket.status === 'resolved' ? (
                    <span style={{ padding: '6px 12px', background: '#dcfce7', color: '#166534', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={14} /> Resuelto
                    </span>
                ) : !isClosed && (
                    <button onClick={resolve} style={{ padding: '8px 14px', border: '1.5px solid #cbd5e1', background: 'white', borderRadius: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#16a34a' }}>
                        <CheckCircle2 size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> Ya quedó resuelto
                    </button>
                )}
            </div>

            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, marginBottom: 14, maxHeight: '65vh', overflowY: 'auto' }}>
                {ticket.messages.map((m) => {
                    const isCustomer = m.author_type === 'customer';
                    return (
                        <div key={m.id} style={{
                            marginBottom: 14,
                            background: isCustomer ? '#eff6ff' : '#fef2f2',
                            border: `1px solid ${isCustomer ? '#bfdbfe' : '#fecaca'}`,
                            borderRadius: 12, padding: 14,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.82rem' }}>
                                <strong style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {!isCustomer && <ShieldCheck size={12} style={{ color: '#ef4444' }} />}
                                    {m.author?.full_name || (isCustomer ? 'Tú' : 'Soporte MotoPartes')}
                                </strong>
                                <span style={{ color: '#94a3b8' }}>{fmtDateTime(m.created_at)}</span>
                            </div>
                            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.55, color: '#1e293b' }}>{m.body_md}</div>
                        </div>
                    );
                })}
                <div ref={end} />
            </div>

            {!isClosed && (
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16 }}>
                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Escribe tu respuesta..."
                        rows={4}
                        style={{ width: '100%', padding: 12, border: '1.5px solid #cbd5e1', borderRadius: 10, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <button onClick={send} disabled={sending || !body.trim()} style={{
                            padding: '10px 18px', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white',
                            border: 'none', borderRadius: 10, fontWeight: 600, cursor: sending ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            {sending ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Enviar
                        </button>
                    </div>
                </div>
            )}
            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
