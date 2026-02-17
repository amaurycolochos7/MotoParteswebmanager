import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  ClipboardList,
  Plus,
  DollarSign,
  Clock,
  CheckCircle,
  Bike,
  ChevronRight,
  Wrench
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

export default function MechanicDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orders, loading } = useData();

  // Mis órdenes activas
  const myActiveOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o =>
      o.mechanic_id === user?.id && !o.status?.is_terminal
    );
  }, [orders, user]);

  // Estadísticas del mecánico - más útiles y claras
  const stats = useMemo(() => {
    if (!orders || !user) {
      return { weekEarnings: 0, monthEarnings: 0, monthOrders: 0, pendingOrders: 0 };
    }

    const now = new Date();
    const commissionRate = (user.commission_percentage || 10) / 100;

    // Inicio de la semana (lunes)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);

    // Inicio del mes
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Mis órdenes completadas (pagadas)
    const myPaidOrders = orders.filter(o =>
      o.mechanic_id === user.id && o.is_paid
    );

    // Ganancias de la semana
    const weekOrders = myPaidOrders.filter(o =>
      new Date(o.paid_at || o.created_at) >= weekStart
    );
    const weekLabor = weekOrders.reduce((sum, o) => sum + (parseFloat(o.labor_total) || 0), 0);
    const weekEarnings = weekLabor * commissionRate;

    // Ganancias del mes
    const monthOrdersPaid = myPaidOrders.filter(o =>
      new Date(o.paid_at || o.created_at) >= monthStart
    );
    const monthLabor = monthOrdersPaid.reduce((sum, o) => sum + (parseFloat(o.labor_total) || 0), 0);
    const monthEarnings = monthLabor * commissionRate;

    return {
      weekEarnings,
      monthEarnings,
      monthOrders: monthOrdersPaid.length,
      pendingOrders: myActiveOrders.length
    };
  }, [orders, user, myActiveOrders]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
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

  if (loading) {
    return (
      <div className="mechanic-dashboard fade-in">
        {/* Skeleton header */}
        <div className="dashboard-header">
          <div className="greeting">
            <div className="skeleton skeleton-circle" style={{ width: 48, height: 48 }}></div>
            <div style={{ flex: 1 }}>
              <div className="skeleton skeleton-text" style={{ width: '60%', height: 24 }}></div>
              <div className="skeleton skeleton-text-sm" style={{ width: '80%', marginTop: 8 }}></div>
            </div>
          </div>
        </div>

        {/* Skeleton button */}
        <div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 24 }}></div>

        {/* Skeleton stats */}
        <div className="stats-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }}></div>
          ))}
        </div>

        {/* Skeleton orders */}
        <div className="skeleton skeleton-text" style={{ width: '50%', height: 20, marginBottom: 16 }}></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 12 }}></div>
        ))}
      </div>
    );
  }

  return (
    <div className="mechanic-dashboard fade-in">
      {/* Header con saludo */}
      <div className="dashboard-header">
        <div className="greeting">
          <span className="greeting-emoji">👋</span>
          <div>
            <h1 className="greeting-name">Hola, {user?.full_name?.split(' ')[0]}</h1>
            <p className="greeting-subtitle">
              {myActiveOrders.length > 0
                ? `Tienes ${myActiveOrders.length} orden${myActiveOrders.length > 1 ? 'es' : ''} pendiente${myActiveOrders.length > 1 ? 's' : ''}`
                : 'No tienes órdenes pendientes'}
            </p>
          </div>
        </div>
      </div>

      {/* Botón Nueva Orden destacado */}
      <Link to="/mechanic/new-order" className="new-order-btn btn-new-order btn-shine">
        <Plus size={24} />
        <span>Nueva Orden de Servicio</span>
      </Link>

      {/* KPIs en grid - Métricas claras */}
      <div className="stats-grid">
        <div className="stat-card stat-pending" onClick={() => navigate('/mechanic/orders')}>
          <div className="stat-icon">
            <Clock size={22} />
          </div>
          <div className="stat-value">{stats.pendingOrders}</div>
          <div className="stat-label">Por Atender</div>
        </div>

        <div className="stat-card stat-month-orders" onClick={() => navigate('/mechanic/history?period=month')}>
          <div className="stat-icon">
            <CheckCircle size={22} />
          </div>
          <div className="stat-value">{stats.monthOrders}</div>
          <div className="stat-label">Completadas<br />este mes</div>
        </div>
      </div>

      {/* Resumen Semanal - Card destacada */}
      <div className="weekly-summary" onClick={() => navigate('/mechanic/earnings?period=week')}>
        <div className="weekly-header">
          <DollarSign size={20} />
          <span>Reporte Semanal</span>
        </div>
        <div className="weekly-amount">{formatCurrency(stats.weekEarnings)}</div>
        <div className="weekly-label">Ganancias esta semana</div>
      </div>

      {/* Órdenes Activas */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">
            <ClipboardList size={20} />
            Mis Órdenes Activas
          </h2>
          {myActiveOrders.length > 0 && (
            <Link to="/mechanic/orders" className="see-all">
              Ver todas <ChevronRight size={16} />
            </Link>
          )}
        </div>

        {myActiveOrders.length === 0 ? (
          <div className="empty-orders empty-state-animated">
            <div className="empty-icon">
              <Wrench size={32} className="wrench-animated" />
            </div>
            <h3>¡Todo listo!</h3>
            <p>No tienes órdenes activas en este momento</p>
            <div className="motivational">
              <span>💪 Crea una orden y comienza a ganar</span>
            </div>
            <Link to="/mechanic/new-order" className="btn btn-primary btn-gradient btn-shine" style={{ marginTop: '1rem' }}>
              <Plus size={18} />
              Crear Nueva Orden
            </Link>
          </div>
        ) : (
          <div className="orders-list">
            {myActiveOrders.slice(0, 5).map(order => (
              <div
                key={order.id}
                className="order-card"
                onClick={() => navigate(`/mechanic/order/${order.id}`)}
              >
                <div className="order-main">
                  <div className="order-number">#{order.order_number}</div>
                  <div className="order-client">{order.client?.full_name}</div>
                  <div className="order-moto">
                    <Bike size={14} />
                    {order.motorcycle?.brand} {order.motorcycle?.model}
                  </div>
                </div>
                <div className="order-side">
                  <span
                    className="order-status"
                    style={{
                      background: `${order.status?.color}20`,
                      color: order.status?.color
                    }}
                  >
                    {order.status?.name}
                  </span>
                  <div className="order-amount">{formatCurrency(order.total_amount)}</div>
                  <div className="order-time">{getTimeAgo(order.created_at)}</div>
                </div>
                <ChevronRight size={20} className="order-arrow" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accesos rápidos */}
      <div className="quick-links">
        <Link to="/mechanic/history" className="quick-link">
          <CheckCircle size={20} />
          Historial
        </Link>
        <Link to="/mechanic/earnings" className="quick-link">
          <DollarSign size={20} />
          Ganancias
        </Link>
        <Link to="/mechanic/clients" className="quick-link">
          <ClipboardList size={20} />
          Clientes
        </Link>
      </div>

      <style>{`
        .mechanic-dashboard {
          padding-bottom: 2rem;
        }

        /* Header */
        .dashboard-header {
          margin-bottom: 1.5rem;
        }

        .greeting {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .greeting-emoji {
          font-size: 2.5rem;
        }

        .greeting-name {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }

        .greeting-subtitle {
          font-size: 0.9375rem;
          color: var(--text-secondary);
          margin: 0.25rem 0 0 0;
        }

        /* Nueva Orden Button */
        .new-order-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          width: 100%;
          padding: 1rem;
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
          color: white;
          border-radius: var(--radius-lg);
          font-size: 1.125rem;
          font-weight: 600;
          text-decoration: none;
          margin-bottom: 1.5rem;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
          transition: all 0.2s;
        }

        .new-order-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
        }

        .new-order-btn:active {
          transform: scale(0.98);
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .stat-card {
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          padding: 1rem;
          cursor: pointer;
          transition: all 0.2s;
          border: 2px solid transparent;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .stat-card:active {
          transform: scale(0.98);
        }

        .stat-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.75rem;
        }

        .stat-pending .stat-icon {
          background: #fef3c7;
          color: #f59e0b;
        }

        .stat-month-orders .stat-icon {
          background: #d1fae5;
          color: #10b981;
        }

        .stat-week .stat-icon {
          background: #dbeafe;
          color: #3b82f6;
        }

        .stat-month .stat-icon {
          background: #e0e7ff;
          color: #6366f1;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1;
        }

        .stat-label {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
        }

        /* Weekly Summary Card */
        .weekly-summary {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
          margin-bottom: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
        }

        .weekly-summary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
        }

        .weekly-summary:active {
          transform: scale(0.98);
        }

        .weekly-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(255, 255, 255, 0.9);
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .weekly-amount {
          font-size: 2rem;
          font-weight: 700;
          color: white;
          line-height: 1;
        }

        .weekly-label {
          font-size: 0.8125rem;
          color: rgba(255, 255, 255, 0.8);
          margin-top: 0.25rem;
        }

        /* Section */
        .section {
          margin-bottom: 1.5rem;
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
          margin: 0;
        }

        .see-all {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          color: var(--primary);
          font-size: 0.875rem;
          font-weight: 600;
          text-decoration: none;
        }

        /* Empty State */
        .empty-orders {
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          padding: 2rem;
          text-align: center;
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .empty-title {
          font-size: 1.125rem;
          font-weight: 600;
          margin: 0 0 0.5rem 0;
        }

        .empty-text {
          color: var(--text-secondary);
          font-size: 0.9375rem;
          margin: 0 0 1rem 0;
        }

        /* Orders List */
        .orders-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .order-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          padding: 1rem;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid var(--border-light);
        }

        .order-card:hover {
          background: var(--bg-hover);
          border-color: var(--primary-light);
        }

        .order-card:active {
          transform: scale(0.99);
        }

        .order-main {
          flex: 1;
          min-width: 0;
        }

        .order-number {
          font-weight: 700;
          color: var(--primary);
          font-size: 0.9375rem;
        }

        .order-client {
          font-weight: 600;
          font-size: 0.9375rem;
          margin: 0.25rem 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .order-moto {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .order-side {
          text-align: right;
        }

        .order-status {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .order-amount {
          font-weight: 700;
          color: var(--success);
          font-size: 0.9375rem;
        }

        .order-time {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .order-arrow {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        /* Quick Links */
        .quick-links {
          display: flex;
          gap: 0.75rem;
        }

        .quick-link {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 0.5rem;
          background: var(--bg-card);
          border-radius: var(--radius-lg);
          text-decoration: none;
          color: var(--text-secondary);
          font-size: 0.8125rem;
          font-weight: 600;
          transition: all 0.2s;
          border: 1px solid var(--border-light);
        }

        .quick-link:hover {
          background: var(--bg-hover);
          color: var(--primary);
        }

        .quick-link:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}
