import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ChevronRight } from 'lucide-react';
export default function OrderCard({ order, statuses, baseUrl = '/mechanic/order' }) {
  // Usar datos poblados directamente del objeto order
  // Fallback seguro en caso de que order.client/motorcycle no existan
  const client = order.client || {};
  const motorcycle = order.motorcycle || {};

  // Manejar status si viene como objeto (JOIN) o string
  const statusName = order.status?.name || order.status;

  // Intentar obtener el objeto status completo para el color
  // Si order.status es objeto, usalo. Si es string, búscalo en props.statuses
  const statusObj = typeof order.status === 'object' ? order.status : statuses?.find(s => s.name === statusName);
  const statusColor = statusObj?.color || '#64748b'; // Fallback color

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
    <Link to={`${baseUrl}/${order.id}`} className="order-card">
      <div className="order-card-header">
        <span className="order-card-number">{order.order_number}</span>
        <span
          className="badge"
          style={{
            background: `${statusColor}20`,
            color: statusColor
          }}
        >
          {statusName}
        </span>
      </div>

      <div className="order-card-client">
        {client.full_name || 'Cliente sin nombre'}
      </div>

      <div className="order-card-moto">
        {motorcycle.brand ? `${motorcycle.brand} ${motorcycle.model}` : 'Moto no asignada'}
        {motorcycle.plates && ` • ${motorcycle.plates}`}
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
