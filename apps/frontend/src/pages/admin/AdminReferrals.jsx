import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
    Gift,
    Share2,
    Copy,
    CheckCircle2,
    DollarSign,
    Users,
    TrendingUp,
    Clock,
    Award,
    AlertCircle,
    Download,
    Loader2,
    Edit3,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { referralsService } from '../../lib/api';
import './AdminV3.css';

function money(n) {
    return `$${Number(n || 0).toLocaleString('es-MX')}`;
}

function formatDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
}

function statusPill(status) {
    const map = {
        active:   { label: 'Activo',    tone: 'ok' },
        trialing: { label: 'Prueba',    tone: 'info' },
        past_due: { label: 'Vencido',   tone: 'warn' },
        canceled: { label: 'Cancelado', tone: '' },
        paused:   { label: 'Pausado',   tone: '' },
        paid:     { label: 'Pagado',    tone: 'ok' },
        pending:  { label: 'Pendiente', tone: 'warn' },
        skipped:  { label: 'Omitido',   tone: '' },
    };
    return map[status] || { label: status || '—', tone: '' };
}

export default function AdminReferrals() {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [editSlug, setEditSlug] = useState(false);
    const [slugDraft, setSlugDraft] = useState('');
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const res = await referralsService.getMine();
            setData(res);
            setSlugDraft(res?.referral?.slug || '');
        } catch (err) {
            toast.error(err?.message || 'No pudimos cargar tus referidos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const copyLink = () => {
        const url = data?.referral?.public_url;
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            toast.success('Link copiado.');
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const shareLink = async () => {
        const url = data?.referral?.public_url;
        if (!url) return;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'MotoPartes — sistema para talleres de motos',
                    text: 'Así controlamos las órdenes en mi taller. Pruébalo gratis:',
                    url,
                });
            } catch { /* user canceled */ }
        } else {
            copyLink();
        }
    };

    const downloadQR = () => {
        const canvas = document.querySelector('#mp-ref-qr canvas');
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `motopartes-referral-${data?.referral?.slug || 'qr'}.png`;
        a.click();
    };

    const saveSlug = async () => {
        if (!slugDraft.trim()) return;
        setSaving(true);
        try {
            const res = await referralsService.regenerateSlug(slugDraft.trim().toLowerCase());
            toast.success('Slug actualizado.');
            setEditSlug(false);
            await load();
        } catch (err) {
            toast.error(err?.message || 'No se pudo actualizar.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="adm-loading">
                <Loader2 size={28} className="spin" />
                <p>Cargando tu programa de referidos…</p>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="ref-page">
                <div className="adm-note adm-note--red" role="alert">
                    <AlertCircle size={18} />
                    <div>
                        No pudimos cargar tu programa de referidos.{' '}
                        <button type="button" className="ref-link-btn" onClick={() => { setLoading(true); load(); }}>Reintentar</button>
                    </div>
                </div>
                <style>{styles}</style>
            </div>
        );
    }

    const { workspace, referral, stats, referrals, payouts } = data;
    const isPartner = workspace?.is_partner;
    const effectiveRate = Math.round(referral.effective_rate * 100);

    return (
        <div className="ref-page">
            <div className="ref-header">
                <div>
                    <h1>
                        <Gift size={24} /> Programa de referidos
                    </h1>
                    <p className="ref-sub">
                        Comparte MotoPartes con otros talleres y gana {effectiveRate}% del pago mensual
                        de cada referido {isPartner ? 'de por vida' : 'durante 12 meses'}.
                    </p>
                </div>
                {isPartner && (
                    <div className="ref-partner-badge">
                        <Award size={18} /> Partner: 30% vitalicio
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="ref-stats-grid">
                <div className="ref-stat-card">
                    <div className="ref-stat-icon is-brand">
                        <Users size={22} />
                    </div>
                    <div>
                        <div className="ref-stat-value">{stats.total_referrals}</div>
                        <div className="ref-stat-label">Referidos totales</div>
                    </div>
                </div>
                <div className="ref-stat-card">
                    <div className="ref-stat-icon is-ok">
                        <CheckCircle2 size={22} />
                    </div>
                    <div>
                        <div className="ref-stat-value">{stats.paying_referrals}</div>
                        <div className="ref-stat-label">Pagando activo</div>
                    </div>
                </div>
                <div className="ref-stat-card">
                    <div className="ref-stat-icon is-warn">
                        <TrendingUp size={22} />
                    </div>
                    <div>
                        <div className="ref-stat-value">{money(stats.estimated_monthly_commission_mxn)}</div>
                        <div className="ref-stat-label">Comisión mensual estimada</div>
                    </div>
                </div>
                <div className="ref-stat-card">
                    <div className="ref-stat-icon is-red">
                        <DollarSign size={22} />
                    </div>
                    <div>
                        <div className="ref-stat-value">{money(stats.total_earned_mxn)}</div>
                        <div className="ref-stat-label">Ganado histórico</div>
                    </div>
                </div>
            </div>

            {/* Link + QR */}
            <div className="ref-link-block">
                <div className="ref-link-left">
                    <label className="ref-label">Tu link de referido</label>
                    {!editSlug ? (
                        <div className="ref-link-row">
                            <input value={referral.public_url} readOnly className="ref-link-input" />
                            <button className="ref-btn-primary" onClick={copyLink}>
                                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </button>
                            <button className="ref-btn-secondary" onClick={shareLink}>
                                <Share2 size={16} /> Compartir
                            </button>
                        </div>
                    ) : (
                        <div className="ref-link-row">
                            <input
                                value={slugDraft}
                                onChange={(e) => setSlugDraft(e.target.value)}
                                className="ref-link-input"
                                placeholder="mi-taller"
                                disabled={saving}
                            />
                            <button className="ref-btn-primary" onClick={saveSlug} disabled={saving}>
                                {saving ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                                Guardar
                            </button>
                            <button className="ref-btn-secondary" onClick={() => { setEditSlug(false); setSlugDraft(referral.slug); }}>
                                Cancelar
                            </button>
                        </div>
                    )}

                    <div className="ref-meta">
                        <span>Slug: <code>{referral.slug}</code></span>
                        {!editSlug && (
                            <button className="ref-link-btn" onClick={() => setEditSlug(true)}>
                                <Edit3 size={14} /> Cambiar
                            </button>
                        )}
                    </div>

                    <div className="ref-info-box">
                        <AlertCircle size={16} />
                        <div>
                            <strong>Cómo funciona:</strong> cuando alguien se registra desde tu link,
                            recibes {effectiveRate}% del pago mensual de su plan. El pago se genera el
                            día 1 de cada mes y te lo depositamos al final del mes siguiente por SPEI.
                        </div>
                    </div>
                </div>

                <div className="ref-qr-panel">
                    <div id="mp-ref-qr">
                        <QRCodeCanvas
                            value={referral.public_url}
                            size={180}
                            level="M"
                            includeMargin
                        />
                    </div>
                    <button className="ref-btn-secondary" onClick={downloadQR}>
                        <Download size={16} /> Descargar QR
                    </button>
                </div>
            </div>

            {/* Referidos */}
            <div className="ref-section">
                <h2>Talleres referidos</h2>
                {referrals.length === 0 ? (
                    <div className="ref-empty">
                        <Users size={36} />
                        <p>Todavía no tienes talleres referidos.</p>
                        <p className="ref-empty-sub">Comparte tu link arriba y empieza a ganar.</p>
                    </div>
                ) : (
                    <div className="ref-table-wrap">
                        <table className="ref-table">
                            <thead>
                                <tr>
                                    <th>Taller</th>
                                    <th>Plan</th>
                                    <th>Estado</th>
                                    <th>Comisión</th>
                                    <th>Vigencia</th>
                                    <th>Desde</th>
                                </tr>
                            </thead>
                            <tbody>
                                {referrals.map((r) => {
                                    const pill = statusPill(r.subscription_status);
                                    return (
                                        <tr key={r.id}>
                                            <td>
                                                <strong>{r.referred_name}</strong>
                                                <div className="ref-td-sub">/{r.referred_slug}</div>
                                            </td>
                                            <td>{r.plan_code ? r.plan_code.toUpperCase() : '—'}</td>
                                            <td>
                                                <span className={`adm-badge${pill.tone ? ` adm-badge--${pill.tone}` : ''}`}>
                                                    {pill.label}
                                                </span>
                                            </td>
                                            <td>
                                                <strong>{Math.round(r.commission_rate * 100)}%</strong>
                                                <div className="ref-td-sub">{r.is_lifetime ? 'vitalicio' : '12 meses'}</div>
                                            </td>
                                            <td>{r.is_lifetime ? '∞' : formatDate(r.ends_at)}</td>
                                            <td>{formatDate(r.starts_at)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Payouts */}
            <div className="ref-section">
                <h2>Historial de pagos</h2>
                {payouts.length === 0 ? (
                    <div className="ref-empty">
                        <Clock size={36} />
                        <p>Aún no hay pagos generados.</p>
                        <p className="ref-empty-sub">Los pagos se calculan el día 1 de cada mes.</p>
                    </div>
                ) : (
                    <div className="ref-table-wrap">
                        <table className="ref-table">
                            <thead>
                                <tr>
                                    <th>Período</th>
                                    <th>Talleres</th>
                                    <th>MRR referido</th>
                                    <th>Comisión</th>
                                    <th>Estado</th>
                                    <th>Pagado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payouts.map((p) => {
                                    const pill = statusPill(p.status);
                                    return (
                                        <tr key={p.id}>
                                            <td><strong>{p.period}</strong></td>
                                            <td>{p.referred_count}</td>
                                            <td>{money(p.mrr_referred_mxn)}</td>
                                            <td><strong>{money(p.commission_mxn)}</strong></td>
                                            <td>
                                                <span className={`adm-badge${pill.tone ? ` adm-badge--${pill.tone}` : ''}`}>
                                                    {pill.label}
                                                </span>
                                            </td>
                                            <td>{p.paid_at ? formatDate(p.paid_at) : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
.ref-page { width: 100%; max-width: 1200px; margin: 0 auto; min-width: 0; }
.ref-page * { min-width: 0; }
.ref-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px 20px; margin-bottom: 24px; flex-wrap: wrap; }
.ref-header h1 { display: flex; align-items: center; gap: 10px; font-size: 24px; line-height: 30px; font-weight: 700; margin: 0 0 4px; color: var(--text); }
.ref-header h1 svg { color: var(--brand); flex: 0 0 auto; }
.ref-sub { color: var(--text-2); margin: 0; max-width: 640px; font-size: 14px; line-height: 20px; }
.ref-partner-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: var(--warning-bg); color: var(--warning); border: 1px solid var(--warning-line); border-radius: var(--r-pill); font-weight: 600; font-size: 14px; }
.ref-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 12px; margin-bottom: 24px; }
.ref-stat-card { display: flex; gap: 14px; align-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card); box-shadow: var(--sh-1); padding: 16px; }
.ref-stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.ref-stat-icon.is-brand { background: var(--brand-50); color: var(--brand); }
.ref-stat-icon.is-ok { background: var(--success-bg); color: var(--success); }
.ref-stat-icon.is-warn { background: var(--warning-bg); color: var(--warning); }
.ref-stat-icon.is-red { background: var(--danger-bg); color: var(--danger); }
.ref-stat-value { font-size: 22px; font-weight: 700; color: var(--text); line-height: 1.15; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.ref-stat-label { color: var(--text-2); font-size: 13px; margin-top: 2px; }
.ref-link-block { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card); box-shadow: var(--sh-1); padding: 20px; margin-bottom: 24px; }
@media (max-width: 720px) { .ref-link-block { grid-template-columns: minmax(0, 1fr); padding: 16px; } }
.ref-label { display: block; font-weight: 600; color: var(--text); margin-bottom: 8px; font-size: 14px; }
.ref-link-row { display: flex; gap: 8px; flex-wrap: wrap; }
.ref-link-input { flex: 1 1 200px; min-width: 0; box-sizing: border-box; min-height: 40px; padding: 9px 12px; border: 1px solid var(--line-strong); border-radius: var(--r-control); font: 400 14px var(--font-sans); background: var(--surface-2); color: var(--text); }
.ref-link-input:focus { outline: none; border-color: var(--brand); box-shadow: var(--ring); }
.ref-btn-primary, .ref-btn-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: var(--r-control); font: 600 14px/1 var(--font-sans); cursor: pointer; border: 1px solid transparent; transition: background .15s; }
.ref-btn-primary { background: var(--brand); color: #fff; }
.ref-btn-primary:hover:not(:disabled) { background: var(--brand-hover); }
.ref-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.ref-btn-secondary { background: var(--surface); color: var(--text); border-color: var(--line-strong); }
.ref-btn-secondary:hover { background: var(--surface-2); }
.ref-meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 10px; font-size: 13px; color: var(--text-2); }
.ref-meta code { background: var(--surface-2); border: 1px solid var(--line); padding: 1px 8px; border-radius: 6px; color: var(--text-2); font: 500 13px var(--font-sans); overflow-wrap: anywhere; }
.ref-link-btn { background: none; border: 0; display: inline-flex; align-items: center; gap: 4px; color: var(--brand); cursor: pointer; font: 600 13px var(--font-sans); padding: 0; }
.ref-link-btn:hover { text-decoration: underline; }
.ref-info-box { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; padding: 12px 14px; background: var(--info-bg); border: 1px solid var(--info-line); border-radius: var(--r-control); color: var(--info); font-size: 14px; line-height: 20px; }
.ref-info-box svg { flex: 0 0 auto; margin-top: 2px; }
.ref-qr-panel { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-card); }
#mp-ref-qr canvas { border-radius: 8px; background: #fff; padding: 6px; max-width: 100%; height: auto !important; }
.ref-section { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-card); box-shadow: var(--sh-1); padding: 20px; margin-bottom: 20px; }
.ref-section h2 { font-size: 16px; font-weight: 600; margin: 0 0 14px; color: var(--text); }
.ref-empty { text-align: center; padding: 36px 16px; color: var(--text-3); }
.ref-empty p { margin: 6px 0; }
.ref-empty-sub { font-size: 14px; color: var(--text-3); }
.ref-table-wrap { overflow-x: auto; }
.ref-table { width: 100%; border-collapse: collapse; }
.ref-table th { text-align: left; padding: 10px 12px; font-size: 12px; color: var(--text-3); font-weight: 600; border-bottom: 1px solid var(--line); white-space: nowrap; }
.ref-table td { padding: 12px; border-bottom: 1px solid var(--line); font-size: 14px; color: var(--text); }
.ref-table tr:last-child td { border-bottom: 0; }
.ref-td-sub { font-size: 13px; color: var(--text-3); margin-top: 2px; }
.spin { animation: ref-rot 1s linear infinite; }
@keyframes ref-rot { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .ref-header h1 { font-size: 20px; line-height: 26px; } .ref-section { padding: 16px; } }
`;
