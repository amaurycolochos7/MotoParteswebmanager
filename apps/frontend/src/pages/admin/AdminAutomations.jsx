import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { automationService, templateService } from '../../lib/api';
import { Zap, Play, Pause, CheckCircle2, AlertTriangle, FileText, Trash2, ArrowRight, Timer, Repeat } from 'lucide-react';
import './AdminV3.css';

const TRIGGER_LABELS = {
    'order.created': 'Orden registrada',
    'order.status_changed': 'Estado de orden cambia',
    'order.paid': 'Orden pagada',
    'order.completed': 'Orden completada',
    'client.created': 'Cliente nuevo',
    'appointment.upcoming_24h': 'Cita en 24h',
    'appointment.upcoming_2h': 'Cita en 2h',
    'order.idle_3_days': 'Orden sin actividad 3+ días',
    'appointment.confirmed': 'Cita confirmada',
    'appointment.rejected': 'Cita rechazada',
    'client.first_visit_anniversary': 'Aniversario del cliente (1 año)',
};

const ACTION_LABELS = {
    'whatsapp.send_template': 'Enviar WhatsApp',
    'task.create': 'Crear tarea interna',
    'webhook.fire': 'Disparar webhook',
    'pdf.send_quote': 'Enviar PDF',
};

export default function AdminAutomations() {
    const { workspaceRole, activeWorkspace } = useAuth();
    const toast = useToast();
    const [automations, setAutomations] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        try {
            const [a, t] = await Promise.all([automationService.list(), templateService.list()]);
            setAutomations(a);
            setTemplates(t);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { refresh(); }, []);

    const toggle = async (auto) => {
        try {
            const updated = await automationService.update(auto.id, { enabled: !auto.enabled });
            setAutomations((arr) => arr.map((a) => (a.id === auto.id ? updated : a)));
            toast.success(updated.enabled ? 'Automatización activada' : 'Pausada');
        } catch (err) {
            if (err.message?.includes('plan')) {
                toast.error(err.message);
            } else {
                toast.error(err.message || 'No pudimos cambiar el estado.');
            }
        }
    };

    const remove = async (auto) => {
        if (!confirm(`¿Eliminar "${auto.name}"?`)) return;
        try {
            await automationService.remove(auto.id);
            setAutomations((arr) => arr.filter((a) => a.id !== auto.id));
            toast.success('Eliminada');
        } catch (err) { toast.error(err.message); }
    };

    if (loading) return <div className="adm adm-loading">Cargando…</div>;

    const canEdit = workspaceRole === 'owner' || workspaceRole === 'admin';
    const enabledCount = automations.filter((a) => a.enabled).length;
    const planLimit = activeWorkspace?.plan?.features?.automations;

    return (
        <div className="adm">
            <header className="adm-head">
                <div>
                    <h1><Zap size={22} /> Automatizaciones</h1>
                    <p>Reglas que disparan acciones cuando suceden eventos en tu taller.</p>
                </div>
                <div className="adm-actions">
                    <span className="adm-count">
                        {enabledCount} activas{planLimit && planLimit !== null ? ` / ${planLimit === null ? '∞' : planLimit}` : ''}
                    </span>
                    <Link to="/admin/templates" className="k-btn k-btn--ghost k-btn--sm">
                        <FileText size={15} /> Plantillas
                    </Link>
                </div>
            </header>

            <div className="adm-list">
                {automations.map((auto) => (
                    <div key={auto.id} className={`adm-item${auto.enabled ? ' is-on' : ''}`}>
                        <div className="adm-item__main">
                            <div className="adm-item__title">
                                <strong>{auto.name}</strong>
                                {auto.is_default && <span className="adm-badge">Predeterminada</span>}
                                {auto.enabled
                                    ? <span className="adm-badge adm-badge--ok"><CheckCircle2 size={13} /> Activa</span>
                                    : <span className="adm-badge"><Pause size={13} /> Pausada</span>}
                            </div>
                            {auto.description && <p className="adm-item__desc">{auto.description}</p>}
                            <div className="adm-item__meta">
                                <span><Zap size={14} /> {TRIGGER_LABELS[auto.trigger] || auto.trigger}</span>
                                <span><ArrowRight size={14} /> {ACTION_LABELS[auto.action] || auto.action}</span>
                                {auto.delay_minutes > 0 && (
                                    <span><Timer size={14} /> +{auto.delay_minutes < 60 ? `${auto.delay_minutes} min` : `${Math.round(auto.delay_minutes / 60)} h`}</span>
                                )}
                                {auto.run_count > 0 && <span><Repeat size={14} /> {auto.run_count} ejecuciones</span>}
                                {auto.fail_count > 0 && (
                                    <span className="adm-btn-danger"><AlertTriangle size={14} /> {auto.fail_count} fallos</span>
                                )}
                            </div>
                            {auto.last_error && <div className="adm-error">Último error: {auto.last_error}</div>}
                        </div>
                        {canEdit && (
                            <div className="adm-item__side">
                                <button
                                    type="button"
                                    onClick={() => toggle(auto)}
                                    className={`k-btn k-btn--sm ${auto.enabled ? 'k-btn--ghost' : ''}`}
                                >
                                    {auto.enabled ? (<><Pause size={15} /> Pausar</>) : (<><Play size={15} /> Activar</>)}
                                </button>
                                {!auto.is_default && (
                                    <button type="button" onClick={() => remove(auto)} className="k-btn k-btn--ghost k-btn--sm adm-btn-danger" aria-label={`Eliminar ${auto.name}`}>
                                        <Trash2 size={15} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {automations.length === 0 && (
                <div className="adm-empty">
                    <Zap size={26} />
                    <h3>Aún no tienes automatizaciones</h3>
                    <p>Cuando se configuren, aparecerán aquí.</p>
                </div>
            )}
        </div>
    );
}
