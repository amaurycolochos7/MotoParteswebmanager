import { useEffect, useState } from 'react';
import { FileText, Plus, Trash2, Loader2, Edit3 } from 'lucide-react';
import { superService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const SEEDED = [
    { shortcut: 'qr-bot', title: 'Cómo reescanear QR del bot', category: 'whatsapp',
      body_md: 'Hola,\n\nPara reconectar el bot de WhatsApp:\n1. Entra al panel y ve a "Conectar Bot" en el menú de mecánico.\n2. Escanea el QR con tu celular (WhatsApp → Dispositivos vinculados → Vincular un dispositivo).\n3. Espera 30-60 segundos a que autentique.\n\nCualquier duda, respóndeme aquí.' },
    { shortcut: 'welcome-pro', title: 'Bienvenida Plan Pro', category: 'billing',
      body_md: '¡Bienvenido al plan Pro! 🎉\n\nYa tienes acceso a:\n- Órdenes ilimitadas\n- 3 sesiones de WhatsApp\n- Branding completo con tu logo\n- 5 automatizaciones\n\nSi necesitas ayuda con el setup, respóndeme aquí.' },
    { shortcut: 'pago-fallido', title: 'Pago fallido', category: 'billing',
      body_md: 'Hola,\n\nNotamos que tu pago mensual no pasó. Por favor verifica que tu tarjeta tenga saldo o actualízala en Ajustes → Suscripción.\n\nTienes 7 días para regularizar antes de que el plan baje a Free.' },
    { shortcut: 'bug-reportado', title: 'Bug registrado', category: 'technical',
      body_md: 'Gracias por reportarlo. Ya abrí un ticket interno. Te aviso cuando salga el fix (suele ser 24-48h para bugs menores).' },
    { shortcut: 'feature-pipeline', title: 'Feature en roadmap', category: 'feature_request',
      body_md: 'Gracias por la idea. La agregamos al roadmap. No te prometo fecha pero nos ayuda a priorizar lo que más piden los talleres.' },
];

export default function SuperCanned() {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [showNew, setShowNew] = useState(false);

    const load = () => {
        setLoading(true);
        superService.listCanned().then((r) => setItems(r.items || [])).finally(() => setLoading(false));
    };
    useEffect(load, []);

    const seedAll = async () => {
        if (!confirm('Crear las 5 plantillas sugeridas?')) return;
        for (const s of SEEDED) {
            try { await superService.createCanned(s); } catch { /* skip if exists */ }
        }
        toast.success('Plantillas creadas');
        load();
    };

    const del = async (id) => {
        if (!confirm('Eliminar plantilla?')) return;
        try { await superService.deleteCanned(id); toast.success('Eliminada'); load(); }
        catch (e) { toast.error(e.message); }
    };

    return (
        <div>
            <div className="sp-header">
                <div>
                    <h1 className="sp-title"><FileText size={22} style={{ verticalAlign: -4, marginRight: 6 }} /> Plantillas de respuesta</h1>
                    <p className="sp-subtitle">Úsalas en tickets escribiendo el shortcut. {items.length} plantillas.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {items.length === 0 && (
                        <button className="sp-btn-secondary" onClick={seedAll}>Crear 5 sugeridas</button>
                    )}
                    <button className="sp-btn-primary" onClick={() => setShowNew(true)}>
                        <Plus size={14} /> Nueva
                    </button>
                </div>
            </div>

            <div className="sp-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spin" /></div> :
                items.length === 0 ? <div className="sp-empty">Sin plantillas. Crea algunas con "5 sugeridas".</div> :
                <div className="sp-table-wrap">
                    <table className="sp-table">
                        <thead><tr><th>Shortcut</th><th>Título</th><th>Categoría</th><th>Usos</th><th></th></tr></thead>
                        <tbody>
                            {items.map((c) => (
                                <tr key={c.id}>
                                    <td><code style={{ background: '#1e293b', padding: '2px 8px', borderRadius: 4 }}>/{c.shortcut}</code></td>
                                    <td><strong>{c.title}</strong></td>
                                    <td>{c.category || '—'}</td>
                                    <td>{c.use_count}</td>
                                    <td>
                                        <button className="sp-btn-secondary" onClick={() => setEditing(c)} style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Edit3 size={12} /> Editar</button>
                                        {' '}
                                        <button className="sp-btn-danger" onClick={() => del(c.id)} style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Trash2 size={12} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>}
            </div>

            {(editing || showNew) && (
                <EditModal
                    canned={editing}
                    onClose={() => { setEditing(null); setShowNew(false); }}
                    onDone={() => { setEditing(null); setShowNew(false); load(); }}
                />
            )}
            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function EditModal({ canned, onClose, onDone }) {
    const toast = useToast();
    const [shortcut, setShortcut] = useState(canned?.shortcut || '');
    const [title, setTitle] = useState(canned?.title || '');
    const [body_md, setBody] = useState(canned?.body_md || '');
    const [category, setCategory] = useState(canned?.category || '');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        try {
            if (canned) await superService.updateCanned(canned.id, { shortcut, title, body_md, category });
            else await superService.createCanned({ shortcut, title, body_md, category });
            toast.success('Guardado');
            onDone();
        } catch (e) { toast.error(e.message); } finally { setBusy(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="sp-card" style={{ maxWidth: 600, width: '100%', padding: 28 }}>
                <h2 style={{ marginTop: 0 }}>{canned ? 'Editar' : 'Nueva'} plantilla</h2>
                <label className="sp-label">Shortcut (sin /)</label>
                <input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="qr-bot" className="sp-input" />
                <label className="sp-label" style={{ marginTop: 10 }}>Título</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="sp-input" />
                <label className="sp-label" style={{ marginTop: 10 }}>Categoría</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} className="sp-input" placeholder="whatsapp / billing / ..." />
                <label className="sp-label" style={{ marginTop: 10 }}>Cuerpo</label>
                <textarea value={body_md} onChange={(e) => setBody(e.target.value)} rows={8} className="sp-input" style={{ resize: 'vertical' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                    <button className="sp-btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="sp-btn-primary" onClick={submit} disabled={busy}>Guardar</button>
                </div>
            </div>
        </div>
    );
}
