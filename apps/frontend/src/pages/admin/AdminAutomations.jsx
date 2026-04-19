import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { automationService, templateService } from '../../lib/api';
import { Zap, Play, Pause, CheckCircle2, XCircle, AlertTriangle, Plus, FileText, Trash2 } from 'lucide-react';

const TRIGGER_LABELS = {
    'order.created': 'Orden registrada',
    'order.status_changed': 'Estado de orden cambia',
    'order.paid': 'Orden pagada',
    'order.completed': 'Orden completada',
    'client.created': 'Cliente nuevo',
    'appointment.upcoming_24h': 'Cita en 24h',
    'appointment.upcoming_2h': 'Cita en 2h',
    'order.idle_3_days': 'Orden sin actividad 3+ días',
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

    if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;

    const canEdit = workspaceRole === 'owner' || workspaceRole === 'admin';
    const enabledCount = automations.filter((a) => a.enabled).length;
    const planLimit = activeWorkspace?.plan?.features?.automations;

    return (
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
                        <Zap size={22} style={{ verticalAlign: '-4px' }} /> Automatizaciones
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b' }}>
                        Reglas que disparan acciones cuando suceden eventos en tu taller.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {enabledCount} activas{planLimit && planLimit !== null ? ` / ${planLimit === null ? '∞' : planLimit}` : ''}
                    </span>
                    <Link to="/admin/templates" className="btn-ghost">
                        <FileText size={14} /> Plantillas
                    </Link>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {automations.map((auto) => (
                    <div
                        key={auto.id}
                        style={{
                            display: 'flex',
                            gap: 16,
                            padding: 16,
                            background: 'white',
                            border: '1px solid',
                            borderColor: auto.enabled ? '#86efac' : '#e2e8f0',
                            borderLeft: auto.enabled ? '4px solid #16a34a' : '4px solid #cbd5e1',
                            borderRadius: 12,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 260 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <strong style={{ color: '#0f172a', fontSize: '1rem' }}>{auto.name}</strong>
                                {auto.is_default && (
                                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#f1f5f9', borderRadius: 999, color: '#475569' }}>
                                        default
                                    </span>
                                )}
                                {auto.enabled
                                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#16a34a' }}><CheckCircle2 size={13} />Activa</span>
                                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#94a3b8' }}><Pause size={13} />Pausada</span>}
                            </div>
                            <div style={{ fontSize: '0.86rem', color: '#64748b', marginTop: 4 }}>
                                {auto.description || ''}
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: '0.8rem', color: '#475569', flexWrap: 'wrap' }}>
                                <span>⚡ {TRIGGER_LABELS[auto.trigger] || auto.trigger}</span>
                                <span>→ {ACTION_LABELS[auto.action] || auto.action}</span>
                                {auto.delay_minutes > 0 && (
                                    <span>⏱ +{auto.delay_minutes < 60 ? `${auto.delay_minutes}m` : `${Math.round(auto.delay_minutes / 60)}h`}</span>
                                )}
                                {auto.run_count > 0 && <span>✓ {auto.run_count} runs</span>}
                                {auto.fail_count > 0 && (
                                    <span style={{ color: '#dc2626' }}>
                                        <AlertTriangle size={12} /> {auto.fail_count} fallos
                                    </span>
                                )}
                            </div>
                            {auto.last_error && (
                                <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: 4 }}>
                                    Último error: {auto.last_error}
                                </div>
                            )}
                        </div>
                        {canEdit && (
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    onClick={() => toggle(auto)}
                                    className={auto.enabled ? 'btn-ghost' : 'btn-primary'}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                >
                                    {auto.enabled ? (<><Pause size={14} /> Pausar</>) : (<><Play size={14} /> Activar</>)}
                                </button>
                                {!auto.is_default && (
                                    <button onClick={() => remove(auto)} className="btn-ghost" style={{ color: '#b91c1c' }}>
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {automations.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 12 }}>
                    Aún no tienes automatizaciones configuradas.
                </div>
            )}

            <style>{`
                .btn-primary, .btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; border: none; cursor: pointer; transition: all 0.15s; text-decoration: none; white-space: nowrap; }
                .btn-primary { background: linear-gradient(135deg, #16a34a, #15803d); color: white; }
                .btn-primary:hover { transform: translateY(-1px); }
                .btn-ghost { background: white; color: #1e293b; border: 1px solid #e2e8f0; }
                .btn-ghost:hover { background: #f8fafc; }
            `}</style>
        </div>
    );
}
