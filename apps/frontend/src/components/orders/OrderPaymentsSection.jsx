import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Plus, X, Loader2, Download, Ban, CheckCircle2 } from 'lucide-react';
import { orderPaymentsService } from '../../lib/api';
import { downloadPaymentReceiptPDF } from '../../utils/pdfGenerator';

// ELIHU: sección "Pagos y saldo" del detalle de orden.
// Varios abonos, saldo pendiente, estado de pago, recibo con folio.
// Solo el maestro/dueño (canManage) puede registrar/cancelar; el resto solo ve.

const fmt = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);

const METHOD_LABELS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro' };
const STATUS_STYLE = {
    Pendiente: { bg: '#fef2f2', fg: '#b91c1c' },
    Parcial: { bg: '#fffbeb', fg: '#b45309' },
    Pagada: { bg: '#f0fdf4', fg: '#15803d' },
};

export default function OrderPaymentsSection({ order, client, motorcycle, workshopName, canManage, onChanged, onFinance }) {
    const [finance, setFinance] = useState(null);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState('efectivo');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        if (!order?.id) return;
        setLoading(true);
        const { data, error } = await orderPaymentsService.listByOrder(order.id);
        if (!error && data) {
            setFinance(data.finance);
            setPayments(data.payments || []);
            onFinance?.(data.finance);
        }
        setLoading(false);
    }, [order?.id]);

    useEffect(() => { load(); }, [load]);

    const activePayments = payments.filter((p) => !p.cancelled_at);

    const handleRegister = async () => {
        setErr(null);
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) { setErr('El monto debe ser mayor a 0'); return; }
        setSaving(true);
        const { error } = await orderPaymentsService.create({
            order_id: order.id, amount: amt, payment_method: method, note: note.trim() || null,
        });
        setSaving(false);
        if (error) { setErr(error.message || 'No se pudo registrar el abono'); return; }
        setAmount(''); setNote(''); setMethod('efectivo'); setShowForm(false);
        await load();
        onChanged?.();
    };

    const handleCancel = async (p) => {
        const reason = window.prompt('Motivo de cancelación del abono:');
        if (reason === null) return;
        const { error } = await orderPaymentsService.cancel(p.id, reason || 'Sin motivo');
        if (error) { setErr(error.message); return; }
        await load();
        onChanged?.();
    };

    const handleReceipt = async (p) => {
        const { data, error } = await orderPaymentsService.getReceipt(p.id);
        if (error || !data) { setErr('No se pudo generar el recibo'); return; }
        await downloadPaymentReceiptPDF({ ...data, workshop: data.workshop || workshopName });
    };

    const st = finance ? (STATUS_STYLE[finance.payment_status] || STATUS_STYLE.Pendiente) : STATUS_STYLE.Pendiente;
    const box = { border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', margin: '12px 0', overflow: 'hidden' };
    const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#111827' };
    const rowS = { display: 'flex', justifyContent: 'space-between', padding: '6px 14px', fontSize: 14 };

    return (
        <div style={box} className="od-payments">
            <div style={head}><DollarSign size={18} /> Pagos y saldo</div>

            {loading ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#6b7280' }}><Loader2 size={18} className="spinner" /></div>
            ) : (
                <>
                    <div style={{ padding: '8px 0' }}>
                        <div style={rowS}><span style={{ color: '#6b7280' }}>Total de la orden</span><strong>{fmt(finance?.total)}</strong></div>
                        <div style={rowS}><span style={{ color: '#6b7280' }}>Total pagado</span><span style={{ color: '#15803d', fontWeight: 600 }}>{fmt(finance?.paid)}</span></div>
                        <div style={{ ...rowS, fontSize: 16 }}>
                            <span style={{ fontWeight: 700 }}>Saldo pendiente</span>
                            <strong style={{ color: (finance?.balance || 0) > 0 ? '#b91c1c' : '#15803d' }}>{fmt(finance?.balance)}</strong>
                        </div>
                        <div style={{ padding: '6px 14px' }}>
                            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: st.bg, color: st.fg }}>
                                {finance?.payment_status || 'Pendiente'}
                            </span>
                            {finance?.overpaid > 0 && (
                                <span style={{ marginLeft: 8, fontSize: 12, color: '#b45309' }}>Sobrepago: {fmt(finance.overpaid)}</span>
                            )}
                        </div>
                    </div>

                    {/* Historial de abonos */}
                    {activePayments.length === 0 ? (
                        <p style={{ padding: '0 14px 12px', color: '#9ca3af', fontSize: 13 }}>Sin abonos registrados.</p>
                    ) : (
                        <div style={{ borderTop: '1px solid #f1f5f9' }}>
                            {payments.map((p) => (
                                <div key={p.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f8fafc', opacity: p.cancelled_at ? 0.5 : 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <strong style={{ textDecoration: p.cancelled_at ? 'line-through' : 'none' }}>{fmt(p.amount)}</strong>
                                        <span style={{ fontSize: 12, color: '#6b7280' }}>{METHOD_LABELS[p.payment_method] || p.payment_method}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#9ca3af', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                                        <span>{new Date(p.payment_date).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                        <span>{p.receipt_number}</span>
                                    </div>
                                    {p.note && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{p.note}</div>}
                                    {p.cancelled_at && <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>Cancelado: {p.cancellation_reason}</div>}
                                    {!p.cancelled_at && (
                                        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                            <button onClick={() => handleReceipt(p)} style={linkBtn}><Download size={13} /> Recibo</button>
                                            {canManage && <button onClick={() => handleCancel(p)} style={{ ...linkBtn, color: '#b91c1c' }}><Ban size={13} /> Cancelar</button>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Registrar abono */}
                    {canManage && (
                        <div style={{ padding: 14, borderTop: '1px solid #f1f5f9' }}>
                            {!showForm ? (
                                <button onClick={() => setShowForm(true)} disabled={(finance?.balance || 0) <= 0}
                                    style={{ ...primaryBtn, opacity: (finance?.balance || 0) <= 0 ? 0.5 : 1 }}>
                                    <Plus size={16} /> Registrar abono
                                </button>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <input type="number" min="0" step="0.01" placeholder="Monto del abono" value={amount}
                                        onChange={(e) => setAmount(e.target.value)} style={input} autoFocus />
                                    <select value={method} onChange={(e) => setMethod(e.target.value)} style={input}>
                                        <option value="efectivo">Efectivo</option>
                                        <option value="transferencia">Transferencia</option>
                                        <option value="tarjeta">Tarjeta</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                    <input type="text" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} style={input} />
                                    {err && <div style={{ color: '#b91c1c', fontSize: 13 }}>{err}</div>}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={handleRegister} disabled={saving} style={primaryBtn}>
                                            {saving ? <Loader2 size={16} className="spinner" /> : <CheckCircle2 size={16} />} Guardar abono
                                        </button>
                                        <button onClick={() => { setShowForm(false); setErr(null); }} style={outlineBtn}><X size={16} /> Cancelar</button>
                                    </div>
                                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Saldo disponible: {fmt(finance?.balance)}. No se permite sobrepago.</p>
                                </div>
                            )}
                        </div>
                    )}
                    {err && !showForm && <div style={{ color: '#b91c1c', fontSize: 13, padding: '0 14px 12px' }}>{err}</div>}
                </>
            )}
        </div>
    );
}

const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', padding: 0 };
const input = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', flex: 1 };
const outlineBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
