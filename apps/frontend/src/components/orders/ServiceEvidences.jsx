import { useState, useEffect, useCallback } from 'react';
import {
    Camera, Upload, Trash2, Send, FileText, X, Plus, Check, Clock, User as UserIcon, Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { evidencesService } from '../../lib/api';

// Tipos requeridos (espejo de lib/evidences.js en el backend).
const EVIDENCE_TYPES = [
    { value: 'pieza_danada', label: 'Pieza dañada' },
    { value: 'pieza_nueva', label: 'Pieza nueva' },
    { value: 'despues_trabajo', label: 'Después del trabajo' },
];
const TYPE_LABEL = Object.fromEntries(EVIDENCE_TYPES.map((t) => [t.value, t.label]));

// Redimensiona un archivo de imagen a un dataURL base64 (jpeg 0.8).
function fileToResizedDataUrl(file, maxWidth = 1200) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new window.Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function formatDate(d) {
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ServiceEvidences({ order, onToast }) {
    const { isMasterMechanic, isAuxiliaryMechanic } = useAuth();
    const isMaster = typeof isMasterMechanic === 'function' && isMasterMechanic();
    const isAux = typeof isAuxiliaryMechanic === 'function' && isAuxiliaryMechanic();
    // Regla 1: maestro y mecánico normal suben; auxiliar NO.
    const canUpload = !isAux;
    // Reglas 2/5/10: enviar, eliminar y cotizar = sólo maestro.
    const canManage = isMaster;

    const [evidences, setEvidences] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [type, setType] = useState('pieza_danada');
    const [note, setNote] = useState('');

    // Selección + envío WhatsApp
    const [selected, setSelected] = useState(new Set());
    const [showSendModal, setShowSendModal] = useState(false);
    const [sendMessage, setSendMessage] = useState('');
    const [sending, setSending] = useState(false);

    // Cotización adicional
    const [quoteFor, setQuoteFor] = useState(null); // evidencia
    const [quoteDesc, setQuoteDesc] = useState('');
    const [quoteLabor, setQuoteLabor] = useState([{ name: '', price: '' }]);
    const [quoteParts, setQuoteParts] = useState([{ name: '', price: '', quantity: 1 }]);
    const [savingQuote, setSavingQuote] = useState(false);

    const toast = useCallback((msg, t = 'info') => {
        if (typeof onToast === 'function') onToast(msg, t);
    }, [onToast]);

    const load = useCallback(async () => {
        if (!order?.id) return;
        setLoading(true);
        const { data } = await evidencesService.getByOrder(order.id);
        setEvidences(Array.isArray(data) ? data : []);
        setLoading(false);
    }, [order?.id]);

    useEffect(() => { load(); }, [load]);

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setUploading(true);
        let ok = 0;
        for (const file of files) {
            try {
                const url = await fileToResizedDataUrl(file);
                const { error } = await evidencesService.create({
                    orderId: order.id, url, evidenceType: type, note,
                });
                if (!error) ok++;
            } catch (err) {
                console.error('Error subiendo evidencia:', err);
            }
        }
        setUploading(false);
        setNote('');
        e.target.value = '';
        if (ok > 0) { toast(`${ok} evidencia(s) agregada(s)`, 'success'); load(); }
        else toast('No se pudo subir la evidencia', 'error');
    };

    const handleDelete = async (ev) => {
        if (!window.confirm('¿Eliminar esta evidencia? Quedará registrada como eliminada (no se borra del historial).')) return;
        // Motivo opcional (regla 4).
        const reason = window.prompt('Motivo de la eliminación (opcional):', '') || null;
        const { error } = await evidencesService.remove(ev.id, reason);
        if (error) return toast(error.message || 'Error al eliminar', 'error');
        toast('Evidencia eliminada', 'success');
        setSelected((s) => { const n = new Set(s); n.delete(ev.id); return n; });
        load();
    };

    const toggleSelect = (id) => {
        setSelected((s) => {
            const n = new Set(s);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };

    const openSend = () => {
        if (selected.size === 0) return toast('Selecciona al menos una evidencia', 'info');
        const moto = order?.motorcycle ? `${order.motorcycle.brand} ${order.motorcycle.model}` : 'tu moto';
        setSendMessage(`Hola, te compartimos evidencias del servicio de ${moto} (orden ${order?.order_number || ''}).`);
        setShowSendModal(true);
    };

    const doSend = async () => {
        setSending(true);
        const { data, error } = await evidencesService.send({
            orderId: order.id,
            evidenceIds: [...selected],
            message: sendMessage,
        });
        setSending(false);
        if (error || data?.success === false) {
            return toast((error?.message) || data?.error || 'No se pudo enviar por WhatsApp', 'error');
        }
        toast(`Enviado al cliente (${data?.sent || selected.size})`, 'success');
        setShowSendModal(false);
        setSelected(new Set());
        load();
    };

    // ── Cotización adicional ──
    const openQuote = (ev) => {
        setQuoteFor(ev);
        setQuoteDesc(ev.caption || TYPE_LABEL[ev.evidence_type] || '');
        setQuoteLabor([{ name: '', price: '' }]);
        setQuoteParts([{ name: '', price: '', quantity: 1 }]);
    };
    const updateRow = (setter, rows, idx, field, value) => {
        const next = rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r));
        setter(next);
    };
    const quoteTotal = () => {
        const l = quoteLabor.reduce((s, r) => s + (parseFloat(r.price) || 0), 0);
        const p = quoteParts.reduce((s, r) => s + (parseFloat(r.price) || 0) * (parseInt(r.quantity, 10) || 1), 0);
        return l + p;
    };
    const saveQuote = async () => {
        const labor = quoteLabor.filter((r) => r.name && r.price).map((r) => ({ name: r.name, price: r.price }));
        const parts = quoteParts.filter((r) => r.name && r.price).map((r) => ({ name: r.name, price: r.price, quantity: r.quantity }));
        if (labor.length === 0 && parts.length === 0) {
            return toast('Agrega al menos una mano de obra o refacción', 'info');
        }
        setSavingQuote(true);
        const { data, error } = await evidencesService.createQuote(quoteFor.id, { description: quoteDesc, labor, parts });
        setSavingQuote(false);
        if (error) return toast(error.message || 'Error al crear la cotización', 'error');
        toast(`Cotización adicional ${data?.quotation_number || ''} creada`, 'success');
        setQuoteFor(null);
        load();
    };

    return (
        <div className="evidences-section">
            <div className="ev-header">
                <h3><Camera size={18} /> Evidencias del servicio</h3>
                {canManage && selected.size > 0 && (
                    <button className="ev-btn ev-btn-primary" onClick={openSend}>
                        <Send size={15} /> Enviar al cliente ({selected.size})
                    </button>
                )}
            </div>

            {/* Subir (maestro + mecánico normal). Auxiliar no ve esto. */}
            {canUpload && (
                <div className="ev-upload">
                    <div className="ev-upload-controls">
                        <select value={type} onChange={(e) => setType(e.target.value)} className="ev-input">
                            {EVIDENCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <input
                            type="text" className="ev-input ev-note" placeholder="Nota (opcional)"
                            value={note} onChange={(e) => setNote(e.target.value)}
                        />
                        <label className="ev-btn ev-btn-upload">
                            <input type="file" accept="image/*" multiple capture="environment"
                                onChange={handleFiles} disabled={uploading} style={{ display: 'none' }} />
                            {uploading ? <Loader2 size={15} className="ev-spin" /> : <Upload size={15} />}
                            {uploading ? 'Subiendo…' : 'Agregar evidencia'}
                        </label>
                    </div>
                </div>
            )}

            {/* Listado / historial */}
            {loading ? (
                <p className="ev-empty">Cargando evidencias…</p>
            ) : evidences.length === 0 ? (
                <p className="ev-empty">Aún no hay evidencias registradas.</p>
            ) : (
                <div className="ev-grid">
                    {evidences.map((ev) => (
                        <div key={ev.id} className={`ev-card ${selected.has(ev.id) ? 'ev-selected' : ''}`}>
                            <div className="ev-img-wrap">
                                <img src={ev.url} alt={TYPE_LABEL[ev.evidence_type]} />
                                {canManage && (
                                    <label className="ev-check">
                                        <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleSelect(ev.id)} />
                                    </label>
                                )}
                                <span className="ev-type-badge">{TYPE_LABEL[ev.evidence_type] || 'Evidencia'}</span>
                            </div>
                            <div className="ev-meta">
                                {ev.caption && <p className="ev-caption">{ev.caption}</p>}
                                <div className="ev-meta-row"><Clock size={12} /> {formatDate(ev.created_at)}</div>
                                <div className="ev-meta-row"><UserIcon size={12} /> {ev.uploader?.full_name || 'Mecánico'}</div>
                                {ev.sent_to_client_at && (
                                    <div className="ev-meta-row ev-sent"><Check size={12} /> Enviada al cliente</div>
                                )}
                                {ev.quotation_id && (
                                    <div className="ev-meta-row ev-quoted"><FileText size={12} /> Cotización adicional creada</div>
                                )}
                            </div>
                            {canManage && (
                                <div className="ev-actions">
                                    <button className="ev-link" onClick={() => openQuote(ev)} title="Crear cotización adicional">
                                        <FileText size={14} /> Cotizar extra
                                    </button>
                                    <button className="ev-link ev-danger" onClick={() => handleDelete(ev)} title="Eliminar evidencia">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal: enviar por WhatsApp */}
            {showSendModal && (
                <div className="ev-modal-overlay" onClick={() => setShowSendModal(false)}>
                    <div className="ev-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ev-modal-head">
                            <h4>Enviar evidencias por WhatsApp</h4>
                            <button onClick={() => setShowSendModal(false)}><X size={18} /></button>
                        </div>
                        <p className="ev-modal-sub">{selected.size} evidencia(s) seleccionada(s)</p>
                        <textarea className="ev-input" rows={4} value={sendMessage}
                            onChange={(e) => setSendMessage(e.target.value)} placeholder="Mensaje para el cliente…" />
                        <div className="ev-modal-actions">
                            <button className="ev-btn" onClick={() => setShowSendModal(false)}>Cancelar</button>
                            <button className="ev-btn ev-btn-primary" onClick={doSend} disabled={sending}>
                                {sending ? <Loader2 size={15} className="ev-spin" /> : <Send size={15} />} Enviar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: cotización adicional */}
            {quoteFor && (
                <div className="ev-modal-overlay" onClick={() => setQuoteFor(null)}>
                    <div className="ev-modal ev-modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="ev-modal-head">
                            <h4>Crear cotización adicional</h4>
                            <button onClick={() => setQuoteFor(null)}><X size={18} /></button>
                        </div>
                        <img src={quoteFor.url} alt="evidencia" className="ev-quote-thumb" />
                        <label className="ev-label">Descripción del trabajo extra</label>
                        <input className="ev-input" value={quoteDesc} onChange={(e) => setQuoteDesc(e.target.value)} />

                        <label className="ev-label">Mano de obra</label>
                        {quoteLabor.map((r, i) => (
                            <div key={i} className="ev-line">
                                <input className="ev-input" placeholder="Concepto" value={r.name}
                                    onChange={(e) => updateRow(setQuoteLabor, quoteLabor, i, 'name', e.target.value)} />
                                <input className="ev-input ev-price" type="number" placeholder="$" value={r.price}
                                    onChange={(e) => updateRow(setQuoteLabor, quoteLabor, i, 'price', e.target.value)} />
                            </div>
                        ))}
                        <button className="ev-link" onClick={() => setQuoteLabor([...quoteLabor, { name: '', price: '' }])}>
                            <Plus size={14} /> Agregar mano de obra
                        </button>

                        <label className="ev-label">Refacciones</label>
                        {quoteParts.map((r, i) => (
                            <div key={i} className="ev-line">
                                <input className="ev-input" placeholder="Refacción" value={r.name}
                                    onChange={(e) => updateRow(setQuoteParts, quoteParts, i, 'name', e.target.value)} />
                                <input className="ev-input ev-qty" type="number" min="1" placeholder="Cant" value={r.quantity}
                                    onChange={(e) => updateRow(setQuoteParts, quoteParts, i, 'quantity', e.target.value)} />
                                <input className="ev-input ev-price" type="number" placeholder="$" value={r.price}
                                    onChange={(e) => updateRow(setQuoteParts, quoteParts, i, 'price', e.target.value)} />
                            </div>
                        ))}
                        <button className="ev-link" onClick={() => setQuoteParts([...quoteParts, { name: '', price: '', quantity: 1 }])}>
                            <Plus size={14} /> Agregar refacción
                        </button>

                        <div className="ev-quote-total">Total estimado: <strong>${quoteTotal().toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></div>
                        <p className="ev-modal-sub">El cliente podrá autorizar este trabajo extra desde su enlace de seguimiento.</p>
                        <div className="ev-modal-actions">
                            <button className="ev-btn" onClick={() => setQuoteFor(null)}>Cancelar</button>
                            <button className="ev-btn ev-btn-primary" onClick={saveQuote} disabled={savingQuote}>
                                {savingQuote ? <Loader2 size={15} className="ev-spin" /> : <Check size={15} />} Crear cotización
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .evidences-section { margin-top: 1.5rem; }
                .ev-header { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1rem; flex-wrap:wrap; }
                .ev-header h3 { display:flex; align-items:center; gap:.5rem; font-size:1rem; margin:0; color:var(--text-primary,#1d1d1f); }
                .ev-upload { background:var(--bg-secondary,#f5f5f7); border:1px dashed var(--border-color,#d2d2d7); border-radius:12px; padding:1rem; margin-bottom:1rem; }
                .ev-upload-controls { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; }
                .ev-input { padding:.5rem .75rem; border:1px solid var(--border-color,#d2d2d7); border-radius:8px; font-size:.875rem; background:white; }
                .ev-note { flex:1; min-width:140px; }
                .ev-label { display:block; font-size:.75rem; font-weight:600; color:#6e6e73; margin:.75rem 0 .25rem; text-transform:uppercase; }
                .ev-btn { display:inline-flex; align-items:center; gap:.4rem; padding:.5rem .9rem; border-radius:8px; border:1px solid var(--border-color,#d2d2d7); background:white; cursor:pointer; font-size:.85rem; font-weight:600; }
                .ev-btn-primary { background:#d71920; color:white; border-color:#d71920; }
                .ev-btn-upload { background:#0ea5e9; color:white; border-color:#0ea5e9; }
                .ev-empty { color:#86868b; font-size:.875rem; padding:1rem 0; }
                .ev-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:1rem; }
                .ev-card { border:1px solid var(--border-color,#e8e8ed); border-radius:12px; overflow:hidden; background:white; display:flex; flex-direction:column; }
                .ev-card.ev-selected { outline:2px solid #d71920; }
                .ev-img-wrap { position:relative; aspect-ratio:4/3; background:#000; }
                .ev-img-wrap img { width:100%; height:100%; object-fit:cover; }
                .ev-check { position:absolute; top:6px; left:6px; background:white; border-radius:6px; padding:2px 4px; }
                .ev-type-badge { position:absolute; bottom:6px; left:6px; background:rgba(0,0,0,.7); color:white; font-size:.7rem; padding:2px 8px; border-radius:99px; }
                .ev-meta { padding:.6rem .7rem; font-size:.78rem; color:#6e6e73; flex:1; }
                .ev-caption { color:#1d1d1f; font-size:.82rem; margin:0 0 .4rem; }
                .ev-meta-row { display:flex; align-items:center; gap:.35rem; margin-top:.2rem; }
                .ev-sent { color:#16a34a; font-weight:600; }
                .ev-quoted { color:#d97706; font-weight:600; }
                .ev-actions { display:flex; justify-content:space-between; align-items:center; padding:.5rem .7rem; border-top:1px solid #f0f0f0; }
                .ev-link { display:inline-flex; align-items:center; gap:.3rem; background:none; border:none; color:#0ea5e9; cursor:pointer; font-size:.8rem; font-weight:600; padding:0; }
                .ev-link.ev-danger { color:#dc2626; }
                .ev-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:1000; padding:1rem; }
                .ev-modal { background:white; border-radius:16px; padding:1.25rem; width:100%; max-width:420px; max-height:90vh; overflow-y:auto; }
                .ev-modal-lg { max-width:560px; }
                .ev-modal-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem; }
                .ev-modal-head h4 { margin:0; font-size:1rem; }
                .ev-modal-head button { background:none; border:none; cursor:pointer; color:#86868b; }
                .ev-modal-sub { font-size:.8rem; color:#86868b; margin:.25rem 0 .75rem; }
                .ev-modal textarea.ev-input, .ev-modal input.ev-input { width:100%; box-sizing:border-box; }
                .ev-modal-actions { display:flex; justify-content:flex-end; gap:.5rem; margin-top:1rem; }
                .ev-line { display:flex; gap:.5rem; margin-bottom:.4rem; }
                .ev-line .ev-input { flex:1; }
                .ev-price { max-width:90px; } .ev-qty { max-width:64px; }
                .ev-quote-thumb { width:100%; max-height:160px; object-fit:cover; border-radius:10px; margin-bottom:.5rem; }
                .ev-quote-total { text-align:right; margin-top:.75rem; font-size:.95rem; }
                .ev-spin { animation:ev-rotate 1s linear infinite; }
                @keyframes ev-rotate { to { transform:rotate(360deg); } }
            `}</style>
        </div>
    );
}
