import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    DollarSign, Building2, TrendingUp, Ticket, AlertTriangle, Clock,
    ArrowRight, Gift, Users, Loader2, BarChart3,
} from 'lucide-react';
import { superService } from '../../lib/api';

function money(n) { return `$${Number(n || 0).toLocaleString('es-MX')}`; }

function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }); }
    catch { return '—'; }
}

// Sparkline SVG — línea simple con área, sin dependencias externas.
function Sparkline({ data, color = '#ef4444', width = 600, height = 120, label }) {
    if (!data?.length) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = width / (data.length - 1 || 1);
    const points = data.map((v, i) => {
        const x = i * stepX;
        const y = height - ((v - min) / range) * (height - 10) - 5;
        return [x, y];
    });
    const path = points.map(([x, y], i) => (i === 0 ? `M ${x},${y}` : `L ${x},${y}`)).join(' ');
    const area = `${path} L ${width},${height} L 0,${height} Z`;

    return (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
            <defs>
                <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#grad-${label})`} />
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function SuperDashboard() {
    const [m, setM] = useState(null);
    const [timeseries, setTimeseries] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    useEffect(() => {
        Promise.all([
            superService.metrics(),
            superService.timeseries(90).catch(() => null),
        ])
            .then(([mt, ts]) => { setM(mt); setTimeseries(ts); })
            .catch((e) => setErr(e?.message || 'Error cargando métricas'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" size={32} /></div>;
    if (err) return <div className="sp-card" style={{ color: '#fca5a5' }}>{err}</div>;

    const cards = [
        { label: 'MRR mensual', value: money(m.mrr_mxn), icon: <DollarSign size={22} />, tint: '#22c55e' },
        { label: 'Talleres activos', value: m.counts.active_workspaces, icon: <Building2 size={22} />, tint: '#3b82f6', extra: `${m.counts.trialing} en trial · ${m.counts.past_due} past due` },
        { label: 'Signups 7d', value: m.counts.signups_last_7d, icon: <TrendingUp size={22} />, tint: '#a855f7' },
        { label: 'Tickets abiertos', value: m.tickets.open, icon: <Ticket size={22} />, tint: m.tickets.urgent > 0 ? '#ef4444' : '#f59e0b', extra: m.tickets.urgent > 0 ? `⚠ ${m.tickets.urgent} urgentes` : null },
        { label: 'Pagos pendientes', value: money(m.payouts.pending_mxn), icon: <Gift size={22} />, tint: '#ec4899', extra: `${m.payouts.pending_count} payout(s)` },
        { label: 'Cancelados 30d', value: m.counts.canceled_last_30d, icon: <AlertTriangle size={22} />, tint: '#f87171' },
    ];

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title">Dashboard</h1>
                    <p className="sp-subtitle">Vista general del negocio · periodo {m.period}</p>
                </div>
            </div>

            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
                {cards.map((c) => (
                    <div key={c.label} className="sp-card" style={{ padding: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
                                <div style={{ color: '#f1f5f9', fontSize: '1.75rem', fontWeight: 800, marginTop: 4 }}>{c.value}</div>
                                {c.extra && <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: 4 }}>{c.extra}</div>}
                            </div>
                            <div style={{ background: `${c.tint}22`, color: c.tint, padding: 10, borderRadius: 10 }}>{c.icon}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Timeseries 90d */}
            {timeseries?.series?.length > 0 && (
                <div className="sp-card" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <h2 style={{ margin: 0 }}><BarChart3 size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Últimos 90 días</h2>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {timeseries.series[0].date} → {timeseries.series[timeseries.series.length - 1].date}
                        </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>MRR (MXN)</div>
                            <Sparkline data={timeseries.series.map((d) => d.mrr_mxn)} color="#22c55e" label="mrr" />
                        </div>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Signups</div>
                            <Sparkline data={timeseries.series.map((d) => d.signups)} color="#3b82f6" label="signups" />
                        </div>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Churn</div>
                            <Sparkline data={timeseries.series.map((d) => d.churn)} color="#ef4444" label="churn" />
                        </div>
                    </div>
                </div>
            )}

            {/* Trials expiring */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="sp-card">
                    <h2><Clock size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Trials que vencen en ≤7 días</h2>
                    {m.trials_expiring_7d.length === 0 ? (
                        <div className="sp-empty">Ninguno</div>
                    ) : (
                        <div className="sp-table-wrap">
                            <table className="sp-table">
                                <thead><tr><th>Taller</th><th>Vence</th><th></th></tr></thead>
                                <tbody>
                                    {m.trials_expiring_7d.map((w) => (
                                        <tr key={w.id}>
                                            <td><Link to={`/super/workspaces/${w.id}`}>{w.name}</Link></td>
                                            <td>{fmtDate(w.trial_ends_at)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <Link to={`/super/workspaces/${w.id}`} className="sp-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                                                    Extender <ArrowRight size={12} />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="sp-card">
                    <h2><Users size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Acciones rápidas</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Link to="/super/workspaces" className="sp-btn-secondary" style={{ justifyContent: 'space-between' }}>
                            Ver todos los talleres <ArrowRight size={14} />
                        </Link>
                        <Link to="/super/tickets?assigned=unassigned" className="sp-btn-secondary" style={{ justifyContent: 'space-between' }}>
                            Tickets sin asignar <ArrowRight size={14} />
                        </Link>
                        <Link to="/super/payouts?status=pending" className="sp-btn-secondary" style={{ justifyContent: 'space-between' }}>
                            Procesar pagos de referidos <ArrowRight size={14} />
                        </Link>
                        <Link to="/super/audit" className="sp-btn-secondary" style={{ justifyContent: 'space-between' }}>
                            Ver auditoría <ArrowRight size={14} />
                        </Link>
                    </div>
                </div>
            </div>

            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
