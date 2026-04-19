import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { superService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

function fmtDate(d) {
    try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
}

export default function SuperUsers() {
    const toast = useToast();
    const [q, setQ] = useState('');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = () => {
        setLoading(true);
        superService.listUsers({ q }).then((r) => setItems(r.items)).finally(() => setLoading(false));
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const deactivate = async (u) => {
        if (!confirm(`Desactivar ${u.email}?`)) return;
        try { await superService.deactivateUser(u.id); toast.success('Desactivado'); load(); }
        catch (e) { toast.error(e.message); }
    };
    const reactivate = async (u) => {
        try { await superService.reactivateUser(u.id); toast.success('Reactivado'); load(); }
        catch (e) { toast.error(e.message); }
    };

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title">Usuarios</h1>
                    <p className="sp-subtitle">Todos los perfiles del sistema ({items.length})</p>
                </div>
            </div>

            <div className="sp-card" style={{ marginBottom: 16, padding: 14 }}>
                <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: 'flex', gap: 8 }}>
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por email o nombre..." className="sp-input" />
                    <button className="sp-btn-primary">Buscar</button>
                </form>
            </div>

            <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div> :
                <div className="sp-table-wrap">
                    <table className="sp-table">
                        <thead>
                            <tr><th>Usuario</th><th>Email</th><th>Talleres</th><th>Creado</th><th>Estado</th><th></th></tr>
                        </thead>
                        <tbody>
                            {items.map((u) => (
                                <tr key={u.id}>
                                    <td>
                                        <strong>{u.full_name}</strong>
                                        {u.is_super_admin && <span className="sp-pill sp-pill-purple" style={{ marginLeft: 6, fontSize: '0.7rem' }}><ShieldCheck size={10} style={{ verticalAlign: -1 }} /> SUPER</span>}
                                    </td>
                                    <td style={{ color: '#94a3b8' }}>{u.email}</td>
                                    <td>{u.memberships.length}</td>
                                    <td style={{ color: '#64748b', fontSize: '0.82rem' }}>{fmtDate(u.created_at)}</td>
                                    <td>{u.is_active ? <span className="sp-pill sp-pill-green">Activo</span> : <span className="sp-pill sp-pill-red">Inactivo</span>}</td>
                                    <td>
                                        {u.is_active ? (
                                            <button className="sp-btn-secondary" onClick={() => deactivate(u)} disabled={u.is_super_admin} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                                                Desactivar
                                            </button>
                                        ) : (
                                            <button className="sp-btn-primary" onClick={() => reactivate(u)} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Reactivar</button>
                                        )}
                                    </td>
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
