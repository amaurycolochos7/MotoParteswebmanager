import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Search,
    Phone,
    User,
    UserPlus,
    Bike,
    Plus,
    Trash2,
    Wrench,
    Package,
    FileText,
    Save,
    Loader2,
    X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { quotationsService } from '../../lib/api';

function formatMXN(amount) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount || 0);
}

export default function NewQuotation() {
    const navigate = useNavigate();
    const toast = useToast();
    const {
        findClientByPhone,
        getClientMotorcycles,
        addClient,
        addMotorcycle,
    } = useData();

    // Client
    const [clientPhone, setClientPhone] = useState('');
    const [searchPerformed, setSearchPerformed] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientMotos, setClientMotos] = useState([]);

    // Quick client modal
    const [showQuickClient, setShowQuickClient] = useState(false);
    const [quickClient, setQuickClient] = useState({ full_name: '', phone: '', notes: '' });
    const [savingQuickClient, setSavingQuickClient] = useState(false);

    // Motorcycle
    const [selectedMotoId, setSelectedMotoId] = useState('');
    const [showQuickMoto, setShowQuickMoto] = useState(false);
    const [quickMoto, setQuickMoto] = useState({ brand: '', model: '', year: '', plates: '' });
    const [savingQuickMoto, setSavingQuickMoto] = useState(false);

    // Quotation fields
    const [customerComplaint, setCustomerComplaint] = useState('');
    const [validDays, setValidDays] = useState(15);
    const [labor, setLabor] = useState([{ name: '', price: '' }]);
    const [parts, setParts] = useState([{ name: '', price: '', quantity: 1 }]);
    const [notes, setNotes] = useState('');

    const [submitting, setSubmitting] = useState(false);

    // Search
    const handlePhoneSearch = () => {
        if (clientPhone.replace(/\D/g, '').length < 10) {
            toast.warning('Ingresa un teléfono de al menos 10 dígitos');
            return;
        }
        const found = findClientByPhone(clientPhone);
        setSearchPerformed(true);
        if (found) {
            setSelectedClient(found);
            const motos = getClientMotorcycles(found.id);
            setClientMotos(motos || []);
            setSelectedMotoId('');
        } else {
            setSelectedClient(null);
            setClientMotos([]);
            setQuickClient(prev => ({ ...prev, phone: clientPhone }));
            setShowQuickClient(true);
        }
    };

    const handleSaveQuickClient = async () => {
        if (!quickClient.full_name.trim() || !quickClient.phone.trim()) {
            toast.error('Nombre y teléfono son obligatorios');
            return;
        }
        setSavingQuickClient(true);
        try {
            const newClient = await addClient({
                full_name: quickClient.full_name.trim(),
                phone: quickClient.phone.trim(),
                notes: quickClient.notes.trim() || null,
            });
            setSelectedClient(newClient);
            setClientPhone(newClient.phone);
            setClientMotos([]);
            setSearchPerformed(true);
            setShowQuickClient(false);
            setQuickClient({ full_name: '', phone: '', notes: '' });
            toast.success('Cliente creado');
        } catch (err) {
            toast.error('Error: ' + (err.message || 'no se pudo crear el cliente'));
        } finally {
            setSavingQuickClient(false);
        }
    };

    const handleSaveQuickMoto = async () => {
        if (!selectedClient) return;
        if (!quickMoto.brand.trim() || !quickMoto.model.trim()) {
            toast.error('Marca y modelo son obligatorios');
            return;
        }
        setSavingQuickMoto(true);
        try {
            const newMoto = await addMotorcycle({
                client_id: selectedClient.id,
                brand: quickMoto.brand.trim(),
                model: quickMoto.model.trim(),
                year: quickMoto.year ? parseInt(quickMoto.year) : null,
                plates: quickMoto.plates.trim() || '',
            });
            setClientMotos(prev => [...prev, newMoto]);
            setSelectedMotoId(newMoto.id);
            setShowQuickMoto(false);
            setQuickMoto({ brand: '', model: '', year: '', plates: '' });
            toast.success('Moto agregada');
        } catch (err) {
            toast.error('Error: ' + (err.message || 'no se pudo agregar la moto'));
        } finally {
            setSavingQuickMoto(false);
        }
    };

    // Labor / Parts handlers
    const addLaborRow = () => setLabor(prev => [...prev, { name: '', price: '' }]);
    const updateLabor = (i, field, value) => {
        setLabor(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
    };
    const removeLabor = (i) => {
        setLabor(prev => prev.filter((_, idx) => idx !== i));
    };

    const addPartRow = () => setParts(prev => [...prev, { name: '', price: '', quantity: 1 }]);
    const updatePart = (i, field, value) => {
        setParts(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
    };
    const removePart = (i) => {
        setParts(prev => prev.filter((_, idx) => idx !== i));
    };

    const totals = useMemo(() => {
        const laborTotal = labor.reduce((s, l) => s + (parseFloat(l.price) || 0), 0);
        const partsTotal = parts.reduce(
            (s, p) => s + ((parseFloat(p.price) || 0) * (parseInt(p.quantity) || 0)),
            0
        );
        return { laborTotal, partsTotal, total: laborTotal + partsTotal };
    }, [labor, parts]);

    const handleSubmit = async () => {
        if (!selectedClient) {
            toast.error('Selecciona o crea un cliente');
            return;
        }
        // Filter out empty rows
        const cleanLabor = labor
            .filter(l => l.name.trim() && parseFloat(l.price) >= 0)
            .map(l => ({ name: l.name.trim(), price: parseFloat(l.price) || 0 }));
        const cleanParts = parts
            .filter(p => p.name.trim() && parseFloat(p.price) >= 0)
            .map(p => ({
                name: p.name.trim(),
                price: parseFloat(p.price) || 0,
                quantity: parseInt(p.quantity) || 1,
            }));

        if (cleanLabor.length === 0 && cleanParts.length === 0) {
            toast.error('Agrega al menos una línea de mano de obra o refacción');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                client_id: selectedClient.id,
                motorcycle_id: selectedMotoId || null,
                customer_complaint: customerComplaint.trim() || null,
                notes: notes.trim() || null,
                valid_days: parseInt(validDays) || 15,
                labor: cleanLabor,
                parts: cleanParts,
            };
            const { data, error } = await quotationsService.create(payload);
            if (error) throw error;
            toast.success('Cotización creada');
            navigate(`/mechanic/quotations/${data.id}`);
        } catch (err) {
            toast.error('Error: ' + (err.message || 'no se pudo crear la cotización'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="nq-page">
            <div className="nq-topbar">
                <button className="nq-back" onClick={() => navigate('/mechanic/quotations')}>
                    <ArrowLeft size={18} />
                </button>
                <h1 className="nq-title">
                    <FileText size={20} /> Nueva cotización
                </h1>
            </div>

            {/* CLIENT */}
            <section className="nq-section">
                <h2 className="nq-section-title"><User size={16} /> Cliente</h2>
                {!selectedClient ? (
                    <>
                        <div className="nq-search-row">
                            <div className="nq-input-wrap">
                                <Phone size={16} className="nq-input-icon" />
                                <input
                                    type="tel"
                                    className="nq-input"
                                    placeholder="Teléfono del cliente"
                                    value={clientPhone}
                                    onChange={(e) => setClientPhone(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handlePhoneSearch()}
                                />
                            </div>
                            <button className="nq-btn nq-btn-secondary" onClick={handlePhoneSearch}>
                                <Search size={16} /> Buscar
                            </button>
                        </div>
                        {searchPerformed && (
                            <p className="nq-hint">No se encontró el cliente. Crea uno nuevo.</p>
                        )}
                        <button
                            className="nq-btn nq-btn-outline nq-mt"
                            onClick={() => setShowQuickClient(true)}
                        >
                            <UserPlus size={16} /> Nuevo cliente
                        </button>
                    </>
                ) : (
                    <div className="nq-client-card">
                        <div>
                            <div className="nq-client-name">{selectedClient.full_name}</div>
                            <div className="nq-client-phone">{selectedClient.phone}</div>
                        </div>
                        <button
                            className="nq-link-btn"
                            onClick={() => {
                                setSelectedClient(null);
                                setClientPhone('');
                                setSearchPerformed(false);
                                setClientMotos([]);
                                setSelectedMotoId('');
                            }}
                        >
                            Cambiar
                        </button>
                    </div>
                )}
            </section>

            {/* MOTORCYCLE */}
            {selectedClient && (
                <section className="nq-section">
                    <h2 className="nq-section-title"><Bike size={16} /> Motocicleta</h2>
                    {clientMotos.length > 0 && (
                        <div className="nq-moto-list">
                            {clientMotos.map(m => (
                                <button
                                    key={m.id}
                                    className={`nq-moto-card ${selectedMotoId === m.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedMotoId(m.id)}
                                >
                                    <div className="nq-moto-name">{m.brand} {m.model}</div>
                                    <div className="nq-moto-meta">
                                        {m.year ? `${m.year}` : ''}{m.plates ? ` • ${m.plates}` : ''}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        className="nq-btn nq-btn-outline nq-mt"
                        onClick={() => setShowQuickMoto(true)}
                    >
                        <Plus size={16} /> Agregar moto
                    </button>
                    <p className="nq-hint nq-mt">La moto es opcional para cotizar.</p>
                </section>
            )}

            {/* COMPLAINT */}
            <section className="nq-section">
                <h2 className="nq-section-title">Falla / Motivo</h2>
                <textarea
                    className="nq-textarea"
                    placeholder="Describe el problema o motivo de la cotización…"
                    rows={3}
                    value={customerComplaint}
                    onChange={(e) => setCustomerComplaint(e.target.value)}
                />
            </section>

            {/* VALID DAYS */}
            <section className="nq-section">
                <h2 className="nq-section-title">Vigencia</h2>
                <div className="nq-valid-row">
                    <input
                        type="number"
                        min={1}
                        max={365}
                        className="nq-input nq-input-small"
                        value={validDays}
                        onChange={(e) => setValidDays(e.target.value)}
                    />
                    <span className="nq-valid-suffix">días</span>
                </div>
            </section>

            {/* LABOR */}
            <section className="nq-section">
                <h2 className="nq-section-title"><Wrench size={16} /> Mano de obra</h2>
                <div className="nq-rows">
                    {labor.map((row, i) => (
                        <div key={i} className="nq-row">
                            <input
                                className="nq-input nq-row-name"
                                placeholder="Concepto (ej. cambio de balatas)"
                                value={row.name}
                                onChange={(e) => updateLabor(i, 'name', e.target.value)}
                            />
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                className="nq-input nq-row-price"
                                placeholder="Precio"
                                value={row.price}
                                onChange={(e) => updateLabor(i, 'price', e.target.value)}
                            />
                            {labor.length > 1 && (
                                <button className="nq-row-del" onClick={() => removeLabor(i)}>
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <button className="nq-btn nq-btn-outline nq-mt" onClick={addLaborRow}>
                    <Plus size={16} /> Agregar mano de obra
                </button>
            </section>

            {/* PARTS */}
            <section className="nq-section">
                <h2 className="nq-section-title"><Package size={16} /> Refacciones</h2>
                <div className="nq-rows">
                    {parts.map((row, i) => (
                        <div key={i} className="nq-row">
                            <input
                                className="nq-input nq-row-name"
                                placeholder="Refacción (ej. balatas delanteras)"
                                value={row.name}
                                onChange={(e) => updatePart(i, 'name', e.target.value)}
                            />
                            <input
                                type="number"
                                min={1}
                                className="nq-input nq-row-qty"
                                placeholder="Cant."
                                value={row.quantity}
                                onChange={(e) => updatePart(i, 'quantity', e.target.value)}
                            />
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                className="nq-input nq-row-price"
                                placeholder="Precio"
                                value={row.price}
                                onChange={(e) => updatePart(i, 'price', e.target.value)}
                            />
                            {parts.length > 1 && (
                                <button className="nq-row-del" onClick={() => removePart(i)}>
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <button className="nq-btn nq-btn-outline nq-mt" onClick={addPartRow}>
                    <Plus size={16} /> Agregar refacción
                </button>
            </section>

            {/* NOTES */}
            <section className="nq-section">
                <h2 className="nq-section-title">Notas adicionales</h2>
                <textarea
                    className="nq-textarea"
                    placeholder="Notas internas o aclaraciones para el cliente (opcional)"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </section>

            {/* TOTALS + SUBMIT */}
            <section className="nq-totals-card">
                <div className="nq-totals-row">
                    <span>Mano de obra</span>
                    <span>{formatMXN(totals.laborTotal)}</span>
                </div>
                <div className="nq-totals-row">
                    <span>Refacciones</span>
                    <span>{formatMXN(totals.partsTotal)}</span>
                </div>
                <div className="nq-totals-divider" />
                <div className="nq-totals-row nq-totals-grand">
                    <span>Total estimado</span>
                    <span>{formatMXN(totals.total)}</span>
                </div>
            </section>

            <button
                className="nq-submit"
                disabled={submitting || !selectedClient}
                onClick={handleSubmit}
            >
                {submitting ? (
                    <><Loader2 size={18} className="spin" /> Creando…</>
                ) : (
                    <><Save size={18} /> Crear cotización</>
                )}
            </button>

            {/* QUICK CLIENT MODAL */}
            {showQuickClient && (
                <div className="nq-modal-overlay" onClick={() => !savingQuickClient && setShowQuickClient(false)}>
                    <div className="nq-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="nq-modal-head">
                            <h3>Nuevo cliente</h3>
                            <button className="nq-modal-close" onClick={() => setShowQuickClient(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="nq-modal-body">
                            <label className="nq-label">Nombre completo *</label>
                            <input
                                className="nq-input"
                                placeholder="Nombre"
                                value={quickClient.full_name}
                                onChange={(e) => setQuickClient({ ...quickClient, full_name: e.target.value })}
                            />
                            <label className="nq-label">Teléfono *</label>
                            <input
                                className="nq-input"
                                type="tel"
                                placeholder="Teléfono"
                                value={quickClient.phone}
                                onChange={(e) => setQuickClient({ ...quickClient, phone: e.target.value })}
                            />
                            <label className="nq-label">Notas</label>
                            <textarea
                                className="nq-textarea"
                                placeholder="Notas (opcional)"
                                rows={2}
                                value={quickClient.notes}
                                onChange={(e) => setQuickClient({ ...quickClient, notes: e.target.value })}
                            />
                        </div>
                        <div className="nq-modal-foot">
                            <button
                                className="nq-btn nq-btn-outline"
                                onClick={() => setShowQuickClient(false)}
                                disabled={savingQuickClient}
                            >
                                Cancelar
                            </button>
                            <button
                                className="nq-btn nq-btn-primary"
                                onClick={handleSaveQuickClient}
                                disabled={savingQuickClient}
                            >
                                {savingQuickClient ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QUICK MOTO MODAL */}
            {showQuickMoto && (
                <div className="nq-modal-overlay" onClick={() => !savingQuickMoto && setShowQuickMoto(false)}>
                    <div className="nq-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="nq-modal-head">
                            <h3>Agregar motocicleta</h3>
                            <button className="nq-modal-close" onClick={() => setShowQuickMoto(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="nq-modal-body">
                            <label className="nq-label">Marca *</label>
                            <input
                                className="nq-input"
                                placeholder="Marca (ej. Honda)"
                                value={quickMoto.brand}
                                onChange={(e) => setQuickMoto({ ...quickMoto, brand: e.target.value })}
                            />
                            <label className="nq-label">Modelo *</label>
                            <input
                                className="nq-input"
                                placeholder="Modelo (ej. CG150)"
                                value={quickMoto.model}
                                onChange={(e) => setQuickMoto({ ...quickMoto, model: e.target.value })}
                            />
                            <label className="nq-label">Año</label>
                            <input
                                className="nq-input"
                                type="number"
                                placeholder="Año"
                                value={quickMoto.year}
                                onChange={(e) => setQuickMoto({ ...quickMoto, year: e.target.value })}
                            />
                            <label className="nq-label">Placas</label>
                            <input
                                className="nq-input"
                                placeholder="Placas (opcional)"
                                value={quickMoto.plates}
                                onChange={(e) => setQuickMoto({ ...quickMoto, plates: e.target.value })}
                            />
                        </div>
                        <div className="nq-modal-foot">
                            <button
                                className="nq-btn nq-btn-outline"
                                onClick={() => setShowQuickMoto(false)}
                                disabled={savingQuickMoto}
                            >
                                Cancelar
                            </button>
                            <button
                                className="nq-btn nq-btn-primary"
                                onClick={handleSaveQuickMoto}
                                disabled={savingQuickMoto}
                            >
                                {savingQuickMoto ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .nq-page {
                    padding: 12px 16px 120px;
                    max-width: 760px;
                    margin: 0 auto;
                }
                .nq-topbar {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 14px;
                }
                .nq-back {
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
                .nq-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 1.25rem;
                    font-weight: 800;
                    color: #0F172A;
                    margin: 0;
                }

                .nq-section {
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 10px;
                    padding: 14px;
                    margin-bottom: 12px;
                }
                .nq-section-title {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #0F172A;
                    margin: 0 0 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .nq-input-wrap {
                    position: relative;
                    flex: 1;
                }
                .nq-input-icon {
                    position: absolute;
                    left: 10px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #9CA3AF;
                }
                .nq-input {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    font-size: 14px;
                    font-family: inherit;
                    background: white;
                    color: #0F172A;
                    box-sizing: border-box;
                }
                .nq-input-wrap .nq-input { padding-left: 34px; }
                .nq-input:focus { outline: none; border-color: #111827; }
                .nq-input-small { width: 100px; }

                .nq-textarea {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    font-size: 14px;
                    font-family: inherit;
                    background: white;
                    color: #0F172A;
                    resize: vertical;
                    box-sizing: border-box;
                }
                .nq-textarea:focus { outline: none; border-color: #111827; }

                .nq-search-row {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .nq-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 9px 14px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    border: none;
                    cursor: pointer;
                    font-family: inherit;
                }
                .nq-btn-primary {
                    background: #111827;
                    color: white;
                }
                .nq-btn-secondary {
                    background: #1F2937;
                    color: white;
                }
                .nq-btn-outline {
                    background: white;
                    border: 1px solid #D1D5DB;
                    color: #111827;
                }
                .nq-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .nq-mt { margin-top: 10px; }

                .nq-hint {
                    color: #6B7280;
                    font-size: 12px;
                    margin: 6px 0 0;
                }

                .nq-client-card {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px;
                    background: #F9FAFB;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                }
                .nq-client-name { font-weight: 700; color: #0F172A; }
                .nq-client-phone { font-size: 12px; color: #6B7280; margin-top: 2px; }
                .nq-link-btn {
                    background: none;
                    border: none;
                    color: #2563EB;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                }

                .nq-moto-list {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .nq-moto-card {
                    text-align: left;
                    padding: 10px 12px;
                    border: 1px solid #E5E7EB;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-family: inherit;
                }
                .nq-moto-card.selected {
                    border-color: #111827;
                    background: #F9FAFB;
                }
                .nq-moto-name { font-weight: 700; color: #0F172A; font-size: 14px; }
                .nq-moto-meta { font-size: 12px; color: #6B7280; margin-top: 2px; }

                .nq-valid-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .nq-valid-suffix {
                    font-size: 13px;
                    color: #6B7280;
                }

                .nq-rows {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .nq-row {
                    display: flex;
                    gap: 6px;
                    align-items: center;
                }
                .nq-row-name { flex: 2; min-width: 0; }
                .nq-row-qty { width: 80px; flex: 0 0 auto; }
                .nq-row-price { width: 110px; flex: 0 0 auto; }
                .nq-row-del {
                    background: rgba(239, 68, 68, 0.1);
                    border: none;
                    color: #DC2626;
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    flex: 0 0 auto;
                }

                .nq-totals-card {
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 10px;
                    padding: 14px;
                    margin-bottom: 12px;
                }
                .nq-totals-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 14px;
                    color: #374151;
                    padding: 4px 0;
                }
                .nq-totals-grand {
                    font-size: 16px;
                    font-weight: 800;
                    color: #0F172A;
                }
                .nq-totals-divider {
                    height: 1px;
                    background: #E5E7EB;
                    margin: 6px 0;
                }

                .nq-submit {
                    width: 100%;
                    padding: 14px;
                    background: #111827;
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 16px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    font-family: inherit;
                }
                .nq-submit:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }

                /* Modals */
                .nq-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.45);
                    z-index: 200;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                }
                .nq-modal {
                    background: white;
                    border-radius: 12px;
                    width: 100%;
                    max-width: 420px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
                }
                .nq-modal-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 14px 16px;
                    border-bottom: 1px solid #E5E7EB;
                }
                .nq-modal-head h3 {
                    margin: 0;
                    font-size: 15px;
                    font-weight: 700;
                    color: #0F172A;
                }
                .nq-modal-close {
                    background: none;
                    border: none;
                    color: #6B7280;
                    cursor: pointer;
                }
                .nq-modal-body {
                    padding: 14px 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .nq-label {
                    display: block;
                    font-size: 12px;
                    font-weight: 700;
                    color: #374151;
                    margin: 8px 0 4px;
                }
                .nq-modal-foot {
                    display: flex;
                    justify-content: flex-end;
                    gap: 8px;
                    padding: 12px 16px;
                    border-top: 1px solid #E5E7EB;
                }
            `}</style>
        </div>
    );
}
