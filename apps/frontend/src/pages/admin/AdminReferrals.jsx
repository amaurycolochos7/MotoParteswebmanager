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
        active:    { label: 'Activo',    color: '#16a34a', bg: '#dcfce7' },
        trialing:  { label: 'Prueba',    color: '#0891b2', bg: '#cffafe' },
        past_due:  { label: 'Vencido',   color: '#ea580c', bg: '#ffedd5' },
        canceled:  { label: 'Cancelado', color: '#6b7280', bg: '#f3f4f6' },
        paused:    { label: 'Pausado',   color: '#94a3b8', bg: '#f1f5f9' },
        paid:      { label: 'Pagado',    color: '#16a34a', bg: '#dcfce7' },
        pending:   { label: 'Pendiente', color: '#ea580c', bg: '#ffedd5' },
        skipped:   { label: 'Omitido',   color: '#6b7280', bg: '#f3f4f6' },
    };
    return map[status] || { label: status || '—', color: '#64748b', bg: '#e2e8f0' };
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
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <Loader2 size={32} className="spin" />
                <p>Cargando tu programa de referidos...</p>
            </div>
        );
    }

    if (!data) return null;

    const { workspace, referral, stats, referrals, payouts } = data;
    const isPartner = workspace?.is_partner;
    const effectiveRate = Math.round(referral.effective_rate * 100);

    return (
        <div className="ref-page">
            <div className="ref-header">
                <div>
                    <h1>
                        <Gift size={28} /> Programa de referidos
                    </h1>
                    <p className="ref-sub">
                        Comparte MotoPartes con otros talleres y gana {effectiveRate}% del pago mensual
                        de cada referido {isPartner ? 'de por vida' : 'durante 12 meses'}.
                    </p>
                </div>
                {isPartner && (
                    <div className="ref-partner-badge">
                        <Award size={18} /> Partner — 30% vitalicio
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="ref-stats-grid">
                <div className="ref-stat-card">
                    <div className="ref-stat-icon" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
                        <Users size={22} />
                    </div>
                    <div>
                        <div className="ref-stat-value">{stats.total_referrals}</div>
                        <div className="ref-stat-label">Referidos totales</div>
                    </div>
                </div>
                <div className="ref-stat-card">
                    <div className="ref-stat-icon" style={{ background: '#dcfce7', color: '#166534' }}>
                        <CheckCircle2 size={22} />
                    </div>
                    <div>
                        <div className="ref-stat-value">{stats.paying_referrals}</div>
                        <div className="ref-stat-label">Pagando activo</div>
                    </div>
                </div>
                <div className="ref-stat-card">
                    <div className="ref-stat-icon" style={{ background: '#fef3c7', color: '#a16207' }}>
                        <TrendingUp size={22} />
                    </div>
                    <div>
                        <div className="ref-stat-value">{money(stats.estimated_monthly_commission_mxn)}</div>
                        <div className="ref-stat-label">Comisión mensual estimada</div>
                    </div>
                </div>
                <div className="ref-stat-card">
                    <div className="ref-stat-icon" style={{ background: '#fee2e2', color: '#b91c1c' }}>
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
                                                <span
                                                    className="ref-pill"
                                                    style={{ color: pill.color, background: pill.bg }}
                                                >
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
                                                <span
                                                    className="ref-pill"
                                                    style={{ color: pill.color, background: pill.bg }}
                                                >
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
.ref-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
.ref-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 28px; flex-wrap: wrap; }
.ref-header h1 { display: flex; align-items: center; gap: 10px; font-size: 1.8rem; font-weight: 800; margin: 0 0 6px; color: #0f172a; }
.ref-sub { color: #64748b; margin: 0; max-width: 640px; line-height: 1.5; }
.ref-partner-badge { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: linear-gradient(135deg,#fef3c7,#fde68a); color: #78350f; border: 1px solid #fcd34d; border-radius: 999px; font-weight: 700; font-size: 0.88rem; }
.ref-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 28px; }
.ref-stat-card { display: flex; gap: 14px; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; }
.ref-stat-icon { width: 46px; height: 46px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ref-stat-value { font-size: 1.5rem; font-weight: 800; color: #0f172a; line-height: 1.1; }
.ref-stat-label { color: #64748b; font-size: 0.82rem; margin-top: 2px; }
.ref-link-block { display: grid; grid-template-columns: 1fr 240px; gap: 28px; background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 28px; }
@media (max-width: 720px) { .ref-link-block { grid-template-columns: 1fr; } }
.ref-label { display: block; font-weight: 700; color: #0f172a; margin-bottom: 8px; font-size: 0.9rem; }
.ref-link-row { display: flex; gap: 8px; flex-wrap: wrap; }
.ref-link-input { flex: 1; min-width: 200px; padding: 12px 14px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 0.92rem; background: #f8fafc; font-family: monospace; color: #0f172a; }
.ref-btn-primary, .ref-btn-secondary { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s ease; border: none; }
.ref-btn-primary { background: linear-gradient(135deg,#ef4444,#dc2626); color: white; }
.ref-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(239,68,68,0.25); }
.ref-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.ref-btn-secondary { background: white; color: #1e293b; border: 1.5px solid #cbd5e1; }
.ref-btn-secondary:hover { background: #f8fafc; border-color: #94a3b8; }
.ref-meta { display: flex; gap: 12px; align-items: center; margin-top: 10px; font-size: 0.85rem; color: #64748b; }
.ref-meta code { background: #f1f5f9; padding: 2px 8px; border-radius: 6px; color: #334155; font-weight: 600; }
.ref-link-btn { background: none; border: none; display: inline-flex; align-items: center; gap: 4px; color: #2563eb; cursor: pointer; font-size: 0.85rem; font-weight: 600; padding: 0; }
.ref-link-btn:hover { text-decoration: underline; }
.ref-info-box { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; padding: 12px 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; color: #1e3a8a; font-size: 0.88rem; line-height: 1.5; }
.ref-info-box svg { flex-shrink: 0; margin-top: 2px; }
.ref-qr-panel { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 18px; background: #f8fafc; border-radius: 14px; }
#mp-ref-qr canvas { border-radius: 8px; background: white; padding: 6px; }
.ref-section { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 22px; margin-bottom: 24px; }
.ref-section h2 { font-size: 1.15rem; font-weight: 800; margin: 0 0 16px; color: #0f172a; }
.ref-empty { text-align: center; padding: 40px 16px; color: #94a3b8; }
.ref-empty p { margin: 8px 0; }
.ref-empty-sub { font-size: 0.88rem; color: #cbd5e1; }
.ref-table-wrap { overflow-x: auto; }
.ref-table { width: 100%; border-collapse: collapse; }
.ref-table th { text-align: left; padding: 10px 12px; font-size: 0.78rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
.ref-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; color: #0f172a; }
.ref-table tr:last-child td { border-bottom: none; }
.ref-td-sub { font-size: 0.78rem; color: #94a3b8; margin-top: 2px; }
.ref-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
