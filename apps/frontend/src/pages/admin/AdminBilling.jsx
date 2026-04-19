import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { billingService } from '../../lib/api';
import {
    Sparkles,
    CreditCard,
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    TrendingUp,
    Loader2,
    XCircle,
} from 'lucide-react';

function money(n) {
    return n === 0 ? 'Gratis' : `$${Number(n).toLocaleString('es-MX')}`;
}

function daysBetween(a, b) {
    return Math.ceil((new Date(a) - new Date(b)) / (24 * 60 * 60 * 1000));
}

function usageBar(used, limit) {
    if (limit === null || limit === undefined) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
}

function prettyLimit(n) {
    return n === null || n === undefined ? 'Ilimitado' : Number(n).toLocaleString('es-MX');
}

export default function AdminBilling() {
    const { workspaceRole } = useAuth();
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [status, setStatus] = useState(null);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [changing, setChanging] = useState(null); // plan_code being switched to
    const [interval, setInterval] = useState('month');

    const refresh = async () => {
        try {
            const [st, pl] = await Promise.all([
                billingService.getStatus(),
                billingService.listPlans(),
            ]);
            setStatus(st);
            setPlans(pl.filter((p) => p.code !== 'flagship'));
        } catch (err) {
            toast.error(err.message || 'No pudimos cargar tu plan.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    useEffect(() => {
        const s = params.get('status');
        if (s === 'success') {
            toast.success('¡Pago recibido! Tu plan se actualizará en segundos.');
            setTimeout(refresh, 2000);
            setParams({});
        } else if (s === 'cancel') {
            toast.info?.('Cancelaste el proceso de pago.');
            setParams({});
        }
    }, [params]);

    const handleCheckout = async (plan_code) => {
        if (workspaceRole !== 'owner') {
            toast.error('Sólo el propietario del taller puede cambiar el plan.');
            return;
        }
        setChanging(plan_code);
        try {
            const { url } = await billingService.checkout({ plan_code, interval });
            window.location.href = url;
        } catch (err) {
            toast.error(err.message || 'No pudimos iniciar el cobro.');
            setChanging(null);
        }
    };

    const handlePortal = async () => {
        try {
            const { url } = await billingService.openPortal();
            window.location.href = url;
        } catch (err) {
            toast.error(err.message || 'No pudimos abrir el portal.');
        }
    };

    const handleCancel = async () => {
        if (!confirm('¿Seguro que quieres cancelar la suscripción al final del periodo actual?')) return;
        try {
            await billingService.cancelSubscription();
            toast.success('Cancelación programada al cierre del periodo.');
            await refresh();
        } catch (err) {
            toast.error(err.message || 'No pudimos cancelar.');
        }
    };

    const handleResume = async () => {
        try {
            await billingService.resumeSubscription();
            toast.success('Suscripción reactivada.');
            await refresh();
        } catch (err) {
            toast.error(err.message || 'No pudimos reanudar.');
        }
    };

    if (loading || !status) {
        return <div style={{ padding: 32 }}><Loader2 className="spin" size={18} /> Cargando…</div>;
    }

    const currentPlan = status.plan;
    const isFlagship = status.is_flagship;
    const isTrialing = status.subscription_status === 'trialing';
    const trialLeft = isTrialing && status.trial_ends_at
        ? Math.max(0, daysBetween(status.trial_ends_at, new Date()))
        : null;
    const pendingCancel = status.subscription?.cancel_at && !status.subscription?.canceled_at;

    return (
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>Facturación y plan</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b' }}>Consulta tu plan, uso y cambia de plan cuando quieras.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#fef2f2', borderRadius: 999, border: '1px solid #fecaca' }}>
                    <Sparkles size={16} color="#ef4444" />
                    <strong style={{ color: '#dc2626', fontSize: '0.9rem' }}>
                        Plan {currentPlan?.name || 'Free'}
                    </strong>
                </div>
            </div>

            {/* Trial banner */}
            {isTrialing && !isFlagship && (
                <div style={{ padding: 16, borderRadius: 12, background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div>
                        <strong style={{ color: '#1e40af', display: 'block', marginBottom: 4 }}>
                            Estás probando el plan Pro gratis
                        </strong>
                        <span style={{ color: '#1e40af', fontSize: '0.9rem' }}>
                            {trialLeft > 0 ? `Quedan ${trialLeft} días de prueba.` : 'La prueba terminó. Elige un plan para no perder las funciones Pro.'}
                        </span>
                    </div>
                    <button className="btn-primary" onClick={() => document.getElementById('plans-section').scrollIntoView({ behavior: 'smooth' })}>
                        Elegir plan
                    </button>
                </div>
            )}

            {/* Cancelation banner */}
            {pendingCancel && (
                <div style={{ padding: 16, borderRadius: 12, background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div>
                        <strong style={{ color: '#c2410c', display: 'block', marginBottom: 4 }}>
                            Suscripción cancelada al final del periodo
                        </strong>
                        <span style={{ color: '#9a3412', fontSize: '0.9rem' }}>
                            Seguirás teniendo acceso hasta el {new Date(status.subscription.cancel_at).toLocaleDateString('es-MX')}.
                        </span>
                    </div>
                    <button className="btn-ghost" onClick={handleResume}>Reactivar</button>
                </div>
            )}

            {/* Past-due banner */}
            {status.subscription_status === 'past_due' && (
                <div style={{ padding: 16, borderRadius: 12, background: '#fef2f2', border: '1px solid #fca5a5', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <AlertTriangle size={18} color="#dc2626" />
                        <strong style={{ color: '#991b1b' }}>Tu último pago falló</strong>
                    </div>
                    <p style={{ margin: 0, color: '#7f1d1d', fontSize: '0.88rem' }}>
                        Actualiza tu tarjeta desde el portal antes de que terminen 7 días o tu taller bajará al plan Free automáticamente.
                    </p>
                    <button className="btn-primary" style={{ marginTop: 10 }} onClick={handlePortal}>
                        <ExternalLink size={14} /> Abrir portal de pagos
                    </button>
                </div>
            )}

            {/* Usage */}
            <div className="bill-grid" style={{ marginBottom: 28 }}>
                <UsageCard
                    label="Órdenes este mes"
                    used={status.usage.orders_count}
                    limit={currentPlan?.features?.orders_per_month}
                />
                <UsageCard
                    label="Mensajes WhatsApp"
                    used={status.usage.whatsapp_messages}
                    limit={currentPlan?.features?.whatsapp_messages}
                />
                <UsageCard
                    label="Almacenamiento"
                    used={(Number(status.usage.storage_bytes) / (1024 ** 3)).toFixed(2) + ' GB'}
                    limit={currentPlan?.features?.storage_gb ? `${currentPlan.features.storage_gb} GB` : null}
                    raw
                />
            </div>

            {isFlagship ? (
                <div style={{ padding: 20, background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: 14, border: '1px solid #fcd34d' }}>
                    <strong style={{ color: '#92400e' }}>Cortesía flagship</strong>
                    <p style={{ margin: '6px 0 0', color: '#78350f', fontSize: '0.9rem' }}>
                        Este taller tiene acceso perpetuo e ilimitado a todas las funciones sin cobro. No hay nada que elegir.
                    </p>
                </div>
            ) : (
                <>
                    {/* Billing actions */}
                    {status.subscription?.stripe_subscription_id && (
                        <div style={{ marginBottom: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button className="btn-ghost" onClick={handlePortal}>
                                <ExternalLink size={14} /> Portal de pagos
                            </button>
                            {!pendingCancel && (
                                <button className="btn-ghost" onClick={handleCancel} style={{ color: '#b91c1c' }}>
                                    <XCircle size={14} /> Cancelar suscripción
                                </button>
                            )}
                        </div>
                    )}

                    {/* Plans */}
                    <div id="plans-section">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Elige tu plan</h2>
                            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 4 }}>
                                <button
                                    onClick={() => setInterval('month')}
                                    className={`tab ${interval === 'month' ? 'active' : ''}`}
                                >Mensual</button>
                                <button
                                    onClick={() => setInterval('year')}
                                    className={`tab ${interval === 'year' ? 'active' : ''}`}
                                >Anual <span style={{ fontSize: '0.7rem', color: '#16a34a' }}>-20%</span></button>
                            </div>
                        </div>

                        <div className="bill-plans">
                            {plans.map((plan) => {
                                const isCurrent = currentPlan?.code === plan.code;
                                const price = interval === 'year' ? plan.price_mxn_yearly : plan.price_mxn_monthly;
                                return (
                                    <div key={plan.code} className={`bill-plan ${plan.code === 'pro' ? 'hl' : ''}`}>
                                        <h3>{plan.name}</h3>
                                        <div className="bill-price">
                                            <span className="amount">{money(price)}</span>
                                            {price > 0 && <span className="per">/ {interval === 'year' ? 'año' : 'mes'}</span>}
                                        </div>
                                        <ul>
                                            <li>{prettyLimit(plan.features?.orders_per_month)} órdenes / mes</li>
                                            <li>{prettyLimit(plan.features?.users)} usuarios</li>
                                            <li>{prettyLimit(plan.features?.whatsapp_messages)} mensajes WhatsApp</li>
                                            <li>{plan.features?.storage_gb ? `${plan.features.storage_gb} GB` : 'Ilimitado'} almacenamiento</li>
                                            <li>Soporte: {plan.features?.support === 'community' ? 'Comunidad' : plan.features?.support === 'whatsapp-priority' ? 'WhatsApp priority' : 'WhatsApp'}</li>
                                        </ul>
                                        {plan.code === 'free' ? (
                                            <button className="btn-ghost" disabled style={{ width: '100%' }}>
                                                Plan gratis
                                            </button>
                                        ) : isCurrent ? (
                                            <button className="btn-ghost" disabled style={{ width: '100%' }}>
                                                <CheckCircle2 size={14} /> Tu plan actual
                                            </button>
                                        ) : (
                                            <button
                                                className="btn-primary"
                                                style={{ width: '100%' }}
                                                disabled={changing === plan.code}
                                                onClick={() => handleCheckout(plan.code)}
                                            >
                                                {changing === plan.code ? 'Redirigiendo…' : (<><CreditCard size={14} /> Elegir {plan.name}</>)}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            <style>{`
                .bill-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
                @media (max-width: 720px) { .bill-grid { grid-template-columns: 1fr; } }
                .bill-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
                .bill-plan { background: white; border: 2px solid #e2e8f0; border-radius: 14px; padding: 22px 18px; display: flex; flex-direction: column; gap: 8px; }
                .bill-plan.hl { border-color: #ef4444; box-shadow: 0 12px 28px rgba(239,68,68,0.12); }
                .bill-plan h3 { margin: 0 0 4px; font-size: 1.15rem; color: #0f172a; }
                .bill-price .amount { font-size: 1.8rem; font-weight: 800; color: #0f172a; }
                .bill-price .per { font-size: 0.85rem; color: #64748b; margin-left: 4px; }
                .bill-plan ul { list-style: none; padding: 0; margin: 10px 0; display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: #475569; }
                .bill-plan ul li:before { content: '✓ '; color: #16a34a; font-weight: 700; }
                .tab { border: none; background: transparent; padding: 6px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; color: #64748b; cursor: pointer; }
                .tab.active { background: white; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .btn-primary, .btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 0.9rem; border: none; cursor: pointer; transition: all 0.2s; }
                .btn-primary { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; box-shadow: 0 4px 12px rgba(239,68,68,0.22); }
                .btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 16px rgba(239,68,68,0.3); }
                .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
                .btn-ghost { background: white; color: #1e293b; border: 2px solid #e2e8f0; }
                .btn-ghost:hover:not(:disabled) { background: #f8fafc; }
                .btn-ghost:disabled { opacity: 0.55; cursor: default; }
            `}</style>
        </div>
    );
}

function UsageCard({ label, used, limit, raw }) {
    const pct = raw ? 0 : usageBar(used, limit);
    const text = raw
        ? used
        : limit === null || limit === undefined
            ? Number(used).toLocaleString('es-MX')
            : `${Number(used).toLocaleString('es-MX')} / ${Number(limit).toLocaleString('es-MX')}`;
    const near = pct >= 80;
    return (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem', marginBottom: 8 }}>
                <TrendingUp size={14} />
                {label}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: near ? '#dc2626' : '#0f172a' }}>{text}</div>
            {!raw && limit !== null && limit !== undefined && (
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: near ? '#ef4444' : '#10b981', transition: 'width 0.3s' }}></div>
                </div>
            )}
            {raw && limit && (
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 6 }}>de {limit}</div>
            )}
        </div>
    );
}
