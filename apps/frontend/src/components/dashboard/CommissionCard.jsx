import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { commissionService } from '../../lib/api';
import { Segmented, Skeleton, fmtMXN } from '../ui/kit';
import './CommissionCard.css';

const PERIODS = [
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'all', label: 'Todo' },
];

/**
 * Tarjeta de comisión REAL (no la mano de obra completa).
 * Datos: GET /api/earnings/summary -> total_comision y desglose por cobrar / liberada / pagada.
 */
export default function CommissionCard({ mechanicId = '', title = 'Tu comisión', detailTo = '/mechanic/earnings', compact = false, initialPeriod = 'week', onLoaded = null }) {
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | error

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await commissionService.summary({ mechanicId, period });
      setData(res);
      setState('ok');
      onLoaded?.(res, period);
    } catch {
      setState('error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mechanicId, period]);

  useEffect(() => { load(); }, [load]);

  const total = Number(data?.total_comision) || 0;
  // Vista simple: Pagada (ya cobrada) y Pendiente (liberada + por cobrar). El estado exacto por orden está en el detalle.
  const pagada = Number(data?.pagada) || 0;
  const pendiente = (Number(data?.liberada) || 0) + (Number(data?.por_cobrar) || 0);
  const parts = [
    { id: 'pagada', label: 'Pagada', hint: 'Ya te la entregaron', value: pagada, cls: 'is-paid' },
    { id: 'pendiente', label: 'Pendiente', hint: 'Aún no se te paga (incluye lo que falta que el cliente liquide)', value: pendiente, cls: 'is-pending' },
  ];
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;

  return (
    <section className={`cc${compact ? ' cc--compact' : ''}`}>
      <header className="cc__head">
        <div className="cc__ttl">
          <h3>{title}</h3>
        </div>
        <Segmented items={PERIODS} value={period} onChange={setPeriod} />
      </header>

      {state === 'loading' && !data && (
        <div className="cc__body"><Skeleton h={44} w="55%" r={6} /><Skeleton h={10} style={{ marginTop: 18 }} /><Skeleton h={36} style={{ marginTop: 16 }} /></div>
      )}

      {state === 'error' && (
        <div className="cc__body cc__err">
          <p>No pudimos cargar tu comisión.</p>
          <button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={load}><RefreshCw size={14} /> Reintentar</button>
        </div>
      )}

      {(state === 'ok' || (state === 'loading' && data)) && (
        <div className="cc__body">
          <div className="cc__total">
            <span className="cc__amount tnum">{fmtMXN(total)}</span>
            <span className="cc__rate">
              {data?.rate != null ? <>Tu porcentaje <b>{Number(data.rate)}%</b></> : null}
              {data?.orders_count != null ? <> · {data.orders_count} {data.orders_count === 1 ? 'orden' : 'órdenes'}</> : null}
            </span>
          </div>

          <div className="cc__bar" role="img" aria-label="Distribución de la comisión">
            {parts.map((p) => (p.value > 0 ? <span key={p.id} className={`cc__seg ${p.cls}`} style={{ flexGrow: p.value / sum }} /> : null))}
            {total === 0 && <span className="cc__seg is-empty" style={{ flexGrow: 1 }} />}
          </div>

          <ul className="cc__legend">
            {parts.map((p) => (
              <li key={p.id} title={p.hint}>
                <span className={`cc__dot ${p.cls}`} />
                <span className="cc__lbl">{p.label}</span>
                <span className="cc__val tnum">{fmtMXN(p.value)}</span>
              </li>
            ))}
          </ul>

          {!compact && (
            <Link className="cc__more" to={detailTo}>Ver detalle por orden <ArrowRight size={14} /></Link>
          )}
        </div>
      )}
    </section>
  );
}
