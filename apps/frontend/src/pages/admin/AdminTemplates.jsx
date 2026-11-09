import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { templateService } from '../../lib/api';
import { FileText, MessageCircle, Save, X, Plus } from 'lucide-react';
import './AdminV3.css';

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
    atiende: '\n• Te atiende: Carlos Ruiz (WhatsApp 961 123 4567)',
};

function preview(body) {
    return String(body || '').replace(/\{([a-z_]+)\}/gi, (m, key) =>
        Object.prototype.hasOwnProperty.call(SAMPLE_VARS, key) ? SAMPLE_VARS[key] : m
    );
}

const VARIABLES = ['cliente', 'marca', 'modelo', 'folio', 'total', 'taller', 'portal_link', 'google_reviews', 'hora', 'atiende'];

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
    if (loading) return <div className="adm adm-loading">Cargando…</div>;

    return (
        <div className="adm">
            <header className="adm-head">
                <div>
                    <h1><FileText size={22} /> Plantillas de mensaje</h1>
                    <p>
                        Textos reutilizables con variables como <span className="adm-code">{'{cliente}'}</span>, <span className="adm-code">{'{folio}'}</span> y <span className="adm-code">{'{total}'}</span>.
                        Usa <span className="adm-code">{'{atiende}'}</span> para mostrar quién atiende al cliente.
                    </p>
                </div>
                {canEdit && (
                    <button type="button" className="k-btn" onClick={() => setEditing({ name: '', body: '', channel: 'whatsapp' })}>
                        <Plus size={16} /> Nueva plantilla
                    </button>
                )}
            </header>

            <div className="adm-grid adm-grid--2">
                {templates.map((t) => (
                    <div key={t.id} className="adm-tpl">
                        <div className="adm-tpl__head">
                            <strong><MessageCircle size={15} /> {t.name}</strong>
                            {t.is_default && <span className="adm-badge">Predeterminada</span>}
                        </div>
                        <div className="adm-tpl__body">{preview(t.body)}</div>
                        {canEdit && (
                            <button type="button" className="k-btn k-btn--ghost k-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ ...t })}>Editar</button>
                        )}
                    </div>
                ))}
            </div>

            {templates.length === 0 && (
                <div className="adm-empty">
                    <FileText size={26} />
                    <h3>Aún no hay plantillas</h3>
                    <p>Crea la primera con el botón Nueva plantilla.</p>
                </div>
            )}

            {editing && (
                <div className="adm-overlay" onClick={() => setEditing(null)}>
                    <div className="adm-modal" role="dialog" aria-modal="true" aria-label={editing.id ? 'Editar plantilla' : 'Nueva plantilla'} onClick={(e) => e.stopPropagation()}>
                        <div className="adm-modal__head">
                            <h2>{editing.id ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
                            <button type="button" className="adm-modal__close" onClick={() => setEditing(null)} aria-label="Cerrar"><X size={18} /></button>
                        </div>
                        <div className="adm-field">
                            <label htmlFor="tpl-name">Nombre</label>
                            <input id="tpl-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ej. Confirmación de ingreso" />
                        </div>
                        <div className="adm-field">
                            <label htmlFor="tpl-body">Mensaje</label>
                            <textarea id="tpl-body" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={6} placeholder="Hola {cliente}, tu {marca} {modelo} está lista. Folio: {folio}." />
                            <p className="adm-hint">
                                Variables:{' '}
                                {VARIABLES.map((v) => <span key={v} className="adm-code" style={{ marginRight: 4 }}>{`{${v}}`}</span>)}
                            </p>
                        </div>
                        <div className="adm-preview">
                            <div className="adm-preview__label">Vista previa</div>
                            <div className="adm-preview__body">{preview(editing.body)}</div>
                        </div>
                        <div className="adm-modal__foot">
                            <button type="button" className="k-btn k-btn--ghost" onClick={() => setEditing(null)}>Cancelar</button>
                            <button type="button" className="k-btn" onClick={save}><Save size={15} /> Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
