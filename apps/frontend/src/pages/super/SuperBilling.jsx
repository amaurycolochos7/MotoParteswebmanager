import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Loader2, Crown, Award } from 'lucide-react';
import { superService } from '../../lib/api';

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SuperBilling() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('active');
    const [source, setSource] = useState('');

    useEffect(() => {
        setLoading(true);
        superService.listSubscriptions({ status, source }).then((r) => setItems(r.items)).finally(() => setLoading(false));
    }, [status, source]);

    const totalMRR = items.reduce((acc, s) => acc + (s.plan?.price_mxn_monthly || 0), 0);

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title"><CreditCard size={22} style={{ verticalAlign: -4, marginRight: 6 }} /> Suscripciones</h1>
                    <p className="sp-subtitle">{items.length} suscripción(es) · MRR combinado: ${totalMRR.toLocaleString('es-MX')}</p>
                </div>
            </div>

            <div className="sp-card" style={{ marginBottom: 16, padding: 14 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="sp-input" style={{ maxWidth: 180 }}>
                        <option value="">Cualquier estado</option>
                        <option value="active">Active</option>
                        <option value="trialing">Trialing</option>
                        <option value="past_due">Past due</option>
                        <option value="canceled">Canceled</option>
                    </select>
                    <select value={source} onChange={(e) => setSource(e.target.value)} className="sp-input" style={{ maxWidth: 180 }}>
                        <option value="">Cualquier fuente</option>
                        <option value="stripe">Stripe</option>
                        <option value="manual">Manual</option>
                        <option value="grandfathered">Grandfathered</option>
                    </select>
                </div>
            </div>

            <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div> :
                items.length === 0 ? <div className="sp-empty">Sin suscripciones</div> :
                <div className="sp-table-wrap">
                    <table className="sp-table">
                        <thead><tr><th>Taller</th><th>Plan</th><th>MRR</th><th>Estado</th><th>Fuente</th><th>Próximo corte</th></tr></thead>
                        <tbody>
                            {items.map((s) => (
                                <tr key={s.id}>
                                    <td>
                                        <Link to={`/super/workspaces/${s.workspace?.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            {s.workspace?.is_flagship && <Crown size={12} style={{ color: '#facc15' }} />}
                                            {s.workspace?.is_partner && <Award size={12} style={{ color: '#a855f7' }} />}
                                            {s.workspace?.name}
                                        </Link>
                                    </td>
                                    <td>{s.plan?.name}</td>
                                    <td>${s.plan?.price_mxn_monthly || 0}</td>
                                    <td><span className={`sp-pill ${s.status === 'active' ? 'sp-pill-green' : s.status === 'trialing' ? 'sp-pill-blue' : 'sp-pill-gray'}`}>{s.status}</span></td>
                                    <td><span className={`sp-pill ${s.source === 'manual' ? 'sp-pill-purple' : 'sp-pill-gray'}`}>{s.source}</span></td>
                                    <td style={{ color: '#64748b', fontSize: '0.82rem' }}>{fmtDate(s.current_period_end || s.manual_expires_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>}
            </div>
            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
