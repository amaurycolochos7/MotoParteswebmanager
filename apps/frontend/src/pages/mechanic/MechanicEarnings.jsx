import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Receipt, BadgeCheck, Loader2 } from 'lucide-react';
import { earningsService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
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
  const { isManager } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [paying, setPaying] = useState(false);
  const items = data?.items || [];
  // Comisiones LIBERADAS (el cliente ya pagó la orden) que el dueño/administrador puede marcar como pagadas
  const ready = items.filter((it) => it.commission_status === 'READY_TO_PAY' && it.id);
  const readyTotal = ready.reduce((a, it) => a + Number(it.earned_amount || 0), 0);
  const markPaid = async () => {
    if (paying || !ready.length) return;
    if (!window.confirm(`¿Marcar ${ready.length} ${ready.length === 1 ? 'comisión' : 'comisiones'} liberadas (${fmtMXN(readyTotal)}) como pagadas?`)) return;
    setPaying(true);
    const { error } = await earningsService.markAsPaid(ready.map((it) => it.id));
    setPaying(false);
    if (error) { toast.error(error.message || 'No se pudieron marcar como pagadas'); return; }
    toast.success('Comisiones marcadas como pagadas');
    setReloadKey((k) => k + 1); // vuelve a cargar la tarjeta y el detalle
  };

  return (
    <div className="ge k-rise">
      <header className="k-pagehead">
        <div>
          <h1>Mis ganancias</h1>
          <p>Tu comisión sobre la mano de obra de cada orden. Se libera cuando el cliente liquida todo y queda pagada cuando la recibes.</p>
        </div>
      </header>

        {isManager && ready.length > 0 && (
          <div className="ge-pay" role="status">
            <div>
              <b>{fmtMXN(readyTotal)} liberados</b>
              <span>{ready.length} {ready.length === 1 ? 'orden ya cobrada' : 'órdenes ya cobradas'}, pendientes de entregar al mecánico</span>
            </div>
            <button type="button" className="k-btn k-btn--sm" onClick={markPaid} disabled={paying}>
              {paying ? <Loader2 size={15} className="ge-spin" /> : <BadgeCheck size={15} />} Marcar como pagadas
            </button>
          </div>
        )}

      <div className="ge-grid">
        <div className="ge-card"><CommissionCard key={reloadKey} title="Comisión del periodo" initialPeriod={initial} compact onLoaded={setData} /></div>

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
