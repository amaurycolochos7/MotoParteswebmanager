import { useEffect, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { superService } from '../../lib/api';

function fmtDateTime(d) {
    return new Date(d).toLocaleString('es-MX', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

export default function SuperAudit() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ action: '', target_type: '' });

    useEffect(() => {
        setLoading(true);
        superService.audit(filter).then((r) => setItems(r.super_actions || [])).finally(() => setLoading(false));
    }, [filter.action, filter.target_type]);

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title"><ShieldCheck size={22} style={{ verticalAlign: -4, marginRight: 6 }} /> Auditoría</h1>
                    <p className="sp-subtitle">Acciones del super-admin (append-only)</p>
                </div>
            </div>

            <div className="sp-card" style={{ marginBottom: 16, padding: 14 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                    <input
                        value={filter.action}
                        onChange={(e) => setFilter({ ...filter, action: e.target.value })}
                        placeholder="Acción (ej: ticket.reply)"
                        className="sp-input"
                    />
                    <select value={filter.target_type} onChange={(e) => setFilter({ ...filter, target_type: e.target.value })} className="sp-input" style={{ maxWidth: 200 }}>
                        <option value="">Cualquier target</option>
                        <option value="workspace">Workspace</option>
                        <option value="ticket">Ticket</option>
                        <option value="profile">Profile</option>
                        <option value="referral_payout">Payout</option>
                        <option value="canned">Canned</option>
                    </select>
                </div>
            </div>

            <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div> :
                items.length === 0 ? <div className="sp-empty">Sin eventos</div> :
                <div className="sp-table-wrap">
                    <table className="sp-table">
                        <thead><tr><th>Cuando</th><th>Super</th><th>Acción</th><th>Target</th><th>Razón</th></tr></thead>
                        <tbody>
                            {items.map((a) => (
                                <tr key={a.id}>
                                    <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{fmtDateTime(a.created_at)}</td>
                                    <td>{a.super_admin?.email}</td>
                                    <td><code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>{a.action}</code></td>
                                    <td style={{ fontSize: '0.82rem', color: '#94a3b8' }}>{a.target_type}{a.target_id ? `:${a.target_id.slice(0, 8)}` : ''}</td>
                                    <td style={{ color: '#cbd5e1', fontSize: '0.82rem' }}>{a.reason || '—'}</td>
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
