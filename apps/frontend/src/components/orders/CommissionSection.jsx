import { useState, useEffect, useCallback } from 'react';
import { Percent, Loader2, Save, CheckCircle2 } from 'lucide-react';
import { earningsService } from '../../lib/api';

// ELIHU L: comisión variable por trabajo, sobre MANO DE OBRA.
// Solo maestro/dueño (canManage). Se libera (READY_TO_PAY) al liquidar todo.
// `refreshKey` cambia cuando se registra/cancela un abono para re-leer estado.

const fmt = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);

const STATUS_LABEL = {
    PENDING_PAYMENT: { t: 'Pendiente (cliente no ha liquidado)', bg: '#fffbeb', fg: '#b45309' },
    READY_TO_PAY: { t: 'Lista para pagar', bg: '#f0fdf4', fg: '#15803d' },
    PAID: { t: 'Pagada', bg: '#fde7e8', fg: '#a90f16' },
    CANCELLED: { t: 'Cancelada', bg: '#fef2f2', fg: '#b91c1c' },
};

export default function CommissionSection({ orderId, canManage, refreshKey }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [rate, setRate] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        if (!orderId) return;
        setLoading(true);
        const { data: d } = await earningsService.getOrderCommission(orderId);
        if (d) {
            setData(d);
            const e = (d.earnings || [])[0];
            if (e && rate === '') setRate(String(e.commission_rate));
        }
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    useEffect(() => { load(); }, [load, refreshKey]);

    const earning = (data?.earnings || [])[0] || null;
    const labor = data?.labor_total || 0;
    const previewAmount = labor * (parseFloat(rate) || 0) / 100;

    const handleSave = async () => {
        setErr(null);
        const r = parseFloat(rate);
        if (!Number.isFinite(r) || r < 0 || r > 100) { setErr('El porcentaje debe estar entre 0 y 100.'); return; }
        setSaving(true);
        const { error } = await earningsService.setOrderCommission(orderId, r);
        setSaving(false);
        if (error) { setErr(error.message || 'No se pudo guardar la comisión'); return; }
        await load();
    };

    const box = { border: '1px solid #e8e8ed', borderRadius: 12, background: '#fff', margin: '12px 0', overflow: 'hidden' };
    const head = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid #f5f5f7', fontWeight: 700, color: '#111827' };
    const row = { display: 'flex', justifyContent: 'space-between', padding: '6px 14px', fontSize: 14 };
    const st = earning ? (STATUS_LABEL[earning.commission_status] || STATUS_LABEL.PENDING_PAYMENT) : null;

    if (!canManage) return null; // comisión solo visible para maestro/dueño

    return (
        <div style={box}>
            <div style={head}><Percent size={18} /> Comisión (sobre mano de obra)</div>
            {loading ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#6e6e73' }}><Loader2 size={18} className="spinner" /></div>
            ) : (
                <div style={{ padding: '8px 0 14px' }}>
                    <div style={row}><span style={{ color: '#6e6e73' }}>Base (mano de obra)</span><strong>{fmt(labor)}</strong></div>
                    <div style={{ padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: '#6e6e73', fontSize: 14 }}>Porcentaje</span>
                        <input type="number" min="0" max="100" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)}
                            style={{ width: 90, padding: '8px 10px', border: '1px solid #d2d2d7', borderRadius: 8, fontSize: 15 }} placeholder="%" />
                        <span style={{ color: '#6e6e73' }}>%</span>
                        <button onClick={handleSave} disabled={saving}
                            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                            {saving ? <Loader2 size={15} className="spinner" /> : <Save size={15} />} Guardar
                        </button>
                    </div>
                    <div style={row}><span style={{ color: '#6e6e73' }}>Comisión calculada</span><strong>{fmt(earning ? earning.commission_amount : previewAmount)}</strong></div>
                    {st && (
                        <div style={{ padding: '6px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: st.bg, color: st.fg }}>
                                {earning.commission_status === 'READY_TO_PAY' && <CheckCircle2 size={13} />}{st.t}
                            </span>
                        </div>
                    )}
                    {err && <div style={{ color: '#b91c1c', fontSize: 13, padding: '0 14px' }}>{err}</div>}
                    <p style={{ fontSize: 12, color: '#86868b', margin: '4px 14px 0' }}>
                        La comisión se libera solo cuando el cliente liquida todo el saldo.
                    </p>
                </div>
            )}
        </div>
    );
}
