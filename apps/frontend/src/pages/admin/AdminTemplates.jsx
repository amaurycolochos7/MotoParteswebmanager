import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { templateService } from '../../lib/api';
import { FileText, MessageCircle, Save, X } from 'lucide-react';

const SAMPLE_VARS = {
    cliente: 'Juan Pérez',
    taller: 'Taller MotoPartes',
    marca: 'Italika',
    modelo: 'FT150',
    folio: 'MP-26-042',
    total: '$1,250.00',
    fecha: '20/04/2026',
    hora: '10:30',
    servicio: 'Cambio de aceite',
    mecanico: 'Carlos Ruiz',
    portal_link: 'https://motopartes.cloud/orden/abc123',
    google_reviews: 'https://g.page/r/xyz',
};

function preview(body) {
    return String(body || '').replace(/\{([a-z_]+)\}/gi, (m, key) =>
        Object.prototype.hasOwnProperty.call(SAMPLE_VARS, key) ? SAMPLE_VARS[key] : m
    );
}

export default function AdminTemplates() {
    const { workspaceRole } = useAuth();
    const toast = useToast();
    const [templates, setTemplates] = useState([]);
    const [editing, setEditing] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        try {
            setTemplates(await templateService.list());
        } catch (err) { toast.error(err.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { refresh(); }, []);

    const save = async () => {
        try {
            if (editing.id) {
                const upd = await templateService.update(editing.id, { name: editing.name, body: editing.body, subject: editing.subject });
                setTemplates((arr) => arr.map((t) => t.id === upd.id ? upd : t));
                toast.success('Plantilla actualizada');
            } else {
                const created = await templateService.create({ name: editing.name, body: editing.body, channel: editing.channel || 'whatsapp', subject: editing.subject });
                setTemplates((arr) => [...arr, created]);
                toast.success('Plantilla creada');
            }
            setEditing(null);
        } catch (err) { toast.error(err.message); }
    };

    const canEdit = workspaceRole === 'owner' || workspaceRole === 'admin';
    if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;

    return (
        <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 20, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
                        <FileText size={22} style={{ verticalAlign: '-4px' }} /> Plantillas de mensaje
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#64748b' }}>
                        Textos reutilizables con placeholders como <code>{'{cliente}'}</code>, <code>{'{folio}'}</code>, <code>{'{total}'}</code>.
                    </p>
                </div>
                {canEdit && (
                    <button className="btn-primary" onClick={() => setEditing({ name: '', body: '', channel: 'whatsapp' })}>
                        + Nueva plantilla
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                {templates.map((t) => (
                    <div key={t.id} style={{ padding: 16, background: 'white', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <MessageCircle size={14} color="#16a34a" /> {t.name}
                            </strong>
                            {t.is_default && <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#f1f5f9', borderRadius: 999, color: '#475569' }}>default</span>}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5, background: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
                            {preview(t.body)}
                        </div>
                        {canEdit && (
                            <button className="btn-ghost" onClick={() => setEditing({ ...t })} style={{ fontSize: '0.82rem' }}>Editar</button>
                        )}
                    </div>
                ))}
            </div>

            {editing && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
                    <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 640, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{editing.id ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
                            <button onClick={() => setEditing(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
                        </div>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>Nombre</label>
                        <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={inp} placeholder="Ej. Confirmación de ingreso" />
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginTop: 14, marginBottom: 4 }}>Mensaje</label>
                        <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={5} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} placeholder="Hola {cliente}, tu {marca} {modelo} está lista. Folio: {folio}." />
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4 }}>
                            Variables: <code>{'{cliente}'}</code> <code>{'{marca}'}</code> <code>{'{modelo}'}</code> <code>{'{folio}'}</code> <code>{'{total}'}</code> <code>{'{taller}'}</code> <code>{'{portal_link}'}</code> <code>{'{google_reviews}'}</code> <code>{'{hora}'}</code>
                        </div>
                        <div style={{ marginTop: 14, padding: 12, background: '#f1f5f9', borderRadius: 10 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>VISTA PREVIA</div>
                            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{preview(editing.body)}</div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
                            <button className="btn-primary" onClick={save}><Save size={14} /> Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .btn-primary, .btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; border: none; cursor: pointer; }
                .btn-primary { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
                .btn-ghost { background: white; color: #1e293b; border: 1px solid #e2e8f0; }
                .btn-ghost:hover { background: #f8fafc; }
            `}</style>
        </div>
    );
}
const inp = { width: '100%', padding: 10, border: '2px solid #e2e8f0', borderRadius: 8, fontSize: '0.92rem', background: '#f8fafc', outline: 'none' };
