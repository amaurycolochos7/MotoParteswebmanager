/* Al marcar una orden como "Entregada" con saldo pendiente: ¿el cliente ya pagó? Se registra el pago ahí mismo. */
import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import './DeliveryPaymentModal.css';

const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);
const METHODS = [{ id: 'efectivo', label: 'Efectivo' }, { id: 'transferencia', label: 'Transferencia' }, { id: 'tarjeta', label: 'Tarjeta' }];

const OPTIONS = [
  { id: 'full', title: 'Sí, pagó todo', sub: (b) => `Se registra el pago de ${fmt(b)}` },
  { id: 'partial', title: 'Pagó una parte', sub: () => 'Se registra un abono y el resto queda pendiente' },
  { id: 'none', title: 'Todavía no pagó', sub: () => 'Se entrega con el saldo pendiente' },
];

/**
 * `onConfirm({ mode, amount, method, reason })` devuelve una promesa; si resuelve con { error } se muestra aquí y el cuadro sigue abierto.
 * Quien entrega con saldo pendiente (parcial o sin pago) debe escribir el motivo: queda en el historial de la orden.
 */
export default function DeliveryPaymentModal({ orderNumber, total, paid, balance, onCancel, onConfirm }) {
  const [mode, setMode] = useState('full');
  const [method, setMethod] = useState('efectivo');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const amt = parseFloat(amount);
  const partialOk = Number.isFinite(amt) && amt > 0 && amt < balance;
  const needsReason = mode === 'partial' || mode === 'none';
  const valid = (mode === 'full') || (mode === 'partial' && partialOk && reason.trim()) || (mode === 'none' && reason.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setError('');
    const res = await onConfirm({ mode, amount: mode === 'full' ? balance : amt, method, reason: reason.trim() });
    setBusy(false);
    if (res?.error) setError(res.error);
  };

  return (
    <div className="od-modal-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div className="od-modal dpm" role="dialog" aria-modal="true" aria-labelledby="dpm-title" onClick={(e) => e.stopPropagation()}>
        <div className="od-modal__head">
          <h3 id="dpm-title">Entregar {orderNumber ? `orden ${orderNumber}` : 'orden'}</h3>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="od-modal__body">
          <div className="dpm__sum">
            <div><span>Total de la orden</span><b>{fmt(total)}</b></div>
            <div><span>Ya pagado</span><b>{fmt(paid)}</b></div>
            <div className="dpm__sum-bal"><span>Saldo pendiente</span><b>{fmt(balance)}</b></div>
          </div>

          <p className="dpm__q">¿El cliente ya pagó?</p>
          <div className="dpm__opts" role="radiogroup" aria-label="¿El cliente ya pagó?">
            {OPTIONS.map((o) => (
              <button key={o.id} type="button" role="radio" aria-checked={mode === o.id} className={`dpm__opt${mode === o.id ? ' is-on' : ''}`} onClick={() => { setMode(o.id); setError(''); }} disabled={busy}>
                <span className="dpm__radio" aria-hidden="true" />
                <span><b>{o.title}</b><small>{o.sub(balance)}</small></span>
              </button>
            ))}
          </div>

          {mode !== 'none' && (
            <div className="dpm__row">
              {mode === 'partial' && (
                <label>Monto que pagó
                  <input type="number" inputMode="decimal" min="0" step="0.01" placeholder={`Menos de ${fmt(balance)}`} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
                </label>
              )}
              <label>Forma de pago
                <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
                  {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
            </div>
          )}
          {mode === 'partial' && amount !== '' && !partialOk && <p className="dpm__err">El monto debe ser mayor a $0 y menor al saldo ({fmt(balance)}). Si pagó todo, elige "Sí, pagó todo".</p>}

          {needsReason && (
            <label className="dpm__reason">Motivo para entregar con saldo
              <textarea rows={2} placeholder="Ej. Paga el viernes, cliente de confianza…" value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
            </label>
          )}
          {error && <p className="dpm__err" role="alert">{error}</p>}
        </div>
        <div className="od-modal__foot">
          <button type="button" className="od-action-btn secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="od-action-btn" onClick={submit} disabled={!valid || busy}>
            {busy ? <Loader2 size={15} className="dpm__spin" /> : null} {mode === 'full' ? 'Cobrar y entregar' : mode === 'partial' ? 'Registrar abono y entregar' : 'Entregar con saldo'}
          </button>
        </div>
      </div>
    </div>
  );
}
