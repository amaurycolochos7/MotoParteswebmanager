import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bike,
  Wrench,
  DollarSign,
  TrendingUp,
  Users,
  ChevronRight,
  LogOut,
  Bell,
  MessageCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  X,
  Calendar,
  Settings
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

const TIME_FILTERS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { orders, clients, motorcycles, statuses } = useData();
  const [timeFilter, setTimeFilter] = useState('today');
  const [showMechanicModal, setShowMechanicModal] = useState(false);
  const [selectedMechanic, setSelectedMechanic] = useState(null);
  const [showAllOrdersModal, setShowAllOrdersModal] = useState(false);

  // Filter orders by time
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    return orders.filter(order => {
      const orderDate = new Date(order.created_at);
      switch (timeFilter) {
        case 'today':
          return orderDate >= today;
        case 'week':
          return orderDate >= weekAgo;
        case 'month':
          return orderDate >= monthAgo;
        default:
          return true;
      }
    });
  }, [orders, timeFilter]);

  // Calculate detailed stats
  const stats = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const delivered = filteredOrders.filter(o => o.status === 'Entregada').length;
    const inService = filteredOrders.filter(o => o.status !== 'Entregada').length;
    const totalRevenue = filteredOrders
      .filter(o => o.is_paid)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    // By status
    const byStatus = {};
    statuses.forEach(status => {
      byStatus[status.name] = filteredOrders.filter(o => o.status === status.name).length;
    });

    return {
      totalOrders,
      delivered,
      inService,
      totalRevenue,
      byStatus
    };
  }, [filteredOrders, statuses]);

  // Mechanic detailed stats
  const mechanicStats = useMemo(() => {
    const mechanics = {};

    filteredOrders.forEach(order => {
      const id = order.mechanic_id;
      if (!mechanics[id]) {
        mechanics[id] = {
          id,
          name: order.mechanic_name || 'Sin asignar',
          totalOrders: 0,
          inProgress: 0,
          completed: 0,
          revenue: 0,
          orders: []
        };
      }
      mechanics[id].totalOrders++;
      mechanics[id].orders.push(order);

      if (order.status === 'Entregada') {
        mechanics[id].completed++;
      } else {
        mechanics[id].inProgress++;
      }

      if (order.is_paid) {
        mechanics[id].revenue += order.total_amount || 0;
      }
    });

    return Object.values(mechanics).sort((a, b) => b.revenue - a.revenue);
  }, [filteredOrders]);

  const handleMechanicClick = (mechanic) => {
    setSelectedMechanic(mechanic);
    setShowMechanicModal(true);
  };

  const handleOrderClick = (orderId) => {
    navigate(`/mechanic/order/${orderId}`);
    setShowMechanicModal(false);
  };

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="greeting">Panel de Administración</h1>
          <p className="date">
            {new Date().toLocaleDateString('es-MX', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={logout} title="Cerrar sesión">
          <LogOut size={20} />
        </button>
      </div>

      {/* Time Filter */}
      <div className="filter-tabs">
        {TIME_FILTERS.map(filter => (
          <button
            key={filter.id}
            className={`filter-tab ${timeFilter === filter.id ? 'active' : ''}`}
            onClick={() => setTimeFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div
          className="kpi-card clickable"
          onClick={() => navigate('/mechanic/orders')}
        >
          <div className="kpi-icon kpi-icon-primary">
            <Bike size={22} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.totalOrders}</div>
            <div className="kpi-label">Motos Ingresadas</div>
          </div>
          <ChevronRight className="kpi-arrow" size={18} />
        </div>

        <div className="kpi-card">
          <div className="kpi-icon kpi-icon-warning">
            <Clock size={22} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.inService}</div>
            <div className="kpi-label">En Servicio</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon kpi-icon-success">
            <CheckCircle size={22} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.delivered}</div>
            <div className="kpi-label">Entregadas</div>
          </div>
        </div>

        <div className="kpi-card kpi-card-highlight">
          <div className="kpi-icon kpi-icon-primary">
            <DollarSign size={22} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value">${stats.totalRevenue.toLocaleString('es-MX')}</div>
            <div className="kpi-label">Ingresos</div>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="section">
        <h2 className="section-title">
          <TrendingUp size={18} />
          Estado de Órdenes
        </h2>
        <div className="status-grid">
          {statuses.map(status => {
            const count = stats.byStatus[status.name] || 0;
            if (count === 0) return null;

            return (
              <div key={status.id} className="status-card card">
                <div
                  className="status-indicator"
                  style={{ background: status.color }}
                />
                <div className="status-info">
                  <div className="status-count">{count}</div>
                  <div className="status-name">{status.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mechanic Rankings */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">
            <Users size={18} />
            Rendimiento por Mecánico
          </h2>
        </div>

        {mechanicStats.length === 0 ? (
          <div className="card text-center text-secondary">
            No hay datos para mostrar
          </div>
        ) : (
          <div className="mechanic-list">
            {mechanicStats.map((mechanic, index) => (
              <div
                key={mechanic.id}
                className="mechanic-card card clickable"
                onClick={() => handleMechanicClick(mechanic)}
              >
                <div className="mechanic-rank">#{index + 1}</div>
                <div className="mechanic-info">
                  <strong>{mechanic.name}</strong>
                  <div className="mechanic-stats">
                    <span>{mechanic.totalOrders} órdenes</span>
                    <span>•</span>
                    <span className="text-warning">{mechanic.inProgress} en proceso</span>
                    <span>•</span>
                    <span className="text-success">{mechanic.completed} completadas</span>
                  </div>
                </div>
                <div className="mechanic-revenue text-primary">
                  ${mechanic.revenue.toLocaleString('es-MX')}
                </div>
                <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="section">
        <h2 className="section-title">
          <Bike size={18} />
          Base de Datos
        </h2>

        <div className="stats-grid grid grid-3">
          <div className="stat-card card">
            <span className="stat-value text-primary">{clients.length}</span>
            <span className="stat-label">Clientes</span>
          </div>
          <div className="stat-card card">
            <span className="stat-value text-primary">{motorcycles.length}</span>
            <span className="stat-label">Motos</span>
          </div>
          <div className="stat-card card">
            <span className="stat-value text-primary">{orders.length}</span>
            <span className="stat-label">Órdenes Total</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section">
        <h2 className="section-title mb-md">Acciones Rápidas</h2>
        <div className="quick-actions">
          <button
            className="action-card card"
            onClick={() => setShowAllOrdersModal(true)}
          >
            <Bike size={22} className="text-primary" />
            <span>Ver Todas las Órdenes</span>
            <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </button>
          <button
            className="action-card card"
            onClick={() => navigate('/admin/settings')}
          >
            <Settings size={22} className="text-primary" />
            <span>Configuración</span>
            <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </button>
          <button
            className="action-card card"
            onClick={() => navigate('/admin/whatsapp')}
          >
            <MessageCircle size={22} className="text-primary" />
            <span>Vincular WhatsApp</span>
            <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </button>
          <button
            className="action-card card"
            onClick={() => navigate('/mechanic')}
          >
            <Wrench size={22} className="text-primary" />
            <span>Modo Mecánico</span>
            <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </button>
          <button
            className="action-card card"
            onClick={() => navigate('/mechanic/new-order')}
          >
            <Bike size={22} className="text-primary" />
            <span>Nueva Orden</span>
            <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </button>
          <button
            className="action-card card"
            onClick={() => navigate('/admin/reminders')}
          >
            <Bell size={22} className="text-primary" />
            <span>Recordatorios de Mantenimiento</span>
            <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </button>
          <button
            className="action-card card"
            onClick={() => navigate('/admin/mechanics')}
          >
            <Users size={22} className="text-primary" />
            <span>Gestión de Mecánicos</span>
            <ChevronRight size={18} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Mechanic Modal */}
      {showMechanicModal && selectedMechanic && (
        <div className="modal-overlay" onClick={() => setShowMechanicModal(false)}>
          <div className="modal mechanic-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{selectedMechanic.name}</h3>
              <button className="modal-close" onClick={() => setShowMechanicModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="mechanic-summary">
                <div className="summary-stat">
                  <span className="summary-value text-primary">{selectedMechanic.totalOrders}</span>
                  <span className="summary-label">Total</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-value text-warning">{selectedMechanic.inProgress}</span>
                  <span className="summary-label">En Proceso</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-value text-success">{selectedMechanic.completed}</span>
                  <span className="summary-label">Completadas</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-value text-primary">${selectedMechanic.revenue.toLocaleString('es-MX')}</span>
                  <span className="summary-label">Ingresos</span>
                </div>
              </div>

              <h4 className="orders-title">Órdenes Activas</h4>
              <div className="orders-list">
                {selectedMechanic.orders
                  .filter(o => o.status !== 'Entregada')
                  .map(order => {
                    const client = clients.find(c => c.id === order.client_id);
                    const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);
                    const status = statuses.find(s => s.name === order.status);

                    return (
                      <div
                        key={order.id}
                        className="order-item clickable"
                        onClick={() => handleOrderClick(order.id)}
                      >
                        <div className="order-info">
                          <div className="order-number">{order.order_number}</div>
                          <div className="order-details">
                            {client?.full_name} • {motorcycle?.brand} {motorcycle?.model}
                          </div>
                        </div>
                        <div
                          className="order-status"
                          style={{
                            background: `${status?.color}20`,
                            color: status?.color
                          }}
                        >
                          {order.status}
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    );
                  })}
                {selectedMechanic.orders.filter(o => o.status !== 'Entregada').length === 0 && (
                  <div className="text-center text-secondary">
                    No hay órdenes activas
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Orders Modal */}
      {showAllOrdersModal && (
        <div className="modal-overlay" onClick={() => setShowAllOrdersModal(false)}>
          <div className="modal modal-large modal-orders" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <Bike size={20} />
                Todas las Órdenes ({filteredOrders.length})
              </h3>
              <button className="modal-close" onClick={() => setShowAllOrdersModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {filteredOrders.length === 0 ? (
                <div className="empty-state">
                  <Bike size={48} style={{ opacity: 0.3 }} />
                  <p>No hay órdenes para mostrar</p>
                </div>
              ) : (
                <div className="all-orders-list">
                  {filteredOrders.map(order => {
                    const client = clients.find(c => c.id === order.client_id);
                    const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);
                    const status = statuses.find(s => s.name === order.status);

                    return (
                      <div
                        key={order.id}
                        className="order-detail-card clickable"
                        onClick={() => {
                          navigate(`/mechanic/order/${order.id}`);
                          setShowAllOrdersModal(false);
                        }}
                      >
                        {/* Header */}
                        <div className="order-detail-header">
                          <div className="order-detail-number">{order.order_number}</div>
                          <div className="order-detail-badges">
                            <div className="time-badge-small">
                              <Clock size={12} />
                              {new Date(order.created_at).toLocaleDateString('es-MX', {
                                day: 'numeric',
                                month: 'short'
                              })}
                            </div>
                            <div
                              className="status-badge-small"
                              style={{
                                background: `${status?.color}20`,
                                color: status?.color
                              }}
                            >
                              <CheckCircle size={12} />
                              {order.status}
                            </div>
                          </div>
                        </div>

                        {/* Mechanic Card */}
                        <div className="mechanic-card-highlight">
                          <div className="mechanic-icon-small">
                            <Wrench size={18} />
                          </div>
                          <div>
                            <div className="mechanic-label-small">MECÁNICO ASIGNADO</div>
                            <div className="mechanic-name-highlight">{order.mechanic_name || 'Sin asignar'}</div>
                          </div>
                        </div>

                        {/* Client & Moto Grid */}
                        <div className="info-grid-small">
                          <div className="info-item-small">
                            <div className="info-label-small">CLIENTE</div>
                            <div className="info-value-small">{client?.full_name || 'Desconocido'}</div>
                          </div>
                          <div className="info-item-small">
                            <div className="info-label-small">MOTOCICLETA</div>
                            <div className="info-value-small">{motorcycle?.brand} {motorcycle?.model}</div>
                          </div>
                        </div>

                        {/* Services */}
                        {order.services && order.services.length > 0 && (
                          <div className="services-compact">
                            <div className="services-header-small">
                              <Wrench size={14} />
                              <span>SERVICIOS REALIZADOS ({order.services.length})</span>
                            </div>
                            <div className="services-items-small">
                              {order.services.slice(0, 3).map((service, idx) => (
                                <div key={idx} className="service-row-small">
                                  <span className="service-bullet">•</span>
                                  <span className="service-name-small">{service.description}</span>
                                  <span className="service-price-small">${service.price?.toLocaleString('es-MX')}</span>
                                </div>
                              ))}
                              {order.services.length > 3 && (
                                <div className="service-more">
                                  +{order.services.length - 3} más
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Footer with total */}
                        <div className="order-detail-footer">
                          <div className="order-detail-date">
                            <Calendar size={14} />
                            {new Date(order.created_at).toLocaleDateString('es-MX', {
                              day: '2-digit',
                              month: 'long',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                          <div className="order-detail-amount">
                            <DollarSign size={16} />
                            ${(order.total_amount || 0).toLocaleString('es-MX')}
                          </div>
                        </div>

                        <ChevronRight className="order-detail-arrow" size={20} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admin-dashboard {
          padding-bottom: 80px;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--spacing-lg);
        }

        .greeting {
          font-size: 1.375rem;
          font-weight: 700;
          margin-bottom: 2px;
        }

        .date {
          color: var(--text-secondary);
          font-size: 0.8125rem;
          text-transform: capitalize;
        }

        .filter-tabs {
          display: flex;
          gap: var(--spacing-xs);
          margin-bottom: var(--spacing-lg);
          background: var(--bg-card);
          padding: 4px;
          border-radius: var(--radius-md);
        }

        .filter-tab {
          flex: 1;
          padding: var(--spacing-sm) var(--spacing-md);
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.875rem;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .filter-tab.active {
          background: var(--primary);
          color: white;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-lg);
        }

        .kpi-card {
          position: relative;
        }

        .kpi-card.clickable {
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .kpi-card.clickable:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
          border-color: var(--primary);
        }

        .kpi-arrow {
          position: absolute;
          top: var(--spacing-sm);
          right: var(--spacing-sm);
          color: var(--text-muted);
        }

        .kpi-card-highlight {
          grid-column: span 2;
          background: linear-gradient(135deg, var(--bg-card) 0%, var(--primary-light) 100%);
          border-color: var(--primary);
        }

        .section {
          margin-bottom: var(--spacing-lg);
        }

        .section-header {
          margin-bottom: var(--spacing-md);
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: var(--spacing-md);
        }

        .status-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-sm);
        }

        .status-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
        }

        .status-indicator {
          width: 4px;
          height: 40px;
          border-radius: 2px;
        }

        .status-count {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .status-name {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .mechanic-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .mechanic-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .mechanic-card:hover {
          border-color: var(--primary);
          transform: translateX(4px);
        }

        .mechanic-rank {
          width: 32px;
          height: 32px;
          background: var(--primary-light);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.875rem;
          color: var(--primary);
          flex-shrink: 0;
        }

        .mechanic-info {
          flex: 1;
          min-width: 0;
        }

        .mechanic-stats {
          display: flex;
          gap: var(--spacing-xs);
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 2px;
          flex-wrap: wrap;
        }

        .mechanic-revenue {
          font-weight: 700;
          font-size: 1rem;
          flex-shrink: 0;
        }

        .stat-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--spacing-lg) var(--spacing-md);
          text-align: center;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          line-height: 1;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: var(--spacing-xs);
        }

        .quick-actions {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .action-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          text-decoration: none;
          color: inherit;
          transition: all var(--transition-fast);
          border: none;
          background: var(--bg-card);
          cursor: pointer;
          width: 100%;
          text-align: left;
        }

        .action-card:hover {
          border-color: var(--primary);
          transform: translateX(4px);
        }

        .action-card span {
          font-weight: 500;
        }

        .mechanic-modal {
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .mechanic-summary {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-xl);
        }

        .summary-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--spacing-md);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
        }

        .summary-value {
          font-size: 1.5rem;
          font-weight: 700;
        }

        .summary-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: var(--spacing-xs);
        }

        .orders-title {
          font-size: 0.875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary);
          margin-bottom: var(--spacing-md);
        }

        .orders-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
          max-height: 400px;
          overflow-y: auto;
        }

        .order-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .order-item:hover {
          background: var(--bg-hover);
          transform: translateX(4px);
        }

        .order-info {
          flex: 1;
          min-width: 0;
        }

        .order-number {
          font-weight: 600;
          color: var(--primary);
          font-size: 0.875rem;
        }

        .order-details {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .order-status {
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .modal-orders {
          max-width: 700px;
        }

        .all-orders-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
          max-height: 70vh;
          overflow-y: auto;
        }

        .order-detail-card {
          position: relative;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: var(--spacing-md);
          transition: all var(--transition-fast);
          cursor: pointer;
        }

        .order-detail-card:hover {
          border-color: var(--primary);
          transform: translateX(4px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
        }

        .order-detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-md);
        }

        .order-detail-number {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--primary);
        }

        .order-detail-badges {
          display: flex;
          gap: var(--spacing-xs);
        }

        .time-badge-small {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          font-size: 0.6875rem;
          color: var(--text-muted);
        }

        .status-badge-small {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .mechanic-card-highlight {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-sm);
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-md);
        }

        .mechanic-icon-small {
          width: 36px;
          height: 36px;
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }

        .mechanic-label-small {
          font-size: 0.625rem;
          color: rgba(255, 255, 255, 0.8);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }

        .mechanic-name-highlight {
          font-size: 1rem;
          font-weight: 700;
          color: white;
          line-height: 1.2;
        }

        .info-grid-small {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-md);
        }

        .info-item-small {
          padding: var(--spacing-sm);
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
        }

        .info-label-small {
          font-size: 0.625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .info-value-small {
          font-size: 0.875rem;
          color: var(--text-primary);
          font-weight: 600;
        }

        .services-compact {
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: var(--spacing-sm);
          margin-bottom: var(--spacing-md);
        }

        .services-header-small {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          font-size: 0.625rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--spacing-sm);
          padding-bottom: var(--spacing-xs);
          border-bottom: 1px solid var(--border-color);
        }

        .services-items-small {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .service-row-small {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          font-size: 0.8125rem;
          background: var(--bg-card);
          padding: 6px 8px;
          border-radius: var(--radius-sm);
        }

        .service-bullet {
          color: var(--primary);
          font-weight: 700;
        }

        .service-name-small {
          flex: 1;
          color: var(--text-secondary);
        }

        .service-price-small {
          color: var(--text-primary);
          font-weight: 700;
        }

        .service-more {
          text-align: center;
          font-size: 0.75rem;
          color: var(--text-muted);
          padding: 4px;
        }

        .order-detail-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: var(--spacing-sm);
          border-top: 1px solid var(--border-color);
        }

        .order-detail-date {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .order-detail-amount {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--primary);
        }

        .order-detail-arrow {
          position: absolute;
          right: var(--spacing-md);
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
