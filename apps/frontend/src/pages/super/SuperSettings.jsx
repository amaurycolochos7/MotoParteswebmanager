import { useState } from 'react';
import { KeyRound, Download, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { authService, superService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

export default function SuperSettings() {
    const toast = useToast();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [exporting, setExporting] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        if (!current || !next) return toast.error('Completa los campos.');
        if (next.length < 8) return toast.error('La nueva contraseña debe tener al menos 8 caracteres.');
        if (next !== confirm) return toast.error('Las contraseñas no coinciden.');
        setBusy(true);
        try {
            await authService.changePassword(current, next);
            toast.success('Contraseña actualizada.');
            setCurrent(''); setNext(''); setConfirm('');
        } catch (e) { toast.error(e.message); }
        finally { setBusy(false); }
    };

    const doExport = async (kind) => {
        setExporting(kind);
        try { await superService.downloadExport(kind); toast.success('Descargado'); }
        catch (e) { toast.error(e.message); }
        finally { setExporting(null); }
    };

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title">Configuración</h1>
                    <p className="sp-subtitle">Cambia tu contraseña, exporta datos, variables de entorno.</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
                {/* Cambiar contraseña */}
                <div className="sp-card">
                    <h2><KeyRound size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Cambiar contraseña</h2>
                    <form onSubmit={submit}>
                        <label className="sp-label">Contraseña actual</label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={show ? 'text' : 'password'}
                                value={current}
                                onChange={(e) => setCurrent(e.target.value)}
                                className="sp-input"
                                autoComplete="current-password"
                                required
                            />
                            <button type="button" onClick={() => setShow((v) => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                                {show ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        <label className="sp-label" style={{ marginTop: 12 }}>Nueva contraseña</label>
                        <input
                            type={show ? 'text' : 'password'}
                            value={next}
                            onChange={(e) => setNext(e.target.value)}
                            className="sp-input"
                            minLength={8}
                            autoComplete="new-password"
                            required
                        />

                        <label className="sp-label" style={{ marginTop: 12 }}>Confirmar nueva contraseña</label>
                        <input
                            type={show ? 'text' : 'password'}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="sp-input"
                            minLength={8}
                            autoComplete="new-password"
                            required
                        />

                        <button type="submit" className="sp-btn-primary" disabled={busy} style={{ marginTop: 16, width: '100%' }}>
                            {busy ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />} Actualizar
                        </button>
                        <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 10 }}>
                            Mínimo 8 caracteres. Al cambiarla queda registrada en audit_logs.
                        </p>
                    </form>
                </div>

                {/* Exports CSV */}
                <div className="sp-card">
                    <h2><Download size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Exports CSV</h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0 0 14px' }}>
                        Descarga datos operativos para análisis externo o contabilidad.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button className="sp-btn-secondary" onClick={() => doExport('workspaces')} disabled={exporting}>
                            {exporting === 'workspaces' ? <Loader2 className="spin" size={14} /> : <Download size={14} />} Talleres (workspaces.csv)
                        </button>
                        <button className="sp-btn-secondary" onClick={() => doExport('tickets')} disabled={exporting}>
                            {exporting === 'tickets' ? <Loader2 className="spin" size={14} /> : <Download size={14} />} Tickets (tickets.csv)
                        </button>
                        <button className="sp-btn-secondary" onClick={() => doExport('payouts')} disabled={exporting}>
                            {exporting === 'payouts' ? <Loader2 className="spin" size={14} /> : <Download size={14} />} Payouts referidos (payouts.csv)
                        </button>
                    </div>
                </div>

                {/* Info de entorno / setup pendiente */}
                <div className="sp-card">
                    <h2>Estado de integraciones</h2>
                    <div style={{ display: 'grid', gap: 8, fontSize: '0.88rem' }}>
                        <EnvRow label="Notificaciones email" envVar="RESEND_API_KEY" />
                        <EnvRow label="Alertas Slack" envVar="SLACK_SUPPORT_WEBHOOK_URL" />
                        <EnvRow label="Google Calendar" envVar="GOOGLE_CLIENT_ID" />
                        <EnvRow label="2FA super-admin" envVar="SUPER_REQUIRE_2FA" />
                        <EnvRow label="IP allowlist super" envVar="SUPER_IP_ALLOWLIST" />
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 14 }}>
                        Se configuran en Dokploy → API → Environment. Redeploy requerido.
                    </p>
                </div>
            </div>

            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// Muestra si una env var está seteada (desde la perspectiva del backend no se
// puede saber directamente sin endpoint dedicado; aquí solo indicamos que se
// configura desde Dokploy). En Fase 8 se puede agregar un /api/super/env-status.
function EnvRow({ label, envVar }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e293b' }}>
            <span>{label}</span>
            <code style={{ fontSize: '0.78rem', color: '#64748b' }}>{envVar}</code>
        </div>
    );
}
