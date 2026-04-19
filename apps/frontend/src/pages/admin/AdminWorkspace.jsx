import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { workspaceService } from '../../lib/api';
import { Palette, Hash, Save, Sparkles, CreditCard } from 'lucide-react';

// Settings page for the active workspace. Allows the owner/admin to update
// the workshop name, tagline, colors, folio prefix, and PDF footer. Shows
// the current plan and, for flagship workspaces, a "grandfathered" badge.

export default function AdminWorkspace() {
    const { activeWorkspace, refreshActiveWorkspace, workspaceRole } = useAuth();
    const toast = useToast();

    const [form, setForm] = useState({
        name: '',
        tagline: '',
        primary_color: '#ef4444',
        secondary_color: '#1e293b',
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
                    primary_color: b.primary_color || '#ef4444',
                    secondary_color: b.secondary_color || '#1e293b',
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
        return <div style={{ padding: 24 }}>Cargando configuración del taller…</div>;
    }

    const planBadge = activeWorkspace?.is_flagship
        ? { label: 'Flagship', color: '#8b5cf6' }
        : { label: activeWorkspace?.plan?.name || 'Free', color: '#ef4444' };

    const canEdit = workspaceRole === 'owner' || workspaceRole === 'admin';

    return (
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>Configuración del taller</h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.95rem' }}>Branding, folios y plan.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#f1f5f9', borderRadius: 999 }}>
                    <Sparkles size={16} color={planBadge.color} />
                    <strong style={{ color: planBadge.color, fontSize: '0.85rem' }}>Plan {planBadge.label}</strong>
                </div>
            </div>

            {!canEdit && (
                <div style={{ padding: 14, borderRadius: 10, background: '#fef3c7', border: '1px solid #fde68a', marginBottom: 20, fontSize: '0.88rem', color: '#92400e' }}>
                    Sólo el propietario o un admin del taller pueden cambiar esta configuración. Tú eres <strong>{workspaceRole || 'mecánico'}</strong>.
                </div>
            )}

            <div className="ws-grid">
                {/* Identity */}
                <section className="ws-card">
                    <div className="ws-card-head">
                        <Palette size={20} />
                        <h2>Identidad del taller</h2>
                    </div>
                    <label>Nombre</label>
                    <input value={form.name} onChange={update('name')} disabled={!canEdit} />
                    <label>Slogan</label>
                    <input value={form.tagline} onChange={update('tagline')} disabled={!canEdit} placeholder="Reparaciones y modificaciones" />
                    <label>Pie de página en PDFs</label>
                    <input value={form.pdf_footer} onChange={update('pdf_footer')} disabled={!canEdit} placeholder="Ej. Taller Juárez · RFC XAXX010101000" />
                </section>

                {/* Colors */}
                <section className="ws-card">
                    <div className="ws-card-head">
                        <Palette size={20} />
                        <h2>Colores</h2>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                            <label>Primario</label>
                            <input type="color" value={form.primary_color} onChange={update('primary_color')} disabled={!canEdit} className="ws-color" />
                            <div className="ws-hex">{form.primary_color}</div>
                        </div>
                        <div>
                            <label>Secundario</label>
                            <input type="color" value={form.secondary_color} onChange={update('secondary_color')} disabled={!canEdit} className="ws-color" />
                            <div className="ws-hex">{form.secondary_color}</div>
                        </div>
                    </div>
                    <div className="ws-preview" style={{ background: form.secondary_color }}>
                        <div style={{ background: form.primary_color, height: 4, borderRadius: 3 }}></div>
                        <div style={{ color: 'white', fontWeight: 700, marginTop: 12 }}>{form.name || 'Mi Taller'}</div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{form.tagline || '—'}</div>
                    </div>
                </section>

                {/* Folios */}
                <section className="ws-card">
                    <div className="ws-card-head">
                        <Hash size={20} />
                        <h2>Folios</h2>
                    </div>
                    <label>Prefijo (2-4 caracteres)</label>
                    <input value={form.folio_prefix} onChange={(e) => setForm((f) => ({ ...f, folio_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) }))} disabled={!canEdit} />
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '8px 0 0' }}>
                        Siguiente orden: <strong>{form.folio_prefix}-25-001</strong>
                    </p>
                </section>

                {/* Plan */}
                <section className="ws-card">
                    <div className="ws-card-head">
                        <CreditCard size={20} />
                        <h2>Plan actual</h2>
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', margin: '6px 0' }}>
                        {activeWorkspace?.plan?.name || 'Free'}
                    </div>
                    {activeWorkspace?.is_flagship ? (
                        <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0 }}>
                            Plan de cortesía perpetuo. No aplican límites.
                        </p>
                    ) : activeWorkspace?.subscription_status === 'trialing' ? (
                        <p style={{ color: '#8b5cf6', fontSize: '0.88rem', margin: 0 }}>
                            Estás en periodo de prueba (14 días). Después bajarás automáticamente al plan Free a menos que elijas otro.
                        </p>
                    ) : (
                        <p style={{ color: '#64748b', fontSize: '0.88rem', margin: 0 }}>
                            Gestiona tu suscripción en Facturación (próximamente).
                        </p>
                    )}
                </section>
            </div>

            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-primary" onClick={save} disabled={!canEdit || saving}>
                    <Save size={16} /> {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
            </div>

            <style>{`
                .ws-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
                @media (max-width: 720px) { .ws-grid { grid-template-columns: 1fr; } }
                .ws-card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; }
                .ws-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: #ef4444; }
                .ws-card-head h2 { margin: 0; font-size: 1rem; font-weight: 700; color: #0f172a; }
                .ws-card label { display: block; font-size: 0.82rem; font-weight: 600; color: #475569; margin: 10px 0 4px; }
                .ws-card input { width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 0.95rem; background: #f8fafc; }
                .ws-card input:focus { outline: none; border-color: #ef4444; background: white; }
                .ws-card input:disabled { opacity: 0.7; cursor: not-allowed; }
                .ws-color { height: 44px; padding: 2px; cursor: pointer; }
                .ws-hex { font-family: monospace; font-size: 0.78rem; color: #64748b; margin-top: 4px; text-align: center; }
                .ws-preview { border-radius: 10px; padding: 16px; margin-top: 12px; }
                .btn-primary { display: inline-flex; align-items: center; gap: 8px; padding: 12px 22px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(239,68,68,0.25); }
                .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(239,68,68,0.35); }
            `}</style>
        </div>
    );
}
