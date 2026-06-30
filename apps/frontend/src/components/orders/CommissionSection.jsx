import { useState, useEffect, useCallback } from 'react';
import { Percent, Loader2, Save, CheckCircle2 } from 'lucide-react';
import { earningsService } from '../../lib/api';
import { SectionCard, Button, Input } from '../ui';

// ELIHU L: comisión variable por trabajo, sobre MANO DE OBRA.
// Solo maestro/dueño (canManage). Se libera (READY_TO_PAY) al liquidar todo.

const fmt = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);

const STATUS_LABEL = {
    PENDING_PAYMENT: { t: 'Pendiente (cliente no ha liquidado)', tone: 'warning' },
    READY_TO_PAY: { t: 'Lista para pagar', tone: 'success' },
    PAID: { t: 'Pagada', tone: 'brand' },
    CANCELLED: { t: 'Cancelada', tone: 'danger' },
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

    const st = earning ? (STATUS_LABEL[earning.commission_status] || STATUS_LABEL.PENDING_PAYMENT) : null;

    if (!canManage) return null; // comisión solo visible para maestro/dueño

    return (
        <SectionCard title="Comisión" subtitle="Sobre mano de obra" icon={<Percent size={18} />} className="odcom">
            {loading ? (
                <div className="odcom__loading"><Loader2 size={18} className="spinner" /></div>
            ) : (
                <>
                    <div className="odcom__row"><span>Base (mano de obra)</span><strong>{fmt(labor)}</strong></div>
                    <div className="odcom__rate">
                        <span className="odcom__rate-lbl">Porcentaje</span>
                        <Input type="number" min="0" max="100" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="%" className="odcom__rate-input" />
                        <span className="odcom__pct">%</span>
                        <Button size="sm" loading={saving} leftIcon={!saving ? <Save size={15} /> : null} onClick={handleSave} className="odcom__save">Guardar</Button>
                    </div>
                    <div className="odcom__row"><span>Comisión calculada</span><strong>{fmt(earning ? earning.commission_amount : previewAmount)}</strong></div>
                    {st && (
                        <div className="odcom__status">
                            <span className={`mp-badge mp-badge--${st.tone}`}>
                                {earning.commission_status === 'READY_TO_PAY' && <CheckCircle2 size={13} />}{st.t}
                            </span>
                        </div>
                    )}
                    {err && <div className="odcom__err">{err}</div>}
                    <p className="odcom__hint">La comisión se libera solo cuando el cliente liquida todo el saldo.</p>
                </>
            )}

            <style>{`
                .odcom__loading { padding: 16px; text-align: center; color: var(--text-secondary); }
                .odcom__row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 14px; color: var(--color-ink); }
                .odcom__row span:first-child { color: var(--text-secondary); }
                .odcom__rate { display: flex; align-items: center; gap: 8px; padding: 10px 0; }
                .odcom__rate-lbl { color: var(--text-secondary); font-size: 14px; }
                .odcom__rate-input { width: 90px; }
                .odcom__pct { color: var(--text-secondary); }
                .odcom__save { margin-left: auto; }
                .odcom__status { padding: 6px 0; }
                .odcom__err { color: var(--danger); font-size: 13px; }
                .odcom__hint { font-size: 12px; color: var(--text-muted); margin: 6px 0 0; }
            `}</style>
        </SectionCard>
    );
}
