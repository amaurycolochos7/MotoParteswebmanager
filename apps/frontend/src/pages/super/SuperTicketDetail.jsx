import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Send, Lock, CheckCircle2, Clock, User, Paperclip, Loader2, Crown, Award,
} from 'lucide-react';
import { superService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

function fmtDateTime(d) {
    if (!d) return '';
    return new Date(d).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

export default function SuperTicketDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState('');
    const [isInternal, setIsInternal] = useState(false);
    const [sending, setSending] = useState(false);
    const [canned, setCanned] = useState([]);
    const msgsEnd = useRef(null);

    const load = () =>
        superService.getTicket(id)
            .then((r) => setTicket(r.ticket))
            .catch((e) => toast.error(e.message))
            .finally(() => setLoading(false));

    useEffect(() => {
        load();
        superService.listCanned().then((r) => setCanned(r.items || [])).catch(() => {});
        // eslint-disable-next-line
    }, [id]);

    useEffect(() => {
        msgsEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [ticket?.messages?.length]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div>;
    if (!ticket) return null;

    const send = async () => {
        if (!body.trim()) return;
        setSending(true);
        try {
            await superService.replyTicket(ticket.id, { body_md: body, is_internal: isInternal });
            setBody('');
            setIsInternal(false);
            await load();
        } catch (e) { toast.error(e.message); }
        finally { setSending(false); }
    };

    const setStatus = async (status) => {
        try {
            await superService.patchTicket(ticket.id, { status });
            toast.success(`Estado: ${status}`);
            load();
        } catch (e) { toast.error(e.message); }
    };

    const setPriority = async (priority) => {
        try {
            await superService.patchTicket(ticket.id, { priority });
            toast.success(`Prioridad: ${priority}`);
            load();
        } catch (e) { toast.error(e.message); }
    };

    const useCanned = (c) => {
        setBody((b) => (b ? b + '\n\n' : '') + c.body_md);
    };

    return (
        <div>
            <Link to="/super/tickets" className="sp-btn-secondary" style={{ marginBottom: 12 }}>
                <ArrowLeft size={14} /> Volver a tickets
            </Link>

            <div className="sp-header">
                <div>
                    <h1 className="sp-title">
                        Ticket <span style={{ color: '#64748b' }}>#{ticket.ticket_number}</span>
                    </h1>
                    <p className="sp-subtitle">{ticket.subject}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={ticket.priority} onChange={(e) => setPriority(e.target.value)} className="sp-input" style={{ maxWidth: 150 }}>
                        <option value="low">Baja</option>
                        <option value="normal">Normal</option>
                        <option value="high">Alta</option>
                        <option value="urgent">Urgente</option>
                    </select>
                    {ticket.status !== 'resolved' ? (
                        <button className="sp-btn-primary" onClick={() => setStatus('resolved')}>
                            <CheckCircle2 size={14} /> Resolver
                        </button>
                    ) : (
                        <button className="sp-btn-secondary" onClick={() => setStatus('open')}>Reabrir</button>
                    )}
                </div>
            </div>

            {/* Info sidebar */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                {/* Conversación */}
                <div className="sp-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 500 }}>
                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8, maxHeight: '60vh' }}>
                        {ticket.messages.map((m) => {
                            const isAdmin = m.author_type === 'admin';
                            return (
                                <div key={m.id} style={{
                                    marginBottom: 14,
                                    background: m.is_internal ? 'rgba(250,204,21,0.1)' : (isAdmin ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)'),
                                    border: `1px solid ${m.is_internal ? 'rgba(250,204,21,0.3)' : (isAdmin ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)')}`,
                                    borderRadius: 12,
                                    padding: 14,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: '0.82rem' }}>
                                        <strong style={{ color: '#f1f5f9' }}>
                                            {m.is_internal && <Lock size={12} style={{ verticalAlign: -1, color: '#facc15', marginRight: 4 }} />}
                                            {m.author?.full_name || (isAdmin ? 'Admin' : 'Cliente')}
                                            {m.is_internal && <span style={{ marginLeft: 8, color: '#facc15', fontSize: '0.72rem' }}>NOTA INTERNA</span>}
                                        </strong>
                                        <span style={{ color: '#64748b', fontSize: '0.78rem' }}>{fmtDateTime(m.created_at)}</span>
                                    </div>
                                    <div style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1', fontSize: '0.92rem', lineHeight: 1.55 }}>
                                        {m.body_md}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={msgsEnd} />
                    </div>

                    {/* Composer */}
                    <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12, marginTop: 12 }}>
                        {canned.length > 0 && (
                            <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {canned.slice(0, 5).map((c) => (
                                    <button key={c.id} onClick={() => useCanned(c)} className="sp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                                        {c.shortcut}
                                    </button>
                                ))}
                            </div>
                        )}
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder={isInternal ? 'Nota interna (no visible al cliente)...' : 'Responder al cliente...'}
                            className="sp-input"
                            rows={4}
                            style={{ marginBottom: 8, resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: '0.86rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                                <Lock size={12} /> Nota interna
                            </label>
                            <button className="sp-btn-primary" onClick={send} disabled={sending || !body.trim()}>
                                {sending ? <Loader2 className="spin" size={14} /> : <Send size={14} />} Enviar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Info del ticket */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="sp-card">
                        <h2>Ticket</h2>
                        <div style={{ display: 'grid', gap: 8, fontSize: '0.88rem' }}>
                            <div><span style={{ color: '#64748b' }}>Estado:</span> {ticket.status}</div>
                            <div><span style={{ color: '#64748b' }}>Prioridad:</span> {ticket.priority}</div>
                            <div><span style={{ color: '#64748b' }}>Categoría:</span> {ticket.category}</div>
                            <div><span style={{ color: '#64748b' }}>Creado:</span> {fmtDateTime(ticket.created_at)}</div>
                            {ticket.first_response_at && <div><span style={{ color: '#64748b' }}>1ª respuesta:</span> {fmtDateTime(ticket.first_response_at)}</div>}
                            {ticket.resolved_at && <div><span style={{ color: '#64748b' }}>Resuelto:</span> {fmtDateTime(ticket.resolved_at)}</div>}
                        </div>
                    </div>

                    {ticket.workspace && (
                        <div className="sp-card">
                            <h2>Taller</h2>
                            <div style={{ fontSize: '0.9rem' }}>
                                <Link to={`/super/workspaces/${ticket.workspace.id}`} style={{ color: '#fca5a5', textDecoration: 'none', fontWeight: 600 }}>
                                    {ticket.workspace.is_flagship && <Crown size={14} style={{ color: '#facc15', verticalAlign: -2, marginRight: 4 }} />}
                                    {ticket.workspace.name}
                                </Link>
                                <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 2 }}>/{ticket.workspace.slug}</div>
                            </div>
                        </div>
                    )}

                    {ticket.creator && (
                        <div className="sp-card">
                            <h2>Cliente</h2>
                            <div style={{ fontSize: '0.9rem' }}>
                                <User size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                                <strong>{ticket.creator.full_name}</strong>
                                <div style={{ color: '#64748b', fontSize: '0.82rem' }}>{ticket.creator.email}</div>
                                {ticket.creator.phone && <div style={{ color: '#64748b', fontSize: '0.82rem' }}>{ticket.creator.phone}</div>}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
