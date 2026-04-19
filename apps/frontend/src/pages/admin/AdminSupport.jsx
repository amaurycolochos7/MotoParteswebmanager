import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LifeBuoy, Plus, Clock, Loader2, AlertCircle } from 'lucide-react';
import { ticketsService } from '../../lib/api';

function fmtDate(d) {
    const delta = Date.now() - new Date(d).getTime();
    if (delta < 60000) return 'ahora';
    if (delta < 3600000) return `hace ${Math.floor(delta / 60000)}m`;
    if (delta < 86400000) return `hace ${Math.floor(delta / 3600000)}h`;
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function statusLabel(s) {
    return {
        open: 'Abierto',
        waiting_admin: 'Esperando soporte',
        waiting_customer: 'Esperando tu respuesta',
        resolved: 'Resuelto',
        closed: 'Cerrado',
    }[s] || s;
}

function statusColor(s) {
    return {
        open: '#3b82f6',
        waiting_admin: '#f59e0b',
        waiting_customer: '#a855f7',
        resolved: '#16a34a',
        closed: '#64748b',
    }[s] || '#64748b';
}

export default function AdminSupport() {
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        ticketsService.list()
            .then((r) => setItems(r.items || []))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <LifeBuoy size={22} /> Soporte
                    </h1>
                    <p style={{ color: '#64748b', margin: 0 }}>Abre un ticket y te respondemos personalmente.</p>
                </div>
                <Link to="/admin/support/new" className="btn btn-primary" style={{ background: '#ef4444', color: 'white', padding: '10px 18px', borderRadius: 10, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={16} /> Nuevo ticket
                </Link>
            </div>

            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
                        <Loader2 className="spin" size={28} />
                    </div>
                ) : items.length === 0 ? (
                    <div style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
                        <AlertCircle size={36} style={{ marginBottom: 10 }} />
                        <p>Todavía no tienes tickets.</p>
                        <p style={{ fontSize: '0.88rem' }}>Crea uno cuando necesites ayuda.</p>
                    </div>
                ) : (
                    <div>
                        {items.map((t) => (
                            <Link
                                key={t.id}
                                to={`/admin/support/${t.id}`}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: 16, borderBottom: '1px solid #f1f5f9', textDecoration: 'none', color: '#0f172a',
                                    transition: 'background 0.15s',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>#{t.ticket_number}</span>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
                                            color: statusColor(t.status),
                                            background: `${statusColor(t.status)}22`,
                                        }}>
                                            {statusLabel(t.status)}
                                        </span>
                                        {t.customer_unread > 0 && <span style={{ background: '#ef4444', color: 'white', padding: '1px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>NUEVO</span>}
                                    </div>
                                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: 2 }}>{t.category}</div>
                                </div>
                                <div style={{ color: '#94a3b8', fontSize: '0.78rem', marginLeft: 12, whiteSpace: 'nowrap' }}>
                                    <Clock size={12} style={{ verticalAlign: -1, marginRight: 2 }} />
                                    {fmtDate(t.last_message_at)}
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
