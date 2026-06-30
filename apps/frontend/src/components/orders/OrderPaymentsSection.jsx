import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Plus, X, Loader2, Download, Ban, CheckCircle2 } from 'lucide-react';
import { orderPaymentsService } from '../../lib/api';
import { downloadPaymentReceiptPDF } from '../../utils/pdfGenerator';
import { SectionCard, Button, Input, Select } from '../ui';

// ELIHU: sección "Pagos y saldo" del detalle de orden.
// Varios abonos, saldo pendiente, estado de pago, recibo con folio.
// Solo el maestro/dueño (canManage) puede registrar/cancelar; el resto solo ve.

const fmt = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);

const METHOD_LABELS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro' };
const STATUS_TONE = { Pendiente: 'warning', Parcial: 'brand', Pagada: 'success' };

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

    const tone = finance ? (STATUS_TONE[finance.payment_status] || 'warning') : 'warning';
    const balancePositive = (finance?.balance || 0) > 0;

    return (
        <SectionCard title="Pagos y saldo" icon={<DollarSign size={18} />} className="odpay">
            {loading ? (
                <div className="odpay__loading"><Loader2 size={18} className="spinner" /></div>
            ) : (
                <>
                    <div className="odpay__summary">
                        <div className="odpay__row"><span>Total de la orden</span><strong>{fmt(finance?.total)}</strong></div>
                        <div className="odpay__row"><span>Total pagado</span><span className="odpay__paid">{fmt(finance?.paid)}</span></div>
                        <div className="odpay__row odpay__row--balance">
                            <span>Saldo pendiente</span>
                            <strong className={balancePositive ? 'odpay__bal-due' : 'odpay__bal-ok'}>{fmt(finance?.balance)}</strong>
                        </div>
                        <div className="odpay__status">
                            <span className={`mp-badge mp-badge--${tone}`}>{finance?.payment_status || 'Pendiente'}</span>
                            {finance?.overpaid > 0 && <span className="odpay__over">Sobrepago: {fmt(finance.overpaid)}</span>}
                        </div>
                    </div>

                    {activePayments.length === 0 ? (
                        <p className="odpay__empty">Sin abonos registrados.</p>
                    ) : (
                        <div className="odpay__list">
                            {payments.map((p) => (
                                <div key={p.id} className={`odpay__item${p.cancelled_at ? ' is-cancelled' : ''}`}>
                                    <div className="odpay__item-top">
                                        <strong>{fmt(p.amount)}</strong>
                                        <span className="odpay__method">{METHOD_LABELS[p.payment_method] || p.payment_method}</span>
                                    </div>
                                    <div className="odpay__item-meta">
                                        <span>{new Date(p.payment_date).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                        <span>{p.receipt_number}</span>
                                    </div>
                                    {p.note && <div className="odpay__note">{p.note}</div>}
                                    {p.cancelled_at && <div className="odpay__cancelled">Cancelado: {p.cancellation_reason}</div>}
                                    {!p.cancelled_at && (
                                        <div className="odpay__actions">
                                            <button onClick={() => handleReceipt(p)} className="odpay__link"><Download size={13} /> Recibo</button>
                                            {canManage && <button onClick={() => handleCancel(p)} className="odpay__link odpay__link--danger"><Ban size={13} /> Cancelar</button>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {canManage && (
                        <div className="odpay__register">
                            {!showForm ? (
                                <Button variant="success" block leftIcon={<Plus size={16} />} disabled={!balancePositive} onClick={() => setShowForm(true)}>
                                    Registrar abono
                                </Button>
                            ) : (
                                <div className="odpay__form">
                                    <Input type="number" min="0" step="0.01" placeholder="Monto del abono" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
                                    <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                                        <option value="efectivo">Efectivo</option>
                                        <option value="transferencia">Transferencia</option>
                                        <option value="tarjeta">Tarjeta</option>
                                        <option value="otro">Otro</option>
                                    </Select>
                                    <Input type="text" placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
                                    {err && <div className="odpay__err">{err}</div>}
                                    <div className="odpay__form-actions">
                                        <Button variant="success" block loading={saving} leftIcon={!saving ? <CheckCircle2 size={16} /> : null} onClick={handleRegister}>Guardar abono</Button>
                                        <Button variant="secondary" leftIcon={<X size={16} />} onClick={() => { setShowForm(false); setErr(null); }}>Cancelar</Button>
                                    </div>
                                    <p className="odpay__hint">Saldo disponible: {fmt(finance?.balance)}. No se permite sobrepago.</p>
                                </div>
                            )}
                        </div>
                    )}
                    {err && !showForm && <div className="odpay__err" style={{ marginTop: 8 }}>{err}</div>}
                </>
            )}

            <style>{`
                .odpay__loading { padding: 16px; text-align: center; color: var(--text-secondary); }
                .odpay__summary { display: flex; flex-direction: column; gap: 2px; }
                .odpay__row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 14px; color: var(--text-primary); }
                .odpay__row span:first-child { color: var(--text-secondary); }
                .odpay__paid { color: var(--success); font-weight: 600; }
                .odpay__row--balance { font-size: 17px; padding-top: 10px; margin-top: 4px; border-top: 1px solid var(--border-light); }
                .odpay__row--balance span:first-child { color: var(--text-primary); font-weight: 600; }
                .odpay__bal-due { color: var(--danger); }
                .odpay__bal-ok { color: var(--success); }
                .odpay__status { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
                .odpay__over { font-size: 12px; color: var(--warning-hover); }
                .odpay__empty { color: var(--text-muted); font-size: 13px; margin: 12px 0 0; }
                .odpay__list { margin-top: 14px; border-top: 1px solid var(--border-light); }
                .odpay__item { padding: 12px 0; border-bottom: 1px solid var(--border-light); }
                .odpay__item.is-cancelled { opacity: 0.5; }
                .odpay__item.is-cancelled strong { text-decoration: line-through; }
                .odpay__item-top { display: flex; justify-content: space-between; align-items: baseline; }
                .odpay__item-top strong { font-size: 16px; color: var(--color-ink); }
                .odpay__method { font-size: 12px; color: var(--text-secondary); }
                .odpay__item-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 3px; }
                .odpay__note { font-size: 12px; color: var(--text-secondary); margin-top: 3px; }
                .odpay__cancelled { font-size: 11px; color: var(--danger); margin-top: 3px; }
                .odpay__actions { display: flex; gap: 14px; margin-top: 8px; }
                .odpay__link { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: var(--brand-primary); font-size: 12px; font-weight: 500; cursor: pointer; padding: 0; font-family: var(--font-text); }
                .odpay__link--danger { color: var(--danger); }
                .odpay__register { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-light); }
                .odpay__form { display: flex; flex-direction: column; gap: 10px; }
                .odpay__form-actions { display: flex; gap: 10px; }
                .odpay__err { color: var(--danger); font-size: 13px; }
                .odpay__hint { font-size: 12px; color: var(--text-muted); margin: 0; }
            `}</style>
        </SectionCard>
    );
}
