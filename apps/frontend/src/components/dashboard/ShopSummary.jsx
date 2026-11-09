import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Store, Wrench } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { Panel, Stat, Chip, Avatar, fmtMXN } from '../ui/kit';
import { monthRevenue as calcMonthRevenue } from '../../utils/shopRevenue';
import './ShopSummary.css';

/**
 * Resumen del taller para dueño / administrador / maestro (debajo del Inicio, sin duplicar lo de arriba):
 * órdenes de hoy, activas, ingresos del mes, clientes y órdenes activas por mecánico.
 */
export default function ShopSummary() {
  const { isAdmin, isManager } = useAuth();
  const { orders, clients, users } = useData();

  const metrics = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const list = orders || [];
    const todayOrders = list.filter((o) => new Date(o.created_at).toDateString() === today).length;
    const activeOrders = list.filter((o) => !o.status?.is_terminal).length;
    // Ingresos = SOLO mano de obra de las órdenes pagadas; las refacciones y el total cobrado se muestran aparte.
    const revenue = calcMonthRevenue(list, now);
    return { todayOrders, activeOrders, revenue, totalClients: (clients || []).length };
  }, [orders, clients]);

  const byMechanic = useMemo(() => {
    const list = orders || [];
    const people = (users || []).filter((u) => u.is_active !== false);
    return people
      .map((u) => {
        const active = list.filter((o) => o.mechanic_id === u.id && !o.status?.is_terminal);
        const urgent = active.filter((o) => (Date.now() - new Date(o.created_at)) / 86400000 > 3).length;
        return { id: u.id, name: u.full_name, active: active.length, urgent };
      })
      .filter((m) => m.active > 0)
      .sort((a, b) => b.active - a.active);
  }, [users, orders]);

  return (
    <section className="ss" aria-label={isManager ? 'Resumen del taller' : 'Mi resumen'}>
      <header className="ss__head">
        <span className="ss__ico"><Store size={16} /></span>
        <h2>{isManager ? 'Resumen del taller' : 'Mi resumen'}</h2>
      </header>

      <div className="ss__grid">
        <Panel title="Este mes y hoy">
          <div className="ss__stats">
            <Stat label="Ingresos del mes" value={fmtMXN(metrics.revenue.labor)} tone="ok" hint="Mano de obra de órdenes pagadas" />
            <Stat label="Órdenes hoy" value={metrics.todayOrders} />
            <Stat label="Órdenes activas" value={metrics.activeOrders} />
            <Stat label="Clientes" value={metrics.totalClients} />
          </div>
          <dl className="ss__split" aria-label="Desglose de lo cobrado en el mes">
            <div><dt>Refacciones</dt><dd>{fmtMXN(metrics.revenue.parts)}</dd></div>
            <div><dt>Total cobrado</dt><dd>{fmtMXN(metrics.revenue.total)}</dd></div>
            <p>Las refacciones son el dinero de las piezas, no ganancia. El total cobrado es mano de obra + refacciones.</p>
          </dl>
        </Panel>

        <Panel
          title="Órdenes activas por mecánico"
          icon={<Wrench />}
          action={isAdmin() ? <Link className="dx-more" to="/admin/orders">Ver órdenes <ArrowRight size={14} /></Link> : null}
          padded={false}
        >
          {byMechanic.length === 0 ? (
            <p className="ss__empty">Ningún mecánico tiene órdenes activas ahora.</p>
          ) : (
            <ul className="ss__list">
              {byMechanic.map((m) => (
                <li key={m.id} className="ss__row">
                  <Avatar name={m.name} size="sm" />
                  <span className="ss__name">{m.name}</span>
                  {m.urgent > 0 && <Chip tone="warn">{m.urgent} con más de 3 días</Chip>}
                  <span className="ss__n">{m.active}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}
