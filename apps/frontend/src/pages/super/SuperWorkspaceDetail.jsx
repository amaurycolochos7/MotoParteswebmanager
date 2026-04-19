import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Crown, Award, Building2, CreditCard, Pause, Play,
    CalendarClock, UserCog, AlertTriangle, Loader2, Gift,
} from 'lucide-react';
import { superService, workspaceService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
}

export default function SuperWorkspaceDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [data, setData] = useState(null);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    // Modales
    const [showPlan, setShowPlan] = useState(false);
    const [showTrial, setShowTrial] = useState(false);
    const [showSuspend, setShowSuspend] = useState(false);
    const [showImpersonate, setShowImpersonate] = useState(false);

    const load = () => {
        setLoading(true);
        Promise.all([
            superService.getWorkspace(id),
            workspaceService.listPublicPlans().catch(() => []),
        ])
            .then(([d, p]) => {
                setData(d);
                setPlans(Array.isArray(p) ? p : (p?.plans || p?.items || []));
            })
            .catch((e) => toast.error(e?.message || 'Error cargando'))
            .finally(() => setLoading(false));
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div>;
    if (!data) return null;

    const ws = data.workspace;

    const doTogglePartner = async () => {
        setBusy(true);
        try { await superService.togglePartner(ws.id); toast.success('Partner actualizado'); load(); }
        catch (e) { toast.error(e.message); }
        finally { setBusy(false); }
    };

    const doUnsuspend = async () => {
        setBusy(true);
        try { await superService.unsuspend(ws.id); toast.success('Reactivado'); load(); }
        catch (e) { toast.error(e.message); }
        finally { setBusy(false); }
    };

    return (
        <div>
            <Link to="/super/workspaces" className="sp-btn-secondary" style={{ marginBottom: 16 }}>
                <ArrowLeft size={14} /> Volver
            </Link>

            <div className="sp-header">
                <div>
                    <h1 className="sp-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {ws.is_flagship && <Crown size={22} style={{ color: '#facc15' }} />}
                        {ws.is_partner && <Award size={22} style={{ color: '#a855f7' }} />}
                        {ws.name}
                    </h1>
                    <p className="sp-subtitle">slug: <code>/{ws.slug}</code> · creado {fmtDate(ws.created_at)}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!ws.is_flagship && (
                        ws.is_active ? (
                            <button className="sp-btn-danger" onClick={() => setShowSuspend(true)} disabled={busy}>
                                <Pause size={14} /> Suspender
                            </button>
                        ) : (
                            <button className="sp-btn-primary" onClick={doUnsuspend} disabled={busy}>
                                <Play size={14} /> Reactivar
                            </button>
                        )
                    )}
                    <button className="sp-btn-secondary" onClick={doTogglePartner} disabled={busy}>
                        <Award size={14} /> {ws.is_partner ? 'Quitar partner' : 'Marcar partner'}
                    </button>
                    <button className="sp-btn-secondary" onClick={() => setShowTrial(true)}>
                        <CalendarClock size={14} /> Extender trial
                    </button>
                    <button className="sp-btn-primary" onClick={() => setShowPlan(true)}>
                        <CreditCard size={14} /> Asignar plan
                    </button>
                    <button className="sp-btn-secondary" onClick={() => setShowImpersonate(true)}>
                        <UserCog size={14} /> Impersonar
                    </button>
                </div>
            </div>

            {!ws.is_active && (
                <div className="sp-card" style={{ marginBottom: 16, borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
                    <AlertTriangle size={16} style={{ color: '#ef4444', verticalAlign: -3, marginRight: 6 }} />
                    <strong style={{ color: '#fca5a5' }}>Suspendido</strong> — {ws.suspended_reason}
                    <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 4 }}>desde {fmtDate(ws.suspended_at)}</div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* Suscripción */}
                <div className="sp-card">
                    <h2>Suscripción</h2>
                    <div style={{ display: 'grid', gap: 8, fontSize: '0.9rem' }}>
                        <div><span style={{ color: '#64748b' }}>Plan actual:</span> <strong>{ws.plan?.name || 'Sin plan'}</strong> {ws.plan?.price_mxn_monthly > 0 && `($${ws.plan.price_mxn_monthly}/mes)`}</div>
                        <div><span style={{ color: '#64748b' }}>Status:</span> {ws.subscription_status}</div>
                        <div><span style={{ color: '#64748b' }}>Fuente:</span> {ws.subscription?.source || 'stripe'}</div>
                        {ws.subscription?.manual_expires_at && (
                            <div><span style={{ color: '#64748b' }}>Vence (manual):</span> {fmtDate(ws.subscription.manual_expires_at)}</div>
                        )}
                        {ws.trial_ends_at && (
                            <div><span style={{ color: '#64748b' }}>Trial termina:</span> {fmtDate(ws.trial_ends_at)}</div>
                        )}
                        {ws.subscription?.manual_note && (
                            <div style={{ color: '#94a3b8', fontSize: '0.82rem', marginTop: 6 }}>Nota: {ws.subscription.manual_note}</div>
                        )}
                    </div>
                </div>

                {/* Uso */}
                <div className="sp-card">
                    <h2>Uso & métricas</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.9rem' }}>
                        <div><div style={{ color: '#64748b', fontSize: '0.78rem' }}>Clientes</div><strong style={{ fontSize: '1.2rem' }}>{ws._count.clients}</strong></div>
                        <div><div style={{ color: '#64748b', fontSize: '0.78rem' }}>Motos</div><strong style={{ fontSize: '1.2rem' }}>{ws._count.motorcycles}</strong></div>
                        <div><div style={{ color: '#64748b', fontSize: '0.78rem' }}>Órdenes</div><strong style={{ fontSize: '1.2rem' }}>{ws._count.orders}</strong></div>
                        <div><div style={{ color: '#64748b', fontSize: '0.78rem' }}>Citas</div><strong style={{ fontSize: '1.2rem' }}>{ws._count.appointments}</strong></div>
                    </div>
                </div>
            </div>

            {/* Miembros */}
            <div className="sp-card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
                <h2 style={{ padding: '16px 20px 0' }}>Miembros ({ws.memberships.length})</h2>
                <div className="sp-table-wrap">
                    <table className="sp-table">
                        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th></tr></thead>
                        <tbody>
                            {ws.memberships.map((m) => (
                                <tr key={m.id}>
                                    <td><strong>{m.profile?.full_name || '—'}</strong></td>
                                    <td style={{ color: '#64748b' }}>{m.profile?.email}</td>
                                    <td><span className="sp-pill sp-pill-blue">{m.role}</span></td>
                                    <td>{m.profile?.is_active ? <span className="sp-pill sp-pill-green">Activo</span> : <span className="sp-pill sp-pill-red">Inactivo</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Últimas órdenes + tickets */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <h2 style={{ padding: '16px 20px 0' }}>Últimas órdenes</h2>
                    {data.recent_orders.length === 0 ? (
                        <div className="sp-empty">Sin órdenes todavía</div>
                    ) : (
                        <div className="sp-table-wrap">
                            <table className="sp-table">
                                <thead><tr><th>Folio</th><th>Status</th><th>Total</th><th>Fecha</th></tr></thead>
                                <tbody>
                                    {data.recent_orders.map((o) => (
                                        <tr key={o.id}>
                                            <td><strong>{o.order_number}</strong></td>
                                            <td>{o.status}</td>
                                            <td>${Number(o.total || 0).toLocaleString('es-MX')}</td>
                                            <td style={{ color: '#64748b', fontSize: '0.82rem' }}>{fmtDate(o.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <h2 style={{ padding: '16px 20px 0' }}>Tickets</h2>
                    {data.tickets.length === 0 ? (
                        <div className="sp-empty">Sin tickets</div>
                    ) : (
                        <div className="sp-table-wrap">
                            <table className="sp-table">
                                <thead><tr><th>#</th><th>Asunto</th><th>Estado</th><th>Prioridad</th></tr></thead>
                                <tbody>
                                    {data.tickets.map((t) => (
                                        <tr key={t.id}>
                                            <td><Link to={`/super/tickets/${t.id}`}>#{t.ticket_number}</Link></td>
                                            <td>{t.subject}</td>
                                            <td>{t.status}</td>
                                            <td>{t.priority}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {showPlan && (
                <ModalAssignPlan ws={ws} plans={plans} onClose={() => setShowPlan(false)} onDone={() => { setShowPlan(false); load(); }} />
            )}
            {showTrial && (
                <ModalExtendTrial ws={ws} onClose={() => setShowTrial(false)} onDone={() => { setShowTrial(false); load(); }} />
            )}
            {showSuspend && (
                <ModalSuspend ws={ws} onClose={() => setShowSuspend(false)} onDone={() => { setShowSuspend(false); load(); }} />
            )}
            {showImpersonate && (
                <ModalImpersonate ws={ws} onClose={() => setShowImpersonate(false)} />
            )}

            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// Modales
function ModalShell({ title, children, onClose }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 70,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <div className="sp-card" style={{ maxWidth: 500, width: '100%', padding: 28 }}>
                <h2 style={{ marginTop: 0, marginBottom: 16 }}>{title}</h2>
                {children}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                    <button className="sp-btn-secondary" onClick={onClose}>Cancelar</button>
                </div>
            </div>
        </div>
    );
}

function ModalAssignPlan({ ws, plans, onClose, onDone }) {
    const toast = useToast();
    const [planCode, setPlanCode] = useState(plans[0]?.code || 'pro');
    const [expires, setExpires] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        try {
            await superService.assignPlan(ws.id, { plan_code: planCode, expires_at: expires || null, note });
            toast.success('Plan asignado');
            onDone();
        } catch (e) { toast.error(e.message); }
        finally { setBusy(false); }
    };

    return (
        <ModalShell title="Asignar plan manual" onClose={onClose}>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Este plan NO pasa por Stripe. Útil para cortesías.</p>
            <label className="sp-label">Plan</label>
            <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} className="sp-input">
                {plans.map((p) => <option key={p.code} value={p.code}>{p.name} — ${p.price_mxn_monthly}/mes</option>)}
                <option value="flagship">Flagship (sin límite)</option>
            </select>
            <label className="sp-label" style={{ marginTop: 12 }}>Vence (opcional, ISO date)</label>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="sp-input" />
            <label className="sp-label" style={{ marginTop: 12 }}>Nota</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Cortesía 30d por bug" className="sp-input" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="sp-btn-primary" onClick={submit} disabled={busy}>
                    {busy ? <Loader2 className="spin" size={14} /> : null} Asignar
                </button>
            </div>
        </ModalShell>
    );
}

function ModalExtendTrial({ ws, onClose, onDone }) {
    const toast = useToast();
    const [days, setDays] = useState(14);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        setBusy(true);
        try {
            await superService.extendTrial(ws.id, { days: parseInt(days, 10), reason });
            toast.success(`Trial extendido ${days} días`);
            onDone();
        } catch (e) { toast.error(e.message); }
        finally { setBusy(false); }
    };
    return (
        <ModalShell title="Extender trial" onClose={onClose}>
            <label className="sp-label">Días a agregar</label>
            <input type="number" min="1" max="365" value={days} onChange={(e) => setDays(e.target.value)} className="sp-input" />
            <label className="sp-label" style={{ marginTop: 12 }}>Razón (opcional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="sp-input" placeholder="Ej: Cliente pidió más tiempo" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="sp-btn-primary" onClick={submit} disabled={busy}>Extender</button>
            </div>
        </ModalShell>
    );
}

function ModalSuspend({ ws, onClose, onDone }) {
    const toast = useToast();
    const [reason, setReason] = useState('');
    const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false);
    const mustMatch = ws.slug.toUpperCase();
    const submit = async () => {
        if (confirm !== mustMatch) return toast.error(`Escribe "${mustMatch}" para confirmar.`);
        if (!reason.trim()) return toast.error('Razón requerida');
        setBusy(true);
        try { await superService.suspend(ws.id, reason); toast.success('Suspendido'); onDone(); }
        catch (e) { toast.error(e.message); } finally { setBusy(false); }
    };
    return (
        <ModalShell title="⚠ Suspender taller" onClose={onClose}>
            <p style={{ color: '#fca5a5', fontSize: '0.88rem' }}>
                El taller no podrá iniciar sesión hasta que lo reactives. Los datos NO se borran.
            </p>
            <label className="sp-label">Razón (requerida)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="sp-input" placeholder="Ej: Pago fallido 30+ días" />
            <label className="sp-label" style={{ marginTop: 12 }}>Escribe "{mustMatch}" para confirmar</label>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="sp-input" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="sp-btn-danger" onClick={submit} disabled={busy || confirm !== mustMatch}>Suspender</button>
            </div>
        </ModalShell>
    );
}

function ModalImpersonate({ ws, onClose }) {
    const toast = useToast();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (!reason.trim()) return toast.error('Razón requerida');
        setBusy(true);
        try {
            const res = await superService.impersonate(ws.id, reason);
            sessionStorage.setItem('mp_impersonation', JSON.stringify({
                session_id: res.session_id,
                workspace_id: ws.id,
                workspace_name: ws.name,
                expires_at: res.expires_at,
            }));
            localStorage.setItem('motopartes_token', res.token);
            localStorage.setItem('motopartes_user', JSON.stringify(res.profile));
            toast.success(`Impersonando ${ws.name}`);
            // Redirigir al admin del workspace (no a /super).
            window.location.href = '/admin';
        } catch (e) { toast.error(e.message); setBusy(false); }
    };
    return (
        <ModalShell title="Impersonar taller" onClose={onClose}>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
                Entrarás como el owner de <strong>{ws.name}</strong> por 1 hora. Todo lo que hagas queda auditado.
            </p>
            <label className="sp-label">Razón (requerida)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="sp-input" placeholder="Ej: Debug ticket #123" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button className="sp-btn-primary" onClick={submit} disabled={busy}>Entrar como taller</button>
            </div>
        </ModalShell>
    );
}
