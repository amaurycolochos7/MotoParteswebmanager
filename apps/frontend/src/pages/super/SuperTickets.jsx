import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Ticket, Loader2, Crown, Award, Clock } from 'lucide-react';
import { superService } from '../../lib/api';

function fmtDate(d) {
    if (!d) return '—';
    const now = Date.now();
    const delta = now - new Date(d).getTime();
    if (delta < 60000) return 'hace instantes';
    if (delta < 3600000) return `hace ${Math.floor(delta / 60000)}m`;
    if (delta < 86400000) return `hace ${Math.floor(delta / 3600000)}h`;
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function statusPill(s) {
    return {
        open: 'sp-pill-blue',
        waiting_admin: 'sp-pill-yellow',
        waiting_customer: 'sp-pill-purple',
        resolved: 'sp-pill-green',
        closed: 'sp-pill-gray',
        spam: 'sp-pill-red',
    }[s] || 'sp-pill-gray';
}

function priorityPill(p) {
    return {
        urgent: 'sp-pill-red',
        high: 'sp-pill-yellow',
        normal: 'sp-pill-blue',
        low: 'sp-pill-gray',
    }[p] || 'sp-pill-gray';
}

export default function SuperTickets() {
    const [params, setParams] = useSearchParams();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const status = params.get('status') || '';
    const assigned = params.get('assigned') || '';
    const priority = params.get('priority') || '';

    useEffect(() => {
        setLoading(true);
        superService.listTickets({ status, assigned, priority })
            .then((r) => setItems(r.items))
            .finally(() => setLoading(false));
    }, [status, assigned, priority]);

    const setFilter = (k, v) => {
        const next = new URLSearchParams(params);
        if (v) next.set(k, v); else next.delete(k);
        setParams(next);
    };

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title"><Ticket size={22} style={{ verticalAlign: -4, marginRight: 6 }} /> Tickets</h1>
                    <p className="sp-subtitle">{items.length} tickets en la vista actual</p>
                </div>
            </div>

            <div className="sp-card" style={{ marginBottom: 16, padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <select value={status} onChange={(e) => setFilter('status', e.target.value)} className="sp-input" style={{ maxWidth: 180 }}>
                        <option value="">Cualquier estado</option>
                        <option value="open">Abierto</option>
                        <option value="waiting_admin">Esperando admin</option>
                        <option value="waiting_customer">Esperando cliente</option>
                        <option value="resolved">Resuelto</option>
                        <option value="closed">Cerrado</option>
                    </select>
                    <select value={assigned} onChange={(e) => setFilter('assigned', e.target.value)} className="sp-input" style={{ maxWidth: 180 }}>
                        <option value="">Cualquier asignación</option>
                        <option value="me">Asignados a mí</option>
                        <option value="unassigned">Sin asignar</option>
                    </select>
                    <select value={priority} onChange={(e) => setFilter('priority', e.target.value)} className="sp-input" style={{ maxWidth: 180 }}>
                        <option value="">Cualquier prioridad</option>
                        <option value="urgent">Urgente</option>
                        <option value="high">Alta</option>
                        <option value="normal">Normal</option>
                        <option value="low">Baja</option>
                    </select>
                </div>
            </div>

            <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div>
                ) : items.length === 0 ? (
                    <div className="sp-empty">Sin tickets en este filtro</div>
                ) : (
                    <div className="sp-table-wrap">
                        <table className="sp-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Taller</th>
                                    <th>Asunto</th>
                                    <th>Categoría</th>
                                    <th>Estado</th>
                                    <th>Prioridad</th>
                                    <th>Último mensaje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((t) => (
                                    <tr key={t.id} style={{ cursor: 'pointer' }}>
                                        <td><Link to={`/super/tickets/${t.id}`}>#{t.ticket_number}</Link></td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {t.workspace?.is_flagship && <Crown size={12} style={{ color: '#facc15' }} />}
                                                {t.workspace?.is_partner && <Award size={12} style={{ color: '#a855f7' }} />}
                                                <span>{t.workspace?.name || 'Sin taller'}</span>
                                            </div>
                                            <div style={{ fontSize: '0.76rem', color: '#64748b' }}>{t.creator?.full_name || t.creator?.email}</div>
                                        </td>
                                        <td><Link to={`/super/tickets/${t.id}`}>{t.subject}</Link>
                                            {t.admin_unread > 0 && <span className="sp-pill sp-pill-red" style={{ marginLeft: 6, fontSize: '0.7rem' }}>{t.admin_unread} nuevo</span>}
                                        </td>
                                        <td style={{ color: '#94a3b8', fontSize: '0.82rem' }}>{t.category}</td>
                                        <td><span className={`sp-pill ${statusPill(t.status)}`}>{t.status}</span></td>
                                        <td><span className={`sp-pill ${priorityPill(t.priority)}`}>{t.priority}</span></td>
                                        <td style={{ color: '#64748b', fontSize: '0.82rem' }}>
                                            <Clock size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
                                            {fmtDate(t.last_message_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
