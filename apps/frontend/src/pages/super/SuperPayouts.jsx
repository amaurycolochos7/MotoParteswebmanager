import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, CheckCircle2, Loader2 } from 'lucide-react';
import { superService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

function money(c) { return `$${Math.round((c || 0) / 100).toLocaleString('es-MX')}`; }
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SuperPayouts() {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [modal, setModal] = useState(null); // payout being paid

    const load = () => {
        setLoading(true);
        superService.listPayouts(status ? { status } : {}).then((r) => setItems(r.items)).finally(() => setLoading(false));
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title"><Gift size={22} style={{ verticalAlign: -4, marginRight: 6 }} /> Pagos de referidos</h1>
                    <p className="sp-subtitle">{items.length} payout(s) en la vista</p>
                </div>
            </div>

            <div className="sp-card" style={{ marginBottom: 16, padding: 14 }}>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="sp-input" style={{ maxWidth: 200 }}>
                    <option value="">Todos</option>
                    <option value="pending">Pendientes</option>
                    <option value="paid">Pagados</option>
                    <option value="skipped">Omitidos</option>
                </select>
            </div>

            <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div> :
                items.length === 0 ? <div className="sp-empty">Sin payouts</div> :
                <div className="sp-table-wrap">
                    <table className="sp-table">
                        <thead><tr><th>Periodo</th><th>Referente</th><th>Talleres</th><th>MRR</th><th>Comisión</th><th>Estado</th><th>Pagado</th><th></th></tr></thead>
                        <tbody>
                            {items.map((p) => (
                                <tr key={p.id}>
                                    <td><strong>{p.period}</strong></td>
                                    <td><Link to={`/super/workspaces/${p.referrer?.id}`}>{p.referrer?.name}</Link></td>
                                    <td>{p.referred_count}</td>
                                    <td>{money(p.mrr_referred_cents)}</td>
                                    <td><strong>{money(p.commission_cents)}</strong></td>
                                    <td>
                                        <span className={`sp-pill ${p.status === 'paid' ? 'sp-pill-green' : p.status === 'skipped' ? 'sp-pill-gray' : 'sp-pill-yellow'}`}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td style={{ color: '#64748b', fontSize: '0.82rem' }}>{fmtDate(p.paid_at)}</td>
                                    <td>
                                        {p.status === 'pending' && (
                                            <button className="sp-btn-primary" onClick={() => setModal(p)} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                                                <CheckCircle2 size={12} /> Marcar pagado
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>}
            </div>

            {modal && <PayModal payout={modal} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function PayModal({ payout, onClose, onDone }) {
    const toast = useToast();
    const [paid_via, setVia] = useState('spei');
    const [reference, setRef] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        setBusy(true);
        try {
            await superService.payPayout(payout.id, { paid_via, reference, notes });
            toast.success('Marcado como pagado');
            onDone();
        } catch (e) { toast.error(e.message); } finally { setBusy(false); }
    };
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="sp-card" style={{ maxWidth: 480, width: '100%', padding: 28 }}>
                <h2 style={{ marginTop: 0 }}>Registrar pago</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
                    {payout.referrer?.name} · {payout.period} · ${Math.round(payout.commission_cents / 100).toLocaleString('es-MX')}
                </p>
                <label className="sp-label">Método</label>
                <select value={paid_via} onChange={(e) => setVia(e.target.value)} className="sp-input">
                    <option value="spei">SPEI</option>
                    <option value="stripe">Stripe</option>
                    <option value="cash">Efectivo</option>
                    <option value="other">Otro</option>
                </select>
                <label className="sp-label" style={{ marginTop: 12 }}>Referencia</label>
                <input value={reference} onChange={(e) => setRef(e.target.value)} className="sp-input" placeholder="Ej: 0123456789" />
                <label className="sp-label" style={{ marginTop: 12 }}>Notas</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="sp-input" />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button className="sp-btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="sp-btn-primary" onClick={submit} disabled={busy}>Marcar pagado</button>
                </div>
            </div>
        </div>
    );
}
