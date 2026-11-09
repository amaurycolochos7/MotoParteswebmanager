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
    Check,
} from 'lucide-react';
import { Segmented } from '../../components/ui/kit';
import './AdminV3.css';

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
        return <div className="adm adm-loading"><Loader2 className="adm-spin" size={20} /> Cargando…</div>;
    }

    const currentPlan = status.plan;
    const isFlagship = status.is_flagship;
    const isTrialing = status.subscription_status === 'trialing';
    const trialLeft = isTrialing && status.trial_ends_at
        ? Math.max(0, daysBetween(status.trial_ends_at, new Date()))
        : null;
    const pendingCancel = status.subscription?.cancel_at && !status.subscription?.canceled_at;

    return (
        <div className="adm">
            <header className="adm-head">
                <div>
                    <h1>Facturación y plan</h1>
                    <p>Consulta tu plan, uso y cambia de plan cuando quieras.</p>
                </div>
                <span className="adm-badge adm-badge--brand" style={{ padding: '6px 14px', fontSize: 14 }}>
                    <Sparkles size={15} /> Plan {currentPlan?.name || 'Free'}
                </span>
            </header>

            {isTrialing && !isFlagship && (
                <div className="adm-banner adm-banner--brand">
                    <div>
                        <strong>Estás probando el plan Pro gratis</strong>
                        <span>{trialLeft > 0 ? `Quedan ${trialLeft} días de prueba.` : 'La prueba terminó. Elige un plan para no perder las funciones Pro.'}</span>
                    </div>
                    <button type="button" className="k-btn k-btn--sm" onClick={() => document.getElementById('plans-section').scrollIntoView({ behavior: 'smooth' })}>
                        Elegir plan
                    </button>
                </div>
            )}

            {pendingCancel && (
                <div className="adm-banner adm-banner--warn">
                    <div>
                        <strong>Suscripción cancelada al final del periodo</strong>
                        <span>Seguirás teniendo acceso hasta el {new Date(status.subscription.cancel_at).toLocaleDateString('es-MX')}.</span>
                    </div>
                    <button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={handleResume}>Reactivar</button>
                </div>
            )}

            {status.subscription_status === 'past_due' && (
                <div className="adm-banner adm-banner--red" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={18} />
                        <strong style={{ margin: 0 }}>Tu último pago falló</strong>
                    </div>
                    <span>Actualiza tu tarjeta desde el portal antes de que terminen 7 días o tu taller bajará al plan Free automáticamente.</span>
                    <button type="button" className="k-btn k-btn--sm" onClick={handlePortal}>
                        <ExternalLink size={15} /> Abrir portal de pagos
                    </button>
                </div>
            )}

            <div className="adm-stats adm-usage">
                <UsageCard label="Órdenes este mes" used={status.usage.orders_count} limit={currentPlan?.features?.orders_per_month} />
                <UsageCard label="Mensajes de WhatsApp" used={status.usage.whatsapp_messages} limit={currentPlan?.features?.whatsapp_messages} />
                <UsageCard
                    label="Almacenamiento"
                    used={(Number(status.usage.storage_bytes) / (1024 ** 3)).toFixed(2) + ' GB'}
                    limit={currentPlan?.features?.storage_gb ? `${currentPlan.features.storage_gb} GB` : null}
                    raw
                />
            </div>

            {isFlagship ? (
                <div className="adm-banner adm-banner--warn">
                    <div>
                        <strong>Cortesía flagship</strong>
                        <span>Este taller tiene acceso perpetuo e ilimitado a todas las funciones sin cobro. No hay nada que elegir.</span>
                    </div>
                </div>
            ) : (
                <>
                    {status.subscription?.stripe_subscription_id && (
                        <div className="adm-actions" style={{ marginBottom: 24 }}>
                            <button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={handlePortal}>
                                <ExternalLink size={15} /> Portal de pagos
                            </button>
                            {!pendingCancel && (
                                <button type="button" className="k-btn k-btn--ghost k-btn--sm adm-btn-danger" onClick={handleCancel}>
                                    <XCircle size={15} /> Cancelar suscripción
                                </button>
                            )}
                        </div>
                    )}

                    <div id="plans-section">
                        <div className="adm-planhead">
                            <h2>Elige tu plan</h2>
                            <Segmented
                                items={[{ id: 'month', label: 'Mensual' }, { id: 'year', label: 'Anual (-20%)' }]}
                                value={interval}
                                onChange={setInterval}
                            />
                        </div>

                        <div className="adm-plans">
                            {plans.map((plan) => {
                                const isCurrent = currentPlan?.code === plan.code;
                                const price = interval === 'year' ? plan.price_mxn_yearly : plan.price_mxn_monthly;
                                return (
                                    <div key={plan.code} className={`adm-plan${plan.code === 'pro' ? ' is-hl' : ''}`}>
                                        <h3>{plan.name}</h3>
                                        <div className="adm-plan__price">
                                            <b>{money(price)}</b>
                                            {price > 0 && <span>/ {interval === 'year' ? 'año' : 'mes'}</span>}
                                        </div>
                                        <ul>
                                            <li><Check size={15} /> {prettyLimit(plan.features?.orders_per_month)} órdenes al mes</li>
                                            <li><Check size={15} /> {prettyLimit(plan.features?.users)} usuarios</li>
                                            <li><Check size={15} /> {prettyLimit(plan.features?.whatsapp_messages)} mensajes de WhatsApp</li>
                                            <li><Check size={15} /> {plan.features?.storage_gb ? `${plan.features.storage_gb} GB` : 'Ilimitado'} de almacenamiento</li>
                                            <li><Check size={15} /> Soporte: {plan.features?.support === 'community' ? 'Comunidad' : plan.features?.support === 'whatsapp-priority' ? 'WhatsApp prioritario' : 'WhatsApp'}</li>
                                        </ul>
                                        {plan.code === 'free' ? (
                                            <button type="button" className="k-btn k-btn--ghost" disabled>Plan gratis</button>
                                        ) : isCurrent ? (
                                            <button type="button" className="k-btn k-btn--ghost" disabled><CheckCircle2 size={15} /> Tu plan actual</button>
                                        ) : (
                                            <button type="button" className="k-btn" disabled={changing === plan.code} onClick={() => handleCheckout(plan.code)}>
                                                {changing === plan.code ? 'Redirigiendo…' : (<><CreditCard size={15} /> Elegir {plan.name}</>)}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
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
        <div className="adm-stat">
            <div className="adm-stat__label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={14} /> {label}</div>
            <div className={`adm-stat__value${near ? ' is-bad' : ''}`}>{text}</div>
            {!raw && limit !== null && limit !== undefined && (
                <div className={`adm-bar${near ? ' is-near' : ''}`}><div style={{ width: `${pct}%` }} /></div>
            )}
            {raw && limit && <div className="adm-hint" style={{ marginTop: 6 }}>de {limit}</div>}
        </div>
    );
}
