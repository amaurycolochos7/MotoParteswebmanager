import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { workspaceService } from '../../lib/api';
import {
    Palette,
    Wrench,
    Hash,
    CheckCircle2,
    ArrowRight,
    ArrowLeft,
    Rocket,
} from 'lucide-react';

// Onboarding wizard shown immediately after signup. 4 short steps:
//   1) Confirm workshop name + tagline
//   2) Branding (primary & secondary color)
//   3) Folio prefix (for order numbers)
//   4) Done
// Every step persists to the API as we go, so the user can close the tab and
// come back without losing progress. The wizard finalizes by flipping
// workspace.onboarding_completed = true.

export default function Onboarding() {
    const { activeWorkspace, refreshActiveWorkspace } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        name: activeWorkspace?.name || '',
        tagline: activeWorkspace?.branding?.tagline || '',
        primary_color: activeWorkspace?.branding?.primary_color || '#ef4444',
        secondary_color: activeWorkspace?.branding?.secondary_color || '#1e293b',
        folio_prefix: activeWorkspace?.folio_prefix || 'MP',
    });

    useEffect(() => {
        // If the user already finished onboarding, skip the wizard.
        if (activeWorkspace?.onboarding_completed) {
            navigate('/mechanic', { replace: true });
        }
    }, [activeWorkspace, navigate]);

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const persistStep = async (patch) => {
        setSaving(true);
        try {
            const res = await workspaceService.update(patch);
            refreshActiveWorkspace(res.workspace);
        } catch (err) {
            toast.error(err.message || 'No pudimos guardar.');
            throw err;
        } finally {
            setSaving(false);
        }
    };

    const next = async () => {
        try {
            if (step === 1) {
                if (!form.name.trim()) { toast.error('Ingresa un nombre de taller.'); return; }
                await persistStep({ name: form.name.trim(), branding: { ...(activeWorkspace?.branding || {}), tagline: form.tagline.trim() } });
                setStep(2);
            } else if (step === 2) {
                await persistStep({
                    branding: {
                        ...(activeWorkspace?.branding || {}),
                        primary_color: form.primary_color,
                        secondary_color: form.secondary_color,
                        tagline: form.tagline.trim(),
                    },
                });
                setStep(3);
            } else if (step === 3) {
                const p = form.folio_prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
                if (p.length < 2) { toast.error('El prefijo necesita 2-4 caracteres.'); return; }
                await persistStep({ folio_prefix: p });
                setStep(4);
            }
        } catch { /* toast already shown */ }
    };

    const finish = async () => {
        setSaving(true);
        try {
            const res = await workspaceService.completeOnboarding();
            refreshActiveWorkspace(res.workspace);
            toast.success('¡Listo! Tu taller está configurado.');
            navigate('/mechanic', { replace: true });
        } catch (err) {
            toast.error(err.message || 'No pudimos completar la configuración.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="onb-page">
            <div className="onb-decor">
                <div className="bg-circle bg-circle-1"></div>
                <div className="bg-circle bg-circle-2"></div>
            </div>
            <div className="onb-container">
                <div className="onb-card">
                    <div className="onb-head">
                        <img src="/logo.png" alt="MotoPartes" className="onb-logo" />
                        <div>
                            <h1 className="onb-title">Configura tu taller</h1>
                            <p className="onb-sub">Paso {step} de 4 — puedes cambiar todo luego en Ajustes</p>
                        </div>
                    </div>

                    <div className="onb-steps">
                        {[1, 2, 3, 4].map((n) => (
                            <div
                                key={n}
                                className={`onb-step-dot ${n === step ? 'active' : n < step ? 'done' : ''}`}
                            />
                        ))}
                    </div>

                    {step === 1 && (
                        <div className="onb-body">
                            <div className="onb-icon"><Wrench size={32} /></div>
                            <h2>Identidad del taller</h2>
                            <p>Esto aparece en el encabezado del sistema y en los PDFs que envías.</p>
                            <label className="form-label">Nombre del taller</label>
                            <input className="form-input onb-input" value={form.name} onChange={update('name')} />
                            <label className="form-label">Slogan (opcional)</label>
                            <input className="form-input onb-input" value={form.tagline} onChange={update('tagline')} placeholder="Ej. Reparaciones y modificaciones" />
                        </div>
                    )}

                    {step === 2 && (
                        <div className="onb-body">
                            <div className="onb-icon"><Palette size={32} /></div>
                            <h2>Colores</h2>
                            <p>Se aplican al header, botones principales y PDFs.</p>
                            <div className="onb-colors">
                                <div>
                                    <label className="form-label">Color primario</label>
                                    <input type="color" value={form.primary_color} onChange={update('primary_color')} className="onb-color-pick" />
                                    <div className="onb-color-hex">{form.primary_color}</div>
                                </div>
                                <div>
                                    <label className="form-label">Color secundario</label>
                                    <input type="color" value={form.secondary_color} onChange={update('secondary_color')} className="onb-color-pick" />
                                    <div className="onb-color-hex">{form.secondary_color}</div>
                                </div>
                            </div>
                            <div className="onb-preview" style={{ background: form.secondary_color }}>
                                <div style={{ background: form.primary_color, height: 6, borderRadius: 4 }}></div>
                                <div style={{ color: 'white', fontWeight: 700, fontSize: 18, marginTop: 14 }}>{form.name || 'Mi Taller'}</div>
                                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{form.tagline || 'Taller de motocicletas'}</div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="onb-body">
                            <div className="onb-icon"><Hash size={32} /></div>
                            <h2>Prefijo de folios</h2>
                            <p>Así empiezan los números de orden. Ej. con prefijo "TJ" → <strong>TJ-25-001</strong>.</p>
                            <label className="form-label">Prefijo (2-4 letras o números)</label>
                            <input className="form-input onb-input" value={form.folio_prefix} onChange={(e) => setForm((f) => ({ ...f, folio_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) }))} maxLength={4} />
                            <div className="onb-folio-preview">
                                Siguiente folio: <strong>{form.folio_prefix}-25-001</strong>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="onb-body onb-body-center">
                            <div className="onb-icon onb-icon-success"><CheckCircle2 size={48} /></div>
                            <h2>¡Tu taller está listo!</h2>
                            <p>Ya puedes crear tu primera orden de servicio, invitar a tu equipo y conectar WhatsApp.</p>
                            <ul className="onb-checklist">
                                <li><CheckCircle2 size={16} /> 11 servicios precargados (afinación, frenos, llantas…)</li>
                                <li><CheckCircle2 size={16} /> 7 estados de orden listos</li>
                                <li><CheckCircle2 size={16} /> 14 días de prueba gratuita en el plan Pro</li>
                            </ul>
                        </div>
                    )}

                    <div className="onb-actions">
                        {step > 1 && step < 4 && (
                            <button className="btn-ghost" onClick={() => setStep(step - 1)} disabled={saving}>
                                <ArrowLeft size={16} /> Atrás
                            </button>
                        )}
                        {step < 4 && (
                            <button className="btn-primary onb-next" onClick={next} disabled={saving}>
                                {saving ? 'Guardando…' : (<>Siguiente <ArrowRight size={16} /></>)}
                            </button>
                        )}
                        {step === 4 && (
                            <button className="btn-primary onb-next" onClick={finish} disabled={saving}>
                                {saving ? 'Abriendo taller…' : (<><Rocket size={16} /> Entrar a mi taller</>)}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <style>{onbStyles}</style>
        </div>
    );
}

const onbStyles = `
.onb-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #ffffff; padding: 20px; position: relative; overflow: hidden; }
.onb-decor { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.1; }
.bg-circle-1 { width: 600px; height: 600px; background: linear-gradient(135deg, #ef4444, #dc2626); top: -200px; right: -200px; }
.bg-circle-2 { width: 400px; height: 400px; background: linear-gradient(135deg, #3b82f6, #2563eb); bottom: -100px; left: -100px; }
.onb-container { width: 100%; max-width: 560px; position: relative; z-index: 1; }
.onb-card { background: white; border-radius: 20px; padding: 36px 32px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); }
.onb-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.onb-logo { width: 56px; height: 56px; object-fit: contain; }
.onb-title { font-size: 1.4rem; font-weight: 800; margin: 0; color: #0f172a; letter-spacing: -0.3px; }
.onb-sub { font-size: 0.85rem; color: #64748b; margin: 4px 0 0; }
.onb-steps { display: flex; gap: 8px; margin-bottom: 24px; }
.onb-step-dot { flex: 1; height: 5px; background: #e2e8f0; border-radius: 3px; transition: all 0.2s ease; }
.onb-step-dot.active { background: linear-gradient(90deg, #ef4444, #dc2626); }
.onb-step-dot.done { background: #16a34a; }
.onb-body { display: flex; flex-direction: column; gap: 8px; }
.onb-body-center { align-items: center; text-align: center; }
.onb-icon { width: 64px; height: 64px; border-radius: 16px; background: linear-gradient(135deg, #fef2f2, #fee2e2); color: #ef4444; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
.onb-icon-success { background: linear-gradient(135deg, #dcfce7, #bbf7d0); color: #16a34a; width: 80px; height: 80px; }
.onb-body h2 { font-size: 1.2rem; font-weight: 700; color: #0f172a; margin: 0; }
.onb-body p { color: #64748b; font-size: 0.9rem; line-height: 1.5; margin: 0 0 8px; }
.onb-input { padding: 12px 14px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 0.95rem; background: #f8fafc; }
.onb-input:focus { outline: none; border-color: #ef4444; background: white; box-shadow: 0 0 0 4px rgba(239,68,68,0.1); }
.form-label { font-size: 0.85rem; font-weight: 600; color: #1e293b; margin-top: 8px; display: block; }
.onb-colors { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.onb-color-pick { width: 100%; height: 48px; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; background: transparent; padding: 2px; }
.onb-color-hex { font-family: monospace; font-size: 0.8rem; color: #64748b; text-align: center; margin-top: 4px; }
.onb-preview { border-radius: 12px; padding: 18px 20px; margin-top: 14px; }
.onb-folio-preview { margin-top: 14px; padding: 12px 16px; background: #f8fafc; border-radius: 10px; color: #475569; font-size: 0.9rem; }
.onb-checklist { list-style: none; padding: 0; margin: 14px 0 4px; text-align: left; display: flex; flex-direction: column; gap: 8px; }
.onb-checklist li { display: flex; align-items: center; gap: 8px; color: #475569; font-size: 0.88rem; }
.onb-checklist li svg { color: #16a34a; flex-shrink: 0; }
.onb-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 28px; }
.onb-next { flex: 1; }
.btn-primary, .btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; border-radius: 10px; font-weight: 600; font-size: 0.95rem; border: none; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; text-decoration: none; }
.btn-primary { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; box-shadow: 0 4px 12px rgba(239,68,68,0.25); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(239,68,68,0.35); }
.btn-ghost { background: transparent; color: #1e293b; border: 2px solid #e2e8f0; }
.btn-ghost:hover:not(:disabled) { background: #f8fafc; }
`;
