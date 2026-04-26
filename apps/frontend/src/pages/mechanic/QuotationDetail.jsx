import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft,
    User,
    Bike,
    Wrench,
    Package,
    FileText,
    CheckCircle,
    XCircle,
    Edit2,
    Trash2,
    Save,
    X,
    Plus,
    Loader2,
    ArrowRight,
    AlertCircle,
    MessageCircle,
    Send,
} from 'lucide-react';
import { quotationsService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import './Quotations.css';

const STATUS_LABELS = {
    pending: { label: 'Pendiente', bg: '#FEF9C3', color: '#A16207', border: '#FDE68A' },
    pendiente: { label: 'Pendiente', bg: '#FEF9C3', color: '#A16207', border: '#FDE68A' },
    accepted: { label: 'Aceptada', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
    aceptada: { label: 'Aceptada', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
    rejected: { label: 'Rechazada', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
    rechazada: { label: 'Rechazada', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
    expired: { label: 'Expirada', bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
    expirada: { label: 'Expirada', bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
    converted: { label: 'Convertida', bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
    convertida: { label: 'Convertida', bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
};

function formatMXN(amount) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function cleanPhoneMX(raw) {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('52') ? digits : `52${digits}`;
}

function calcTotal(labor = [], parts = []) {
    const laborTotal = labor.reduce((s, l) => s + (parseFloat(l.price) || 0), 0);
    const partsTotal = parts.reduce(
        (s, p) => s + ((parseFloat(p.price) || 0) * (parseInt(p.quantity) || 0)),
        0
    );
    return { laborTotal, partsTotal, total: laborTotal + partsTotal };
}

export default function QuotationDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const [quotation, setQuotation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);

    // Edit mode state
    const [editing, setEditing] = useState(false);
    const [editLabor, setEditLabor] = useState([]);
    const [editParts, setEditParts] = useState([]);
    const [editComplaint, setEditComplaint] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [editValidDays, setEditValidDays] = useState(15);

    // Delete confirm
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // WhatsApp send state
    const [sendingPDF, setSendingPDF] = useState(false);

    useEffect(() => {
        load();
    }, [id]);

    const load = async () => {
        setLoading(true);
        const { data, error } = await quotationsService.getOne(id);
        if (error || !data) {
            toast.error('No se encontró la cotización');
            navigate('/mechanic/quotations');
            return;
        }
        setQuotation(data);
        // Reset edit state
        setEditLabor((data.labor || []).map(l => ({ name: l.name, price: l.price })));
        setEditParts((data.parts || []).map(p => ({
            name: p.name,
            price: p.price,
            quantity: p.quantity,
        })));
        setEditComplaint(data.customer_complaint || '');
        setEditNotes(data.notes || '');
        setEditValidDays(data.valid_days || 15);
        setLoading(false);
    };

    const totals = useMemo(() => {
        if (!quotation) return { laborTotal: 0, partsTotal: 0, total: 0 };
        if (editing) return calcTotal(editLabor, editParts);
        return calcTotal(quotation.labor || [], quotation.parts || []);
    }, [quotation, editing, editLabor, editParts]);

    const statusKey = (quotation?.status || 'pending').toLowerCase();
    const chip = STATUS_LABELS[statusKey] || STATUS_LABELS.pending;

    const isPending = statusKey === 'pending' || statusKey === 'pendiente';
    const isAccepted = statusKey === 'accepted' || statusKey === 'aceptada';
    const isConverted = statusKey === 'converted' || statusKey === 'convertida';
    const canConvert = isPending || isAccepted;
    const canEdit = !isConverted;
    const canDelete = !isConverted;

    const handleSetStatus = async (newStatus) => {
        if (!quotation) return;
        setWorking(true);
        try {
            const { data, error } = await quotationsService.update(quotation.id, { status: newStatus });
            if (error) throw error;
            toast.success('Estado actualizado');
            await load();
        } catch (err) {
            toast.error('Error: ' + (err.message || 'no se pudo actualizar'));
        } finally {
            setWorking(false);
        }
    };

    const handleConvert = async () => {
        if (!quotation) return;
        if (!window.confirm('¿Convertir esta cotización en orden de servicio?')) return;
        setWorking(true);
        try {
            const { data, error } = await quotationsService.convert(quotation.id);
            if (error) throw error;
            toast.success('Cotización convertida');
            const newOrderId = data?.order_id;
            if (newOrderId) {
                navigate(`/mechanic/order/${newOrderId}`);
            } else {
                await load();
            }
        } catch (err) {
            toast.error('Error: ' + (err.message || 'no se pudo convertir'));
        } finally {
            setWorking(false);
        }
    };

    const handleDelete = async () => {
        if (!quotation) return;
        setWorking(true);
        try {
            const { error } = await quotationsService.remove(quotation.id);
            if (error) throw error;
            toast.success('Cotización eliminada');
            navigate('/mechanic/quotations');
        } catch (err) {
            toast.error('Error: ' + (err.message || 'no se pudo eliminar'));
            setWorking(false);
        }
    };

    // Edit helpers
    const addLaborRow = () => setEditLabor(prev => [...prev, { name: '', price: '' }]);
    const updateLaborField = (i, field, value) => {
        setEditLabor(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
    };
    const removeLaborRow = (i) => setEditLabor(prev => prev.filter((_, idx) => idx !== i));

    const addPartRow = () => setEditParts(prev => [...prev, { name: '', price: '', quantity: 1 }]);
    const updatePartField = (i, field, value) => {
        setEditParts(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
    };
    const removePartRow = (i) => setEditParts(prev => prev.filter((_, idx) => idx !== i));

    const handleStartEdit = () => {
        setEditing(true);
    };

    const handleCancelEdit = () => {
        if (!quotation) return;
        setEditLabor((quotation.labor || []).map(l => ({ name: l.name, price: l.price })));
        setEditParts((quotation.parts || []).map(p => ({
            name: p.name,
            price: p.price,
            quantity: p.quantity,
        })));
        setEditComplaint(quotation.customer_complaint || '');
        setEditNotes(quotation.notes || '');
        setEditValidDays(quotation.valid_days || 15);
        setEditing(false);
    };

    const handleSaveEdit = async () => {
        if (!quotation) return;
        const cleanLabor = editLabor
            .filter(l => l.name.trim() && parseFloat(l.price) >= 0)
            .map(l => ({ name: l.name.trim(), price: parseFloat(l.price) || 0 }));
        const cleanParts = editParts
            .filter(p => p.name.trim() && parseFloat(p.price) >= 0)
            .map(p => ({
                name: p.name.trim(),
                price: parseFloat(p.price) || 0,
                quantity: parseInt(p.quantity) || 1,
            }));
        if (cleanLabor.length === 0 && cleanParts.length === 0) {
            toast.error('Agrega al menos una línea');
            return;
        }
        setWorking(true);
        try {
            const { data, error } = await quotationsService.update(quotation.id, {
                customer_complaint: editComplaint.trim() || null,
                notes: editNotes.trim() || null,
                valid_days: parseInt(editValidDays) || 15,
                labor: cleanLabor,
                parts: cleanParts,
            });
            if (error) throw error;
            toast.success('Cotización actualizada');
            setEditing(false);
            await load();
        } catch (err) {
            toast.error('Error: ' + (err.message || 'no se pudo guardar'));
        } finally {
            setWorking(false);
        }
    };

    // ===== ENVIAR POR WHATSAPP (TEXTO, fallback wa.me) =====
    const handleSendText = () => {
        if (!quotation) return;
        const client = quotation.client || {};
        const moto = quotation.motorcycle || {};
        if (!client.phone) {
            toast.error('Este cliente no tiene número de teléfono');
            return;
        }

        const laborList = quotation.labor || [];
        const partsList = quotation.parts || [];
        const { laborTotal, partsTotal, total } = calcTotal(laborList, partsList);

        const lines = [];
        lines.push(`*Cotización ${quotation.quotation_number || `#${String(quotation.id).slice(0, 8)}`}*`);
        lines.push('');
        lines.push(`Hola ${client.full_name || 'cliente'}, te comparto la cotización:`);
        lines.push('');
        if (moto.brand) {
            const motoStr = `${moto.brand} ${moto.model || ''}`.trim();
            lines.push(`🏍️ Moto: ${motoStr}${moto.plates ? ` (${moto.plates})` : ''}`);
        }
        lines.push(`📋 Motivo: ${quotation.customer_complaint || '(no especificado)'}`);

        if (laborList.length > 0) {
            lines.push('');
            lines.push('🔧 *Mano de obra:*');
            laborList.forEach(l => {
                const price = parseFloat(l.price) || 0;
                lines.push(`  • ${l.name} — $${price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
            });
        }

        if (partsList.length > 0) {
            lines.push('');
            lines.push('🔩 *Refacciones:*');
            partsList.forEach(p => {
                const price = parseFloat(p.price) || 0;
                const qty = parseInt(p.quantity) || 1;
                const subtotal = price * qty;
                lines.push(`  • ${p.name} (x${qty}) — $${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
            });
        }

        lines.push('');
        lines.push('━━━━━━━━━━━━━━');
        if (laborTotal > 0) {
            lines.push(`Mano de obra: $${laborTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
        }
        if (partsTotal > 0) {
            lines.push(`Refacciones: $${partsTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
        }
        lines.push(`*Total estimado: $${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*`);

        if (quotation.valid_until) {
            lines.push('');
            lines.push(`Vigente hasta: ${formatDateShort(quotation.valid_until)}`);
        }

        lines.push('');
        lines.push('Cualquier duda, escríbeme. ¡Gracias!');

        const message = lines.join('\n');
        const phone = cleanPhoneMX(client.phone);
        if (!phone) {
            toast.error('Teléfono inválido');
            return;
        }

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success('Abriendo WhatsApp…');
    };

    // ===== ENVIAR PDF AL WHATSAPP DEL CLIENTE (server-side) =====
    const handleSendPDF = async () => {
        if (!quotation) return;
        const client = quotation.client || {};
        if (!client.phone) {
            toast.error('Este cliente no tiene número de teléfono');
            return;
        }
        setSendingPDF(true);
        try {
            const token = localStorage.getItem('motopartes_token');
            const res = await fetch(`/api/quotation-pdf/${quotation.id}/send`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const result = await res.json().catch(() => ({}));

            if (result.success && result.automated) {
                toast.success('PDF enviado por WhatsApp');
            } else if (result.fallback) {
                toast.error('WhatsApp no disponible — usa el botón de texto');
            } else {
                toast.error(result.error || 'No se pudo enviar el PDF');
            }
        } catch (err) {
            console.error('Error sending PDF:', err);
            toast.error('Error de conexión al enviar PDF');
        } finally {
            setSendingPDF(false);
        }
    };

    if (loading) {
        return (
            <div className="qd-page">
                <div className="qd-skeleton" />
                <div className="qd-skeleton" />
                <div className="qd-skeleton" />
            </div>
        );
    }

    if (!quotation) return null;

    const client = quotation.client || {};
    const moto = quotation.motorcycle || {};
    const labor = editing ? editLabor : (quotation.labor || []);
    const parts = editing ? editParts : (quotation.parts || []);

    return (
        <div className="qd-page">
            {/* TOPBAR */}
            <div className="qd-topbar">
                <button className="qd-back" onClick={() => navigate('/mechanic/quotations')}>
                    <ArrowLeft size={18} />
                </button>
                <h1 className="qd-title">
                    <FileText size={20} />
                    {quotation.quotation_number || `#${String(quotation.id).slice(0, 8)}`}
                </h1>
                <span
                    className="qd-badge"
                    style={{ background: chip.bg, color: chip.color, borderColor: chip.border }}
                >
                    {chip.label}
                </span>
            </div>

            {/* CONVERTED BANNER */}
            {isConverted && quotation.converted_order_id && (
                <Link
                    to={`/mechanic/order/${quotation.converted_order_id}`}
                    className="qd-banner qd-banner-info"
                >
                    <CheckCircle size={18} />
                    <span>
                        Convertida a orden{quotation.converted_order_number ? ` ${quotation.converted_order_number}` : ''}
                    </span>
                    <ArrowRight size={16} />
                </Link>
            )}

            {/* CLIENT + MOTO */}
            <section className="qd-section">
                <div className="qd-row-icon">
                    <User size={16} />
                    <div>
                        <div className="qd-strong">{client.full_name || 'Cliente sin nombre'}</div>
                        {client.phone && <div className="qd-muted">{client.phone}</div>}
                    </div>
                </div>
                {moto.brand && (
                    <div className="qd-row-icon">
                        <Bike size={16} />
                        <div>
                            <div className="qd-strong">{moto.brand} {moto.model}</div>
                            <div className="qd-muted">
                                {moto.year ? `${moto.year}` : ''}{moto.plates ? ` • ${moto.plates}` : ''}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* META */}
            <section className="qd-section">
                <div className="qd-meta-grid">
                    <div>
                        <div className="qd-meta-label">Creada</div>
                        <div className="qd-meta-value">{formatDate(quotation.created_at)}</div>
                    </div>
                    <div>
                        <div className="qd-meta-label">Vigencia</div>
                        {editing ? (
                            <input
                                type="number"
                                className="qd-input qd-input-small"
                                min={1}
                                max={365}
                                value={editValidDays}
                                onChange={(e) => setEditValidDays(e.target.value)}
                            />
                        ) : (
                            <div className="qd-meta-value">{quotation.valid_days || 15} días</div>
                        )}
                    </div>
                    {quotation.valid_until && !editing && (
                        <div>
                            <div className="qd-meta-label">Vence</div>
                            <div className="qd-meta-value">{formatDate(quotation.valid_until)}</div>
                        </div>
                    )}
                </div>
            </section>

            {/* COMPLAINT */}
            <section className="qd-section">
                <div className="qd-section-title">Falla / Motivo</div>
                {editing ? (
                    <textarea
                        className="qd-textarea"
                        rows={3}
                        value={editComplaint}
                        onChange={(e) => setEditComplaint(e.target.value)}
                        placeholder="Describe el problema…"
                    />
                ) : (
                    <div className="qd-text">
                        {quotation.customer_complaint || <span className="qd-muted">Sin descripción</span>}
                    </div>
                )}
            </section>

            {/* LABOR */}
            <section className="qd-section">
                <div className="qd-section-title"><Wrench size={14} /> Mano de obra</div>
                {labor.length === 0 && !editing ? (
                    <div className="qd-muted">Sin conceptos de mano de obra.</div>
                ) : (
                    <div className="qd-rows">
                        {labor.map((row, i) => editing ? (
                            <div key={i} className="qd-edit-row">
                                <input
                                    className="qd-input qd-input-name"
                                    placeholder="Concepto"
                                    value={row.name}
                                    onChange={(e) => updateLaborField(i, 'name', e.target.value)}
                                />
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    className="qd-input qd-input-price"
                                    placeholder="Precio"
                                    value={row.price}
                                    onChange={(e) => updateLaborField(i, 'price', e.target.value)}
                                />
                                <button className="qd-row-del" onClick={() => removeLaborRow(i)}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ) : (
                            <div key={i} className="qd-line">
                                <span className="qd-line-name">{row.name}</span>
                                <span className="qd-line-price">{formatMXN(parseFloat(row.price) || 0)}</span>
                            </div>
                        ))}
                    </div>
                )}
                {editing && (
                    <button className="qd-btn qd-btn-outline qd-mt" onClick={addLaborRow}>
                        <Plus size={14} /> Agregar mano de obra
                    </button>
                )}
            </section>

            {/* PARTS */}
            <section className="qd-section">
                <div className="qd-section-title"><Package size={14} /> Refacciones</div>
                {parts.length === 0 && !editing ? (
                    <div className="qd-muted">Sin refacciones.</div>
                ) : (
                    <div className="qd-rows">
                        {parts.map((row, i) => editing ? (
                            <div key={i} className="qd-edit-row">
                                <input
                                    className="qd-input qd-input-name"
                                    placeholder="Refacción"
                                    value={row.name}
                                    onChange={(e) => updatePartField(i, 'name', e.target.value)}
                                />
                                <input
                                    type="number"
                                    min={1}
                                    className="qd-input qd-input-qty"
                                    placeholder="Cant."
                                    value={row.quantity}
                                    onChange={(e) => updatePartField(i, 'quantity', e.target.value)}
                                />
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    className="qd-input qd-input-price"
                                    placeholder="Precio"
                                    value={row.price}
                                    onChange={(e) => updatePartField(i, 'price', e.target.value)}
                                />
                                <button className="qd-row-del" onClick={() => removePartRow(i)}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ) : (
                            <div key={i} className="qd-line">
                                <span className="qd-line-name">
                                    {row.name}
                                    <span className="qd-line-qty"> × {row.quantity || 1}</span>
                                </span>
                                <span className="qd-line-price">
                                    {formatMXN((parseFloat(row.price) || 0) * (parseInt(row.quantity) || 1))}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
                {editing && (
                    <button className="qd-btn qd-btn-outline qd-mt" onClick={addPartRow}>
                        <Plus size={14} /> Agregar refacción
                    </button>
                )}
            </section>

            {/* NOTES */}
            <section className="qd-section">
                <div className="qd-section-title">Notas</div>
                {editing ? (
                    <textarea
                        className="qd-textarea"
                        rows={2}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notas (opcional)"
                    />
                ) : (
                    <div className="qd-text">
                        {quotation.notes || <span className="qd-muted">Sin notas.</span>}
                    </div>
                )}
            </section>

            {/* TOTALS */}
            <section className="qd-totals">
                <div className="qd-totals-row">
                    <span>Mano de obra</span>
                    <span>{formatMXN(totals.laborTotal)}</span>
                </div>
                <div className="qd-totals-row">
                    <span>Refacciones</span>
                    <span>{formatMXN(totals.partsTotal)}</span>
                </div>
                <div className="qd-totals-divider" />
                <div className="qd-totals-row qd-totals-grand">
                    <span>Total</span>
                    <span>{formatMXN(totals.total)}</span>
                </div>
            </section>

            {/* SHARE — Enviar al cliente (sólo modo lectura) */}
            {!editing && client.phone && (
                <section className="qd-share">
                    <div className="qd-share-title">
                        <Send size={14} /> Enviar al cliente
                    </div>
                    <div className="qd-share-grid">
                        <button
                            className="qd-btn qd-btn-wa qd-btn-block"
                            onClick={handleSendText}
                            disabled={working || sendingPDF}
                            type="button"
                        >
                            <MessageCircle size={16} /> Enviar por WhatsApp
                        </button>
                        <button
                            className="qd-btn qd-btn-pdf qd-btn-block"
                            onClick={handleSendPDF}
                            disabled={working || sendingPDF}
                            type="button"
                        >
                            {sendingPDF ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
                            Enviar PDF
                        </button>
                    </div>
                </section>
            )}

            {/* ACTIONS */}
            {editing ? (
                <div className="qd-actions">
                    <button
                        className="qd-btn qd-btn-outline qd-btn-block"
                        onClick={handleCancelEdit}
                        disabled={working}
                    >
                        <X size={16} /> Cancelar
                    </button>
                    <button
                        className="qd-btn qd-btn-primary qd-btn-block"
                        onClick={handleSaveEdit}
                        disabled={working}
                    >
                        {working ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                        Guardar cambios
                    </button>
                </div>
            ) : (
                <div className="qd-actions">
                    {canConvert && (
                        <button
                            className="qd-btn qd-btn-success qd-btn-block"
                            onClick={handleConvert}
                            disabled={working}
                        >
                            {working ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} />}
                            Convertir a orden
                        </button>
                    )}

                    {isPending && (
                        <div className="qd-status-row">
                            <button
                                className="qd-btn qd-btn-success-outline qd-btn-block"
                                onClick={() => handleSetStatus('aceptada')}
                                disabled={working}
                            >
                                <CheckCircle size={16} /> Marcar aceptada
                            </button>
                            <button
                                className="qd-btn qd-btn-danger-outline qd-btn-block"
                                onClick={() => handleSetStatus('rechazada')}
                                disabled={working}
                            >
                                <XCircle size={16} /> Marcar rechazada
                            </button>
                        </div>
                    )}

                    {canEdit && (
                        <button
                            className="qd-btn qd-btn-outline qd-btn-block"
                            onClick={handleStartEdit}
                            disabled={working}
                        >
                            <Edit2 size={16} /> Editar
                        </button>
                    )}

                    {canDelete && (
                        <button
                            className="qd-btn qd-btn-danger qd-btn-block"
                            onClick={() => setShowDeleteConfirm(true)}
                            disabled={working}
                        >
                            <Trash2 size={16} /> Eliminar
                        </button>
                    )}
                </div>
            )}

            {/* DELETE CONFIRM MODAL */}
            {showDeleteConfirm && (
                <div className="qd-modal-overlay" onClick={() => !working && setShowDeleteConfirm(false)}>
                    <div className="qd-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="qd-modal-icon">
                            <AlertCircle size={32} />
                        </div>
                        <h3>¿Eliminar cotización?</h3>
                        <p>Esta acción no se puede deshacer.</p>
                        <div className="qd-modal-foot">
                            <button
                                className="qd-btn qd-btn-outline"
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={working}
                            >
                                Cancelar
                            </button>
                            <button
                                className="qd-btn qd-btn-danger"
                                onClick={handleDelete}
                                disabled={working}
                            >
                                {working ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
