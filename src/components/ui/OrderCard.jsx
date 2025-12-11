import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ChevronRight } from 'lucide-react';
import { useData } from '../../context/DataContext';

export default function OrderCard({ order, statuses }) {
  const { clients, motorcycles } = useData();

  const client = useMemo(() =>
    clients.find(c => c.id === order.client_id),
    [clients, order.client_id]
  );

  const motorcycle = useMemo(() =>
    motorcycles.find(m => m.id === order.motorcycle_id),
    [motorcycles, order.motorcycle_id]
  );

  const currentStatus = statuses?.find(s => s.name === order.status);

  // Calculate time elapsed
  const timeElapsed = useMemo(() => {
    const created = new Date(order.created_at);
    const now = new Date();
    const diffMs = now - created;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return 'Ahora';
  }, [order.created_at]);

  return (
    <Link to={`/mechanic/order/${order.id}`} className="order-card">
      <div className="order-card-header">
        <span className="order-card-number">{order.order_number}</span>
        <span
          className="badge"
          style={{
            background: `${currentStatus?.color}20`,
            color: currentStatus?.color
          }}
        >
          {order.status}
        </span>
      </div>

      <div className="order-card-client">
        {client?.full_name || 'Cliente'}
      </div>

      <div className="order-card-moto">
        {motorcycle?.brand} {motorcycle?.model} • {motorcycle?.plates || 'Sin placas'}
      </div>

      <div className="order-card-footer">
        <div className="order-card-time">
          <Clock size={12} />
          {timeElapsed}
        </div>
        {order.total_amount > 0 && (
          <span className="order-card-amount">
            ${order.total_amount.toLocaleString('es-MX')}
          </span>
        )}
        <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
      </div>
    </Link>
  );
}
