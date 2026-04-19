import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Plug,
    Calendar,
    CheckCircle2,
    AlertTriangle,
    ExternalLink,
    Unlink,
    Loader2,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { integrationsService } from '../../lib/api';

export default function AdminIntegrations() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);

    const load = async () => {
        try {
            const s = await integrationsService.getStatus();
            setStatus(s);
        } catch (err) {
            toast.error(err?.message || 'No pudimos cargar el estado de las integraciones.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        if (params.get('connected') === '1') {
            toast.success('Google Calendar conectado.');
            params.delete('connected');
            setParams(params, { replace: true });
            load();
        }
        const err = params.get('error');
        if (err) {
            toast.error(`No se pudo conectar Google Calendar: ${err}`);
            params.delete('error');
            setParams(params, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const connectGoogle = async () => {
        setConnecting(true);
        try {
            const res = await integrationsService.googleAuthUrl();
            if (res?.url) {
                window.location.href = res.url;
            }
        } catch (err) {
            toast.error(err?.message || 'No se pudo iniciar la conexión.');
            setConnecting(false);
        }
    };

    const disconnectGoogle = async () => {
        if (!confirm('¿Desconectar Google Calendar? Las citas nuevas dejarán de sincronizarse.')) return;
        try {
            await integrationsService.googleDisconnect();
            toast.success('Google Calendar desconectado.');
            await load();
        } catch (err) {
            toast.error(err?.message || 'No se pudo desconectar.');
        }
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Cargando...</div>;
    }

    const gcal = status?.google_calendar || {};

    return (
        <div className="int-page">
            <div className="int-header">
                <h1><Plug size={26} /> Integraciones</h1>
                <p>Conecta MotoPartes con las herramientas que ya usas para evitar capturas duplicadas.</p>
            </div>

            <div className="int-grid">
                {/* Google Calendar */}
                <div className="int-card">
                    <div className="int-card-head">
                        <div className="int-icon" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            <Calendar size={24} />
                        </div>
                        <div>
                            <h2>Google Calendar</h2>
                            <p className="int-sub">Sincroniza tus citas a tu calendario de Google automáticamente.</p>
                        </div>
                    </div>

                    {!gcal.configured_on_server ? (
                        <div className="int-warn">
                            <AlertTriangle size={18} />
                            <div>
                                <strong>Integración no disponible todavía.</strong>
                                <p>El soporte tiene que habilitarla de tu lado. Envíanos un correo a <a href="mailto:hola@motopartes.cloud">hola@motopartes.cloud</a> y te la activamos.</p>
                            </div>
                        </div>
                    ) : gcal.connected ? (
                        <div className="int-connected">
                            <div className="int-status-ok">
                                <CheckCircle2 size={18} /> Conectado — las citas nuevas se están sincronizando.
                            </div>
                            <button onClick={disconnectGoogle} className="int-btn-ghost">
                                <Unlink size={16} /> Desconectar
                            </button>
                        </div>
                    ) : (
                        <div className="int-disconnected">
                            <p>Aún no has conectado tu Google Calendar. Al hacerlo, cada cita que crees en MotoPartes aparecerá en tu Google Calendar automáticamente, con nombre del cliente, moto y teléfono.</p>
                            <button onClick={connectGoogle} disabled={connecting} className="int-btn-primary">
                                {connecting ? <Loader2 size={16} className="spin" /> : <ExternalLink size={16} />}
                                {connecting ? 'Redirigiendo…' : 'Conectar Google Calendar'}
                            </button>
                        </div>
                    )}

                    <ul className="int-features">
                        <li>Sincronización automática al crear/editar cita</li>
                        <li>Los cambios en MotoPartes actualizan el evento en Google</li>
                        <li>One-way (Google → MotoPartes no está disponible por ahora)</li>
                    </ul>
                </div>

                {/* Próximas integraciones (placeholder) */}
                <div className="int-card int-card-coming">
                    <div className="int-icon" style={{ background: '#f1f5f9', color: '#64748b' }}>
                        <Plug size={24} />
                    </div>
                    <h3>Próximamente</h3>
                    <ul>
                        <li>Google Sheets — exporta comisiones para contabilidad</li>
                        <li>Zapier — conecta con 6,000+ apps</li>
                        <li>Webhooks personalizados (plan Business)</li>
                    </ul>
                </div>
            </div>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
.int-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
.int-header h1 { display: flex; align-items: center; gap: 10px; font-size: 1.8rem; font-weight: 800; margin: 0 0 6px; color: #0f172a; }
.int-header p { color: #64748b; margin: 0 0 28px; max-width: 640px; line-height: 1.5; }
.int-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
.int-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; }
.int-card-head { display: flex; gap: 14px; margin-bottom: 18px; }
.int-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.int-card h2 { font-size: 1.2rem; font-weight: 800; margin: 0 0 4px; color: #0f172a; }
.int-sub { color: #64748b; margin: 0; font-size: 0.92rem; line-height: 1.45; }
.int-warn { display: flex; gap: 10px; padding: 14px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px; color: #78350f; font-size: 0.88rem; line-height: 1.5; margin-bottom: 18px; }
.int-warn svg { flex-shrink: 0; margin-top: 2px; }
.int-warn strong { display: block; color: #7c2d12; }
.int-warn p { margin: 4px 0 0; }
.int-warn a { color: #7c2d12; font-weight: 600; }
.int-status-ok { display: inline-flex; align-items: center; gap: 6px; color: #166534; background: #dcfce7; padding: 8px 14px; border-radius: 10px; font-weight: 600; font-size: 0.9rem; margin-bottom: 14px; }
.int-connected { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
.int-disconnected p { color: #475569; margin: 0 0 16px; line-height: 1.55; font-size: 0.95rem; }
.int-btn-primary, .int-btn-ghost { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 0.92rem; cursor: pointer; border: none; transition: all 0.2s; }
.int-btn-primary { background: linear-gradient(135deg,#3b82f6,#2563eb); color: white; }
.int-btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37,99,235,0.25); }
.int-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.int-btn-ghost { background: white; color: #1e293b; border: 1.5px solid #cbd5e1; align-self: flex-start; }
.int-btn-ghost:hover { background: #f8fafc; }
.int-features { list-style: none; padding: 0; margin: 18px 0 0; border-top: 1px solid #e2e8f0; padding-top: 14px; }
.int-features li { padding: 4px 0; color: #64748b; font-size: 0.85rem; position: relative; padding-left: 18px; }
.int-features li:before { content: '✓'; position: absolute; left: 0; color: #16a34a; font-weight: 700; }
.int-card-coming { background: #f8fafc; border-style: dashed; }
.int-card-coming h3 { font-size: 1rem; font-weight: 700; margin: 12px 0 8px; color: #475569; }
.int-card-coming ul { margin: 0; padding-left: 20px; color: #64748b; font-size: 0.9rem; line-height: 1.7; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
`;
