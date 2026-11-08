import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Receipt } from 'lucide-react';
import CommissionCard from '../../components/dashboard/CommissionCard';
import { Chip, EmptyState, Panel, fmtMXN } from '../../components/ui';
import './Earnings.css';

const STATUS = {
  PENDING_PAYMENT: { label: 'Por cobrar', tone: 'neutral' },
  READY_TO_PAY: { label: 'Liberada', tone: 'warn' },
  PAID: { label: 'Pagada', tone: 'ok' },
  CANCELLED: { label: 'Cancelada', tone: 'red' },
};

/**
 * Mis ganancias: la misma comisión REAL del Inicio (GET /api/earnings/summary),
 * con el detalle orden por orden. Nada se calcula en la pantalla.
 */
export default function MechanicEarnings() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = ['week', 'month', 'all'].includes(params.get('period')) ? params.get('period') : 'month';
  const [data, setData] = useState(null);
  const items = data?.items || [];

  return (
    <div className="ge k-rise">
      <header className="k-pagehead">
        <div>
          <h1>Mis ganancias</h1>
          <p>Tu comisión sobre la mano de obra de cada orden. Se libera cuando el cliente liquida todo.</p>
        </div>
      </header>

      <div className="ge-grid">
        <div className="ge-card"><CommissionCard title="Comisión del periodo" initialPeriod={initial} compact onLoaded={setData} /></div>

        <Panel title="Detalle por orden" hint={data ? `${items.length} ${items.length === 1 ? 'orden' : 'órdenes'}` : ''} icon={<Receipt />} padded={items.length === 0}>
          {items.length === 0 ? (
            <EmptyState icon={<Receipt size={26} />} title="Sin comisiones en este periodo" message="Cuando cierres órdenes con mano de obra, aparecerán aquí." />
          ) : (
            <div className="ge-table" role="table" aria-label="Detalle de comisiones">
              <div className="ge-row ge-row--head" role="row">
                <span>Orden</span><span>Fecha</span><span className="r">Mano de obra</span><span className="r">%</span><span className="r">Comisión</span><span>Estado</span><span />
              </div>
              {items.map((it) => {
                const st = STATUS[it.commission_status] || { label: it.commission_status || '', tone: 'neutral' };
                return (
                  <button key={it.order_id + String(it.date)} type="button" className="ge-row" role="row" onClick={() => navigate(`/mechanic/order/${it.order_id}`)}>
                    <span className="mono ge-folio">{it.order_number}</span>
                    <span className="ge-date">{it.date ? new Date(it.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : ''}</span>
                    <span className="r tnum">{fmtMXN(it.labor_amount)}</span>
                    <span className="r tnum">{Number(it.commission_rate)}%</span>
                    <span className="r tnum ge-earned">{fmtMXN(it.earned_amount)}</span>
                    <span><Chip tone={st.tone}>{st.label}</Chip></span>
                    <ChevronRight size={16} className="ge-go" />
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
