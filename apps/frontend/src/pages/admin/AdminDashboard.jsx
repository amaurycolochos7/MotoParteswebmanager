import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  ClipboardList,
  Users,
  DollarSign,
  Clock,
  ChevronDown,
  ChevronRight,
  Bike,
  AlertCircle,
  ArrowRight
} from 'lucide-react';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orders, clients, users, loading } = useData();
  const [expandedMechanic, setExpandedMechanic] = useState(null);
  const [orderFilter, setOrderFilter] = useState('today');

  // Calcular métricas reales
  const metrics = useMemo(() => {
    if (!orders || !clients) {
      return { todayOrders: 0, activeOrders: 0, monthRevenue: 0, totalClients: 0 };
    }

    const now = new Date();
    const today = now.toDateString();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Órdenes de hoy
    const todayOrders = orders.filter(o => {
      const orderDate = new Date(o.created_at);
      return orderDate.toDateString() === today;
    }).length;

    // Órdenes activas (no terminales)
    const activeOrders = orders.filter(o => !o.status?.is_terminal).length;

    // Ingresos del mes (solo pagadas)
    const monthRevenue = orders
      .filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate.getMonth() === currentMonth &&
          orderDate.getFullYear() === currentYear &&
          o.is_paid === true;
      })
      .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    // Total de clientes
    const totalClients = clients.length;

    return { todayOrders, activeOrders, monthRevenue, totalClients };
  }, [orders, clients]);

  // Mecánicos con sus órdenes activas
  const mechanicsWithOrders = useMemo(() => {
    if (!users || !orders) return [];

    const mechanics = users.filter(u => u.role === 'mechanic' || u.role === 'admin_mechanic');

    return mechanics.map(mechanic => {
      const activeOrders = orders.filter(o =>
        o.mechanic_id === mechanic.id && !o.status?.is_terminal
      );

      const urgentOrders = activeOrders.filter(o => {
        const daysSince = Math.floor(
          (Date.now() - new Date(o.created_at)) / (1000 * 60 * 60 * 24)
        );
        return daysSince > 3;
      });

      return {
        ...mechanic,
        active_orders: activeOrders,
        urgent_count: urgentOrders.length
      };
    }).filter(m => m.active_orders.length > 0);
  }, [users, orders]);

  // Filtrar órdenes para vista completa
  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    const now = new Date();
    const today = now.toDateString();

    return orders.filter(order => {
      if (orderFilter === 'today') {
        return new Date(order.created_at).toDateString() === today;
      }
      if (orderFilter === 'active') {
        return !order.status?.is_terminal;
      }
      if (orderFilter === 'urgent') {
        const daysSince = Math.floor(
          (Date.now() - new Date(order.created_at)) / (1000 * 60 * 60 * 24)
        );
        return !order.status?.is_terminal && daysSince > 3;
      }
      return true;
    });
  }, [orders, orderFilter]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const getTimeAgo = (date) => {
    const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
    if (seconds < 60) return 'Hace un momento';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `Hace ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days}d`;
  };

  const urgentCount = useMemo(() =>
    mechanicsWithOrders.reduce((sum, m) => sum + m.urgent_count, 0),
    [mechanicsWithOrders]
  );

  if (loading) {
    return (
      <div className="loading-overlay" style={{ position: 'relative', minHeight: 400 }}>
        <div className="spinner spinner-lg"></div>
        <p>Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Bienvenido, {user?.full_name}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => navigate('/admin/orders?filter=today')}>
          <div className="kpi-icon kpi-icon-primary">
            <ClipboardList size={24} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{metrics.todayOrders}</div>
            <div className="kpi-label">Órdenes Hoy</div>
          </div>
        </div>

        <div className="kpi-card" onClick={() => navigate('/admin/orders?filter=active')}>
          <div className="kpi-icon kpi-icon-warning">
            <Clock size={24} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{metrics.activeOrders}</div>
            <div className="kpi-label">Activas</div>
          </div>
        </div>

        <div className="kpi-card" onClick={() => navigate('/admin/analytics')}>
          <div className="kpi-icon kpi-icon-success">
            <DollarSign size={24} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{formatCurrency(metrics.monthRevenue)}</div>
            <div className="kpi-label">Ingresos Mes</div>
          </div>
        </div>

        <div className="kpi-card" onClick={() => navigate('/admin/clients')}>
          <div className="kpi-icon kpi-icon-secondary">
            <Users size={24} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{metrics.totalClients}</div>
            <div className="kpi-label">Clientes</div>
          </div>
        </div>
      </div>

      {/* Acciones Rápidas */}
      <div className="quick-actions">
        <button
          className="action-btn action-btn-primary"
          onClick={() => navigate('/admin/clients')}
        >
          <Users size={18} />
          Ver Clientes
        </button>

        {urgentCount > 0 && (
          <button
            className="action-btn action-btn-urgent"
            onClick={() => setOrderFilter('urgent')}
          >
            <AlertCircle size={18} />
            {urgentCount} Urgentes
          </button>
        )}
      </div>

      {/* Órdenes por Mecánico */}
      <div className="section">
        <h3 className="section-title">
          <ClipboardList size={20} />
          Órdenes por Mecánico
        </h3>

        {mechanicsWithOrders.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={40} className="empty-icon" />
            <p>No hay órdenes activas</p>
          </div>
        ) : (
          <div className="mechanics-list">
            {mechanicsWithOrders.map(mechanic => (
              <div key={mechanic.id} className="mechanic-card">
                <div
                  className="mechanic-header"
                  onClick={() => setExpandedMechanic(
                    expandedMechanic === mechanic.id ? null : mechanic.id
                  )}
                >
                  <div className="mechanic-info">
                    <div className="mechanic-avatar">
                      {mechanic.full_name?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="mechanic-name">{mechanic.full_name}</div>
                      <div className="mechanic-stats">
                        {mechanic.active_orders.length} {mechanic.active_orders.length === 1 ? 'orden' : 'órdenes'}
                      </div>
                    </div>
                  </div>
                  <div className="mechanic-badges">
                    {mechanic.urgent_count > 0 && (
                      <span className="badge badge-urgent">
                        {mechanic.urgent_count} urgente{mechanic.urgent_count > 1 ? 's' : ''}
                      </span>
                    )}
                    {expandedMechanic === mechanic.id ?
                      <ChevronDown size={20} /> :
                      <ChevronRight size={20} />
                    }
                  </div>
                </div>

                {expandedMechanic === mechanic.id && (
                  <div className="mechanic-orders">
                    {mechanic.active_orders.map(order => (
                      <div
                        key={order.id}
                        className="order-compact"
                        onClick={() => navigate(`/admin/order/${order.id}`)}
                      >
                        <div className="order-compact-header">
                          <span className="order-number">#{order.order_number}</span>
                          <span
                            className="order-status"
                            style={{
                              background: `${order.status?.color}20`,
                              color: order.status?.color
                            }}
                          >
                            {order.status?.name}
                          </span>
                        </div>
                        <div className="order-compact-client">
                          {order.client?.full_name}
                        </div>
                        <div className="order-compact-moto">
                          <Bike size={12} />
                          {order.motorcycle?.brand} {order.motorcycle?.model}
                        </div>
                        <div className="order-compact-footer">
                          <span className="order-amount">
                            {formatCurrency(order.total_amount)}
                          </span>
                          <span className="order-time">
                            {getTimeAgo(order.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vista Completa de Órdenes */}
      <div className="section">
        <div className="section-header">
          <h3 className="section-title">
            <ClipboardList size={20} />
            Todas las Órdenes
          </h3>
          <button
            className="btn-link"
            onClick={() => navigate('/admin/orders')}
          >
            Ver completo <ArrowRight size={16} />
          </button>
        </div>

        <div className="quick-filters">
          <button
            className={orderFilter === 'today' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setOrderFilter('today')}
          >
            Hoy
          </button>
          <button
            className={orderFilter === 'active' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setOrderFilter('active')}
          >
            Activas
          </button>
          <button
            className={orderFilter === 'urgent' ? 'filter-btn active' : 'filter-btn'}
            onClick={() => setOrderFilter('urgent')}
          >
            Urgentes
          </button>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <ClipboardList size={40} className="empty-icon" />
            <p>No hay órdenes</p>
          </div>
        ) : (
          <div className="orders-compact-list">
            {filteredOrders.slice(0, 10).map(order => (
              <div
                key={order.id}
                className="order-compact"
                onClick={() => navigate(`/admin/order/${order.id}`)}
              >
                <div className="order-compact-header">
                  <span className="order-number">#{order.order_number}</span>
                  <span
                    className="order-status"
                    style={{
                      background: `${order.status?.color}20`,
                      color: order.status?.color
                    }}
                  >
                    {order.status?.name}
                  </span>
                </div>
                <div className="order-compact-client">
                  {order.client?.full_name}
                </div>
                <div className="order-compact-moto">
                  <Bike size={12} />
                  {order.motorcycle?.brand} {order.motorcycle?.model}
                </div>
                <div className="order-compact-footer">
                  <span className="order-amount">
                    {formatCurrency(order.total_amount)}
                  </span>
                  <span className="order-time">
                    {getTimeAgo(order.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        /* KPI Grid Mobile-First */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        @media (min-width: 768px) {
          .kpi-grid {
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
          }
        }

        .kpi-card {
          padding: 1rem;
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          border-color: var(--primary-light);
        }

        .kpi-card:active {
          transform: scale(0.98);
        }

        .kpi-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .kpi-icon-primary {
          background: var(--primary-light);
          color: var(--primary);
        }

        .kpi-icon-warning {
          background: #fef3c7;
          color: #f59e0b;
        }

        .kpi-icon-success {
          background: var(--success-light);
          color: var(--success);
        }

        .kpi-icon-secondary {
          background: #e0e7ff;
          color: #6366f1;
        }

        .kpi-value {
          font-size: 1.75rem;
          font-weight: 700;
          line-height: 1;
        }

        .kpi-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        /* Acciones Rápidas */
        .quick-actions {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
        }

        .action-btn {
          flex: 1;
          min-width: 140px;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-md);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:active {
          transform: scale(0.98);
        }

        .action-btn-primary {
          background: var(--primary);
          color: white;
        }

        .action-btn-primary:hover {
          background: var(--primary-dark);
        }

        .action-btn-secondary {
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .action-btn-urgent {
          background: var(--danger);
          color: white;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }

        /* Secciones */
        .section {
          margin-bottom: 2rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1.125rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .btn-link {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: none;
          border: none;
          color: var(--primary);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0.5rem;
        }

        /* Mecánicos */
        .mechanics-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .mechanic-card {
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-color);
          overflow: hidden;
        }

        .mechanic-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .mechanic-header:hover {
          background: var(--bg-hover);
        }

        .mechanic-header:active {
          background: var(--bg-selected);
        }

        .mechanic-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .mechanic-avatar {
          width: 40px;
          height: 40px;
          background: var(--primary);
          color: white;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .mechanic-name {
          font-weight: 600;
          font-size: 0.9375rem;
        }

        .mechanic-stats {
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .mechanic-badges {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .badge-urgent {
          background: var(--danger);
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .mechanic-orders {
          padding: 0.5rem;
          background: var(--bg-hover);
          border-top: 1px solid var(--border-light);
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          animation: slideDown 0.2s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Filtros */
        .quick-filters {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
        }

        .filter-btn {
          padding: 0.5rem 1rem;
          border-radius: var(--radius-full);
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          font-size: 0.875rem;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-btn.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .filter-btn:hover:not(.active) {
          background: var(--bg-hover);
        }

        /* Órdenes Compactas */
        .orders-compact-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .order-compact {
          background: var(--bg-card);
          padding: 0.75rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-light);
          cursor: pointer;
          transition: all 0.2s;
        }

        .order-compact:hover {
          background: var(--bg-hover);
border-color: var(--primary-light);
        }

        .order-compact:active {
          transform: scale(0.98);
        }

        .order-compact-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .order-number {
          font-weight: 700;
          color: var(--primary);
          font-size: 0.875rem;
        }

        .order-status {
          padding: 0.125rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .order-compact-client {
          font-weight: 600;
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }

        .order-compact-moto {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }

        .order-compact-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
        }

        .order-amount {
          font-weight: 700;
          color: var(--success);
        }

        .order-time {
          color: var(--text-muted);
        }

        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 2rem;
          color: var(--text-muted);
        }

        .empty-icon {
          opacity: 0.3;
          margin-bottom: 0.5rem;
        }
      `}</style>
    </div>
  );
}
