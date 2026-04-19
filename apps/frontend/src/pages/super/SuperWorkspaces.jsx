import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Building2, Crown, Loader2 } from 'lucide-react';
import { superService } from '../../lib/api';

function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
}

function statusPill(status) {
    const map = {
        active:   'sp-pill-green',
        trialing: 'sp-pill-blue',
        past_due: 'sp-pill-yellow',
        canceled: 'sp-pill-gray',
        paused:   'sp-pill-gray',
    };
    return map[status] || 'sp-pill-gray';
}

export default function SuperWorkspaces() {
    const [params, setParams] = useSearchParams();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const q = params.get('q') || '';
    const status = params.get('status') || '';

    useEffect(() => {
        setLoading(true);
        superService.listWorkspaces({ q, status })
            .then((r) => { setItems(r.items); setTotal(r.total); })
            .finally(() => setLoading(false));
    }, [q, status]);

    const onSearch = (e) => {
        e.preventDefault();
        const newQ = e.target.q.value;
        const next = new URLSearchParams(params);
        if (newQ) next.set('q', newQ); else next.delete('q');
        setParams(next);
    };

    const onStatusChange = (e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set('status', e.target.value); else next.delete('status');
        setParams(next);
    };

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title">Talleres</h1>
                    <p className="sp-subtitle">{total} taller(es) en el sistema</p>
                </div>
            </div>

            <div className="sp-card" style={{ marginBottom: 16, padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <form onSubmit={onSearch} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 250 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                            <input
                                name="q"
                                defaultValue={q}
                                placeholder="Buscar por nombre o slug..."
                                className="sp-input"
                                style={{ paddingLeft: 34 }}
                            />
                        </div>
                        <button type="submit" className="sp-btn-primary">Buscar</button>
                    </form>
                    <select value={status} onChange={onStatusChange} className="sp-input" style={{ maxWidth: 200 }}>
                        <option value="">Todos los estados</option>
                        <option value="active">Active</option>
                        <option value="trialing">Trialing</option>
                        <option value="past_due">Past due</option>
                        <option value="canceled">Canceled</option>
                    </select>
                </div>
            </div>

            <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div>
                ) : items.length === 0 ? (
                    <div className="sp-empty">Sin resultados</div>
                ) : (
                    <div className="sp-table-wrap">
                        <table className="sp-table">
                            <thead>
                                <tr>
                                    <th>Taller</th>
                                    <th>Plan</th>
                                    <th>Estado</th>
                                    <th>Fuente</th>
                                    <th>Órdenes</th>
                                    <th>Usuarios</th>
                                    <th>Creado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((w) => (
                                    <tr key={w.id}>
                                        <td>
                                            <Link to={`/super/workspaces/${w.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {w.is_flagship && <Crown size={14} style={{ color: '#facc15' }} />}
                                                <span>
                                                    <strong>{w.name}</strong>
                                                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>/{w.slug}</div>
                                                </span>
                                            </Link>
                                        </td>
                                        <td>{w.plan?.name || '—'} {w.plan?.price_mxn_monthly > 0 && <span style={{ color: '#64748b', fontSize: '0.78rem' }}>${w.plan.price_mxn_monthly}/mes</span>}</td>
                                        <td><span className={`sp-pill ${statusPill(w.subscription_status)}`}>{w.subscription_status}</span></td>
                                        <td>
                                            <span className={`sp-pill ${w.subscription?.source === 'manual' ? 'sp-pill-purple' : 'sp-pill-gray'}`}>
                                                {w.subscription?.source || 'stripe'}
                                            </span>
                                        </td>
                                        <td>{w._count.orders}</td>
                                        <td>{w._count.memberships}</td>
                                        <td style={{ color: '#64748b', fontSize: '0.82rem' }}>{fmtDate(w.created_at)}</td>
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
