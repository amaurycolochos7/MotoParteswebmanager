import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Store, Wrench } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { Panel, Stat, Chip, Avatar, fmtMXN } from '../ui/kit';
import './ShopSummary.css';

/**
 * Resumen del taller para dueño / administrador / maestro (debajo del Inicio, sin duplicar lo de arriba):
 * órdenes de hoy, activas, ingresos del mes, clientes y órdenes activas por mecánico.
 */
export default function ShopSummary() {
  const { isAdmin } = useAuth();
  const { orders, clients, users } = useData();

  const metrics = useMemo(() => {
    const now = new Date();
    const today = now.toDateString();
    const list = orders || [];
    const todayOrders = list.filter((o) => new Date(o.created_at).toDateString() === today).length;
    const activeOrders = list.filter((o) => !o.status?.is_terminal).length;
    const monthRevenue = list
      .filter((o) => {
        const d = new Date(o.paid_at || o.created_at);
        return o.is_paid === true && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    return { todayOrders, activeOrders, monthRevenue, totalClients: (clients || []).length };
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
    <section className="ss" aria-label="Resumen del taller">
      <header className="ss__head">
        <span className="ss__ico"><Store size={16} /></span>
        <h2>Resumen del taller</h2>
      </header>

      <div className="ss__grid">
        <Panel title="Este mes y hoy">
          <div className="ss__stats">
            <Stat label="Ingresos del mes" value={fmtMXN(metrics.monthRevenue)} tone="ok" hint="Órdenes pagadas" />
            <Stat label="Órdenes hoy" value={metrics.todayOrders} />
            <Stat label="Órdenes activas" value={metrics.activeOrders} />
            <Stat label="Clientes" value={metrics.totalClients} />
          </div>
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
