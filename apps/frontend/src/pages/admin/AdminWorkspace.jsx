import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { workspaceService } from '../../lib/api';
import { Palette, Hash, Save, Sparkles, CreditCard, Store } from 'lucide-react';
import './AdminV3.css';

// Settings page for the active workspace. Allows the owner/admin to update
// the workshop name, tagline, colors, folio prefix, and PDF footer. Shows
// the current plan and, for flagship workspaces, a "grandfathered" badge.

export default function AdminWorkspace() {
    const { activeWorkspace, refreshActiveWorkspace, workspaceRole } = useAuth();
    const toast = useToast();

    const [form, setForm] = useState({
        name: '',
        tagline: '',
        primary_color: '#d92d20',
        secondary_color: '#101828',
        pdf_footer: '',
        folio_prefix: 'MP',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await workspaceService.getCurrent();
                if (cancelled) return;
                const ws = res.workspace;
                const b = ws.branding || {};
                setForm({
                    name: ws.name || '',
                    tagline: b.tagline || '',
                    primary_color: b.primary_color || '#d92d20',
                    secondary_color: b.secondary_color || '#101828',
                    pdf_footer: b.pdf_footer || '',
                    folio_prefix: ws.folio_prefix || 'MP',
                });
            } catch (err) {
                toast.error(err.message || 'No pudimos cargar el taller.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [toast]);

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const save = async () => {
        if (workspaceRole !== 'owner' && workspaceRole !== 'admin') {
            toast.error('Sólo el propietario o un admin pueden editar el taller.');
            return;
        }
        const p = form.folio_prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        if (p.length < 2) {
            toast.error('El prefijo de folio necesita 2-4 caracteres.');
            return;
        }
        setSaving(true);
        try {
            const res = await workspaceService.update({
                name: form.name.trim(),
                folio_prefix: p,
                branding: {
                    ...(activeWorkspace?.branding || {}),
                    tagline: form.tagline.trim(),
                    primary_color: form.primary_color,
                    secondary_color: form.secondary_color,
                    pdf_footer: form.pdf_footer.trim(),
                },
            });
            refreshActiveWorkspace(res.workspace);
            toast.success('Taller actualizado.');
        } catch (err) {
            toast.error(err.message || 'No pudimos guardar.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="adm adm-loading">Cargando configuración del taller…</div>;
    }

    const planLabel = activeWorkspace?.is_flagship ? 'Flagship' : (activeWorkspace?.plan?.name || 'Free');
    const canEdit = workspaceRole === 'owner' || workspaceRole === 'admin';

    return (
        <div className="adm" style={{ maxWidth: 880 }}>
            <header className="adm-head">
                <div>
                    <h1><Store size={22} /> Configuración del taller</h1>
                    <p>Identidad, folios y plan.</p>
                </div>
                <span className="adm-badge adm-badge--brand" style={{ padding: '6px 14px', fontSize: 14 }}>
                    <Sparkles size={15} /> Plan {planLabel}
                </span>
            </header>

            {!canEdit && (
                <div className="adm-note adm-note--warn" style={{ marginBottom: 16 }}>
                    <span>Sólo el propietario o un admin del taller pueden cambiar esta configuración. Tú eres <strong>{workspaceRole || 'mecánico'}</strong>.</span>
                </div>
            )}

            <div className="adm-grid adm-grid--2">
                <section className="adm-card">
                    <h2 className="adm-card__title"><Palette size={18} /> Identidad del taller</h2>
                    <div className="adm-field">
                        <label htmlFor="ws-name">Nombre</label>
                        <input id="ws-name" value={form.name} onChange={update('name')} disabled={!canEdit} />
                    </div>
                    <div className="adm-field">
                        <label htmlFor="ws-tag">Eslogan</label>
                        <input id="ws-tag" value={form.tagline} onChange={update('tagline')} disabled={!canEdit} placeholder="Reparaciones y modificaciones" />
                    </div>
                    <div className="adm-field" style={{ marginBottom: 0 }}>
                        <label htmlFor="ws-foot">Pie de página en PDFs</label>
                        <input id="ws-foot" value={form.pdf_footer} onChange={update('pdf_footer')} disabled={!canEdit} placeholder="Ej. Taller Juárez · RFC XAXX010101000" />
                    </div>
                </section>

                <section className="adm-card">
                    <h2 className="adm-card__title"><Palette size={18} /> Colores</h2>
                    <div className="adm-row2">
                        <div className="adm-field">
                            <label htmlFor="ws-c1">Primario</label>
                            <input id="ws-c1" type="color" value={form.primary_color} onChange={update('primary_color')} disabled={!canEdit} className="adm-color" />
                            <span className="adm-hint" style={{ textAlign: 'center' }}>{form.primary_color}</span>
                        </div>
                        <div className="adm-field">
                            <label htmlFor="ws-c2">Secundario</label>
                            <input id="ws-c2" type="color" value={form.secondary_color} onChange={update('secondary_color')} disabled={!canEdit} className="adm-color" />
                            <span className="adm-hint" style={{ textAlign: 'center' }}>{form.secondary_color}</span>
                        </div>
                    </div>
                    <div className="adm-colorprev" style={{ background: form.secondary_color }}>
                        <div style={{ background: form.primary_color, height: 4, borderRadius: 3 }} />
                        <div className="adm-colorprev__name">{form.name || 'Mi taller'}</div>
                        <div className="adm-colorprev__tag">{form.tagline || '—'}</div>
                    </div>
                </section>

                <section className="adm-card">
                    <h2 className="adm-card__title"><Hash size={18} /> Folios</h2>
                    <div className="adm-field" style={{ marginBottom: 8 }}>
                        <label htmlFor="ws-pref">Prefijo (2 a 4 caracteres)</label>
                        <input id="ws-pref" value={form.folio_prefix} onChange={(e) => setForm((f) => ({ ...f, folio_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) }))} disabled={!canEdit} />
                    </div>
                    <p className="adm-hint">Siguiente orden: <strong>{form.folio_prefix}-25-001</strong></p>
                </section>

                <section className="adm-card">
                    <h2 className="adm-card__title"><CreditCard size={18} /> Plan actual</h2>
                    <div className="adm-stat__value" style={{ margin: '4px 0 8px' }}>{activeWorkspace?.plan?.name || 'Free'}</div>
                    {activeWorkspace?.is_flagship ? (
                        <p className="adm-hint">Plan de cortesía perpetuo. No aplican límites.</p>
                    ) : activeWorkspace?.subscription_status === 'trialing' ? (
                        <p className="adm-hint" style={{ color: 'var(--info)' }}>Estás en periodo de prueba (14 días). Después bajarás automáticamente al plan Free a menos que elijas otro.</p>
                    ) : (
                        <p className="adm-hint">Gestiona tu suscripción en Suscripción.</p>
                    )}
                </section>
            </div>

            <div className="adm-actions" style={{ marginTop: 24, justifyContent: 'flex-end' }}>
                <button type="button" className="k-btn" onClick={save} disabled={!canEdit || saving}>
                    <Save size={16} /> {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
            </div>
        </div>
    );
}
