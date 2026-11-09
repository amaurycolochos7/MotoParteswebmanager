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
        secondary_color: activeWorkspace?.branding?.secondary_color || '#1d1d1f',
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
            <div className="onb-container">
                <div className="onb-card">
                    <div className="onb-head">
                        <img src="/logo-mark.png" alt="MotoPartes" className="onb-logo" />
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
.onb-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); padding: 24px 16px; }
.onb-container { width: 100%; max-width: 560px; }
.onb-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--sh-2); padding: 32px 28px; }
.onb-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; min-width: 0; }
.onb-logo { height: 52px; width: auto; max-width: 40%; object-fit: contain; flex: 0 0 auto; }
.onb-title { font-size: 1.25rem; font-weight: 700; margin: 0; color: var(--text); line-height: 1.25; }
.onb-sub { font-size: 13.5px; color: var(--ink-3); margin: 4px 0 0; }
.onb-steps { display: flex; gap: 6px; margin-bottom: 24px; }
.onb-step-dot { flex: 1; height: 4px; background: var(--surface-3); border-radius: var(--r-pill); transition: background 160ms ease; }
.onb-step-dot.active { background: var(--brand); }
.onb-step-dot.done { background: var(--success); }
.onb-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.onb-body-center { align-items: center; text-align: center; }
.onb-icon { width: 56px; height: 56px; border-radius: var(--r-pill); background: var(--brand-50); color: var(--brand); display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
.onb-icon-success { background: var(--success-bg); color: var(--success); width: 64px; height: 64px; }
.onb-body h2 { font-size: 1.125rem; font-weight: 600; color: var(--text); margin: 0; }
.onb-body p { color: var(--text-2); font-size: 14px; line-height: 1.5; margin: 0 0 8px; }
.onb-input { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: var(--r-control); font-size: 16px; background: var(--surface); box-sizing: border-box; }
.onb-input:focus { outline: none; border-color: var(--brand); box-shadow: var(--ring); }
.form-label { font-size: 13px; font-weight: 500; color: var(--text-2); margin-top: 8px; display: block; }
.onb-colors { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.onb-color-pick { width: 100%; height: 44px; border: 1px solid var(--line-strong); border-radius: var(--r-control); cursor: pointer; background: transparent; padding: 2px; }
.onb-color-hex { font-size: 12.5px; color: var(--ink-3); text-align: center; margin-top: 4px; font-variant-numeric: tabular-nums; }
.onb-preview { border-radius: var(--r-card); padding: 18px 20px; margin-top: 14px; }
.onb-folio-preview { margin-top: 14px; padding: 12px 16px; background: var(--surface-2); border-radius: var(--r-control); color: var(--text-2); font-size: 14px; }
.onb-checklist { list-style: none; padding: 0; margin: 14px 0 4px; text-align: left; display: flex; flex-direction: column; gap: 8px; }
.onb-checklist li { display: flex; align-items: center; gap: 8px; color: var(--text-2); font-size: 14px; }
.onb-checklist li svg { color: var(--success); flex-shrink: 0; }
.onb-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 28px; flex-wrap: wrap; }
.onb-next { flex: 1; }
.btn-primary, .btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 20px; border-radius: var(--r-control); font-weight: 600; font-size: 14.5px; cursor: pointer; transition: background 120ms ease; white-space: nowrap; text-decoration: none; }
.btn-primary { background: var(--brand); color: #fff; border: 1px solid var(--brand); box-shadow: var(--sh-1); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { background: var(--brand-hover); border-color: var(--brand-hover); }
.btn-ghost { background: var(--surface); color: var(--text); border: 1px solid var(--line-strong); }
.btn-ghost:hover:not(:disabled) { background: var(--surface-2); }
@media (max-width: 480px) { .onb-card { padding: 24px 18px; } }
`;
