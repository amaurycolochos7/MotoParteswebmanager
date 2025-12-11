import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bike,
  Wrench,
  DollarSign,
  Clock,
  ChevronRight,
  Plus,
  AlertCircle,
  TrendingUp,
  Calendar,
  CheckCircle,
  ListChecks,
  X,
  User,
  Phone
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import SpeedometerGauge from '../../components/ui/SpeedometerGauge';
import OrderCard from '../../components/ui/OrderCard';

export default function MechanicDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    getActiveOrders,
    getTodayStats,
    getMechanicOrders,
    getTodayOrders,
    getTodayEarnings,
    getWeekEarnings,
    getMonthEarnings,
    statuses,
    clients,
    motorcycles,
    orders
  } = useData();

  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(null); // 'today', 'completed', 'collected'
  const [selectedMechanic, setSelectedMechanic] = useState(null);

  const isAdmin = user?.role === 'admin';

  const activeOrders = useMemo(() => {
    return getActiveOrders(user?.id) || [];
  }, [getActiveOrders, user?.id]);

  const allOrders = useMemo(() => {
    if (isAdmin) {
      return orders || [];
    }
    return getMechanicOrders(user?.id) || [];
  }, [getMechanicOrders, user?.id, orders, isAdmin]);

  const todayStats = useMemo(() => {
    return getTodayStats(user?.id) || { totalOrders: 0, completedOrders: 0, totalCollected: 0 };
  }, [getTodayStats, user?.id]);

  const todayOrders = useMemo(() => {
    if (isAdmin) {
      return getTodayOrders() || [];
    }
    return getTodayOrders(user?.id) || [];
  }, [getTodayOrders, user?.id, isAdmin]);

  // Today's completed orders
  const todayCompleted = useMemo(() => {
    return todayOrders.filter(o => o.status === 'Entregada');
  }, [todayOrders]);

  // Today's paid orders
  const todayPaid = useMemo(() => {
    return todayOrders.filter(o => o.is_paid);
  }, [todayOrders]);

  // Mechanics performance (for admin)
  const mechanicsToday = useMemo(() => {
    if (!isAdmin) return [];

    const mechs = {};
    todayOrders.forEach(order => {
      const id = order.mechanic_id;
      if (!mechs[id]) {
        mechs[id] = {
          id,
          name: order.mechanic_name || 'Sin asignar',
          orders: [],
          completed: 0,
          revenue: 0
        };
      }
      mechs[id].orders.push(order);
      if (order.status === 'Entregada') {
        mechs[id].completed++;
      }
      if (order.is_paid) {
        mechs[id].revenue += order.total_amount || 0;
      }
    });

    return Object.values(mechs).sort((a, b) => b.completed - a.completed);
  }, [todayOrders, isAdmin]);

  const dailyGoal = 5;
  const progress = Math.min((todayStats.completedOrders / dailyGoal) * 100, 100);

  const pendingPayments = useMemo(() => {
    return activeOrders.filter(o =>
      (o.status === 'Lista para Entregar' || o.status === 'Entregada') && !o.is_paid
    ).length;
  }, [activeOrders]);

  // Earnings calculations (mechanics only)
  const todayEarnings = useMemo(() => {
    if (isAdmin) return null; // Admins don't have earnings
    return getTodayEarnings(user?.id) || { laborTotal: 0, mechanicEarnings: 0, commissionRate: 10, orderCount: 0 };
  }, [getTodayEarnings, user?.id, isAdmin]);

  const weekEarnings = useMemo(() => {
    if (isAdmin) return null;
    return getWeekEarnings(user?.id) || { laborTotal: 0, mechanicEarnings: 0, commissionRate: 10, orderCount: 0 };
  }, [getWeekEarnings, user?.id, isAdmin]);

  const monthEarnings = useMemo(() => {
    if (isAdmin) return null;
    return getMonthEarnings(user?.id) || { laborTotal: 0, mechanicEarnings: 0, commissionRate: 10, orderCount: 0 };
  }, [getMonthEarnings, user?.id, isAdmin]);

  const quickActions = [
    {
      label: 'Nueva Orden',
      icon: Plus,
      to: '/mechanic/new-order',
      color: 'primary',
      description: 'Registrar servicio'
    },
    {
      label: 'Órdenes Activas',
      icon: ListChecks,
      to: '/mechanic/orders',
      color: 'secondary',
      count: activeOrders.length,
      description: 'En proceso'
    },
    {
      label: 'Historial',
      icon: Calendar,
      to: '/mechanic/history',
      color: 'accent',
      count: allOrders.filter(o => o.status === 'Entregada').length,
      description: 'Completados'
    },
  ];

  const priorityOrders = useMemo(() => {
    return activeOrders.filter(o =>
      o.status === 'Lista para Entregar' && !o.is_paid
    ).slice(0, 3);
  }, [activeOrders]);

  const handleStatClick = (type) => {
    setModalType(type);
    setShowModal(true);
  };

  const handleMechanicClick = (mechanic) => {
    setSelectedMechanic(mechanic);
  };

  const formatCurrency = (amount) => {
    return `$${amount.toLocaleString('es-MX')}`;
  };

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="greeting">Hola, {user?.full_name?.split(' ')[0]} 👋</h1>
          <p className="date">
            {new Date().toLocaleDateString('es-MX', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions-grid">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className={`action-card action-card-${action.color}`}
          >
            <div className="action-icon">
              <action.icon size={24} />
            </div>
            <div className="action-content">
              <div className="action-label">{action.label}</div>
              <div className="action-description">{action.description}</div>
            </div>
            {action.count !== undefined && (
              <div className="action-count">{action.count}</div>
            )}
            <ChevronRight className="action-arrow" size={20} />
          </Link>
        ))}
      </div>

      {/* Today's Summary - CLICKABLE */}
      <div className="section-header">
        <h2 className="section-title">Resumen de Hoy</h2>
      </div>

      <div className="stats-grid">
        <div
          className="stat-card stat-card-clickable"
          onClick={() => handleStatClick('today')}
        >
          <div className="stat-icon stat-icon-primary">
            <Bike size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{todayStats.totalOrders}</div>
            <div className="stat-label">Motos Hoy</div>
          </div>
          <ChevronRight className="stat-arrow" size={18} />
        </div>

        <div
          className="stat-card stat-card-clickable"
          onClick={() => handleStatClick('completed')}
        >
          <div className="stat-icon stat-icon-success">
            <CheckCircle size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{todayStats.completedOrders}</div>
            <div className="stat-label">Terminados</div>
          </div>
          <ChevronRight className="stat-arrow" size={18} />
        </div>

        <div
          className="stat-card stat-card-highlight stat-card-clickable"
          onClick={() => handleStatClick('collected')}
        >
          <div className="stat-icon stat-icon-primary">
            <DollarSign size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(todayStats.totalCollected)}</div>
            <div className="stat-label">Cobrado Hoy</div>
          </div>
          <ChevronRight className="stat-arrow" size={18} />
        </div>
      </div>

      {/* Earnings Card (Mechanics Only) */}
      {!isAdmin && todayEarnings && (
        <div className="earnings-section">
          <div className="earnings-card">
            <div className="earnings-header">
              <div className="earnings-title-wrapper">
                <h3 className="earnings-title">💰 Mis Ganancias</h3>
                <span className="commission-badge">
                  {todayEarnings.commissionRate}% de mano de obra
                </span>
              </div>
            </div>

            <div className="earnings-grid">
              <div className="earning-item">
                <span className="earning-label">Hoy</span>
                <span className="earning-amount">
                  ${todayEarnings.mechanicEarnings.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="earning-detail">
                  {todayEarnings.orderCount} orden{todayEarnings.orderCount !== 1 ? 'es' : ''} • ${todayEarnings.laborTotal.toLocaleString('es-MX')} total
                </span>
              </div>

              <div className="earning-item">
                <span className="earning-label">Esta Semana</span>
                <span className="earning-amount">
                  ${weekEarnings.mechanicEarnings.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="earning-detail">
                  {weekEarnings.orderCount} orden{weekEarnings.orderCount !== 1 ? 'es' : ''}
                </span>
              </div>

              <div className="earning-item earning-item-highlight">
                <span className="earning-label">Este Mes</span>
                <span className="earning-amount highlight">
                  ${monthEarnings.mechanicEarnings.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="earning-detail">
                  {monthEarnings.orderCount} orden{monthEarnings.orderCount !== 1 ? 'es' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Daily Goal */}
      <div className="gauge-section">
        <h3 className="gauge-title">Meta Diaria</h3>
        <SpeedometerGauge value={progress} max={100} label={`${todayStats.completedOrders}/${dailyGoal}`} />
        <p className="gauge-subtitle">
          {dailyGoal - todayStats.completedOrders > 0
            ? `Faltan ${dailyGoal - todayStats.completedOrders} para completar tu meta`
            : '¡Meta cumplida! 🎉'}
        </p>
      </div>

      {/* Mechanics Performance (Admin Only) */}
      {isAdmin && mechanicsToday.length > 0 && (
        <div className="section">
          <h2 className="section-title">
            <TrendingUp size={18} />
            Mecánicos Activos Hoy
          </h2>
          <div className="mechanics-grid">
            {mechanicsToday.map((mechanic, index) => (
              <div
                key={mechanic.id}
                className="mechanic-card-compact clickable"
                onClick={() => handleMechanicClick(mechanic)}
              >
                <div className="mechanic-rank">#{index + 1}</div>
                <div className="mechanic-info">
                  <div className="mechanic-name">{mechanic.name}</div>
                  <div className="mechanic-stats-compact">
                    <span>{mechanic.orders.length} órdenes</span>
                    <span>•</span>
                    <span className="text-success">{mechanic.completed} completadas</span>
                  </div>
                </div>
                <div className="mechanic-revenue-compact">{formatCurrency(mechanic.revenue)}</div>
                <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerts */}
      {pendingPayments > 0 && (
        <div className="alert alert-warning">
          <AlertCircle size={20} />
          <span>{pendingPayments} orden{pendingPayments > 1 ? 'es' : ''} pendiente{pendingPayments > 1 ? 's' : ''} de pago</span>
        </div>
      )}

      {/* Priority Orders */}
      {priorityOrders.length > 0 && (
        <div className="section">
          <h2 className="section-title">
            <Clock size={18} />
            Requieren Atención
          </h2>
          <div className="orders-list">
            {priorityOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                statuses={statuses}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {modalType === 'today' && 'Motos Ingresadas Hoy'}
                {modalType === 'completed' && 'Servicios Completados Hoy'}
                {modalType === 'collected' && 'Cobros del Día'}
              </h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {modalType === 'today' && (
                <div className="modal-orders-list">
                  {todayOrders.length === 0 ? (
                    <div className="empty-state">
                      <Bike size={48} className="empty-icon" />
                      <p>No hay motos ingresadas hoy</p>
                    </div>
                  ) : (
                    todayOrders.map(order => {
                      const client = clients.find(c => c.id === order.client_id);
                      const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);
                      const status = statuses.find(s => s.name === order.status);

                      return (
                        <div
                          key={order.id}
                          className="modal-order-item clickable"
                          onClick={() => {
                            navigate(`/mechanic/order/${order.id}`);
                            setShowModal(false);
                          }}
                        >
                          <div className="modal-order-info">
                            <div className="modal-order-number">{order.order_number}</div>
                            <div className="modal-order-details">
                              <User size={14} /> {client?.full_name}
                              <span className="separator">•</span>
                              <Bike size={14} /> {motorcycle?.brand} {motorcycle?.model}
                              {isAdmin && (
                                <>
                                  <span className="separator">•</span>
                                  <Wrench size={14} /> {order.mechanic_name}
                                </>
                              )}
                            </div>
                          </div>
                          <div
                            className="modal-order-status"
                            style={{
                              background: `${status?.color}20`,
                              color: status?.color
                            }}
                          >
                            {order.status}
                          </div>
                          <ChevronRight size={16} />
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {modalType === 'completed' && (
                <div className="modal-orders-list">
                  {todayCompleted.length === 0 ? (
                    <div className="empty-state">
                      <CheckCircle size={48} className="empty-icon" />
                      <p>No hay servicios completados hoy</p>
                    </div>
                  ) : (
                    todayCompleted.map(order => {
                      const client = clients.find(c => c.id === order.client_id);
                      const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);

                      return (
                        <div
                          key={order.id}
                          className="modal-order-item clickable"
                          onClick={() => {
                            navigate(`/mechanic/order/${order.id}`);
                            setShowModal(false);
                          }}
                        >
                          <div className="modal-order-info">
                            <div className="modal-order-number">{order.order_number}</div>
                            <div className="modal-order-details">
                              <User size={14} /> {client?.full_name}
                              <span className="separator">•</span>
                              <Bike size={14} /> {motorcycle?.brand} {motorcycle?.model}
                              {isAdmin && (
                                <>
                                  <span className="separator">•</span>
                                  <Wrench size={14} /> {order.mechanic_name}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="modal-order-amount">
                            {formatCurrency(order.total_amount || 0)}
                          </div>
                          <ChevronRight size={16} />
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {modalType === 'collected' && (
                <div className="modal-orders-list">
                  {todayPaid.length === 0 ? (
                    <div className="empty-state">
                      <DollarSign size={48} className="empty-icon" />
                      <p>No hay cobros registrados hoy</p>
                    </div>
                  ) : (
                    <>
                      {todayPaid.map(order => {
                        const client = clients.find(c => c.id === order.client_id);
                        const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);

                        return (
                          <div
                            key={order.id}
                            className="modal-order-item clickable"
                            onClick={() => {
                              navigate(`/mechanic/order/${order.id}`);
                              setShowModal(false);
                            }}
                          >
                            <div className="modal-order-info">
                              <div className="modal-order-number">{order.order_number}</div>
                              <div className="modal-order-details">
                                <User size={14} /> {client?.full_name}
                                <span className="separator">•</span>
                                <Bike size={14} /> {motorcycle?.brand} {motorcycle?.model}
                                {isAdmin && (
                                  <>
                                    <span className="separator">•</span>
                                    <Wrench size={14} /> {order.mechanic_name}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="modal-order-amount payment-badge">
                              ✓ {formatCurrency(order.total_amount || 0)}
                            </div>
                            <ChevronRight size={16} />
                          </div>
                        );
                      })}
                      <div className="modal-total">
                        <span>Total Cobrado:</span>
                        <span className="total-amount">{formatCurrency(todayStats.totalCollected)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mechanic Details Modal */}
      {selectedMechanic && (
        <div className="modal-overlay" onClick={() => setSelectedMechanic(null)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <Wrench size={20} />
                {selectedMechanic.name}
              </h3>
              <button className="modal-close" onClick={() => setSelectedMechanic(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="mechanic-summary-grid">
                <div className="summary-stat">
                  <span className="summary-value">{selectedMechanic.orders.length}</span>
                  <span className="summary-label">Total</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-value text-success">{selectedMechanic.completed}</span>
                  <span className="summary-label">Completadas</span>
                </div>
                <div className="summary-stat">
                  <span className="summary-value text-primary">{formatCurrency(selectedMechanic.revenue)}</span>
                  <span className="summary-label">Generado</span>
                </div>
              </div>

              <div className="modal-orders-list">
                {selectedMechanic.orders.map(order => {
                  const client = clients.find(c => c.id === order.client_id);
                  const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);
                  const status = statuses.find(s => s.name === order.status);

                  return (
                    <div
                      key={order.id}
                      className="modal-order-item clickable"
                      onClick={() => {
                        navigate(`/mechanic/order/${order.id}`);
                        setSelectedMechanic(null);
                      }}
                    >
                      <div className="modal-order-info">
                        <div className="modal-order-number">{order.order_number}</div>
                        <div className="modal-order-details">
                          <User size={14} /> {client?.full_name}
                          <span className="separator">•</span>
                          <Bike size={14} /> {motorcycle?.brand} {motorcycle?.model}
                        </div>
                      </div>
                      <div
                        className="modal-order-status"
                        style={{
                          background: `${status?.color}20`,
                          color: status?.color
                        }}
                      >
                        {order.status}
                      </div>
                      <ChevronRight size={16} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .dashboard {
          padding-bottom: 100px;
        }

        .dashboard-header {
          margin-bottom: var(--spacing-lg);
        }

        .greeting {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .date {
          color: var(--text-secondary);
          font-size: 0.875rem;
          text-transform: capitalize;
        }

        .quick-actions-grid {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-xl);
        }

        .action-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          text-decoration: none;
          color: inherit;
          position: relative;
          transition: all var(--transition-fast);
        }

        .action-card:hover {
          transform: translateX(4px);
          border-color: var(--primary);
        }

        .action-card-primary {
          background: linear-gradient(135deg, var(--primary) 0%, #2563eb 100%);
          color: white;
          border: none;
        }

        .action-icon {
          width: 48px;
          height: 48px;
          background: rgba(59, 130, 246, 0.15);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .action-card-primary .action-icon {
          background: rgba(255, 255, 255, 0.2);
        }

        .action-content {
          flex: 1;
        }

        .action-label {
          font-weight: 600;
          font-size: 1rem;
          margin-bottom: 2px;
        }

        .action-description {
          font-size: 0.75rem;
          opacity: 0.8;
        }

        .action-count {
          width: 32px;
          height: 32px;
          background: rgba(59, 130, 246, 0.2);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.875rem;
          color: var(--primary);
        }

        .action-card-primary .action-count {
          background: rgba(255, 255, 255, 0.25);
          color: white;
        }

        .action-arrow {
          color: var(--text-muted);
        }

        .action-card-primary .action-arrow {
          color: rgba(255, 255, 255, 0.8);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-md);
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-size: 1.125rem;
          font-weight: 600;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-xl);
        }

        .stat-card {
          position: relative;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: var(--spacing-md);
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          transition: all var(--transition-fast);
        }

        .stat-card-clickable {
          cursor: pointer;
        }

        .stat-card-clickable:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
          border-color: var(--primary);
        }

        .stat-card-highlight {
          grid-column: span 2;
          background: linear-gradient(135deg, var(--bg-card) 0%, var(--primary-light) 100%);
          border-color: var(--primary);
        }

        .stat-arrow {
          position: absolute;
          top: var(--spacing-sm);
          right: var(--spacing-sm);
          color: var(--text-muted);
        }

        .gauge-section {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: var(--spacing-lg);
          text-align: center;
          margin-bottom: var(--spacing-xl);
        }

        .gauge-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: var(--spacing-md);
        }

        .gauge-subtitle {
          margin-top: var(--spacing-md);
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .earnings-section {
          margin-bottom: var(--spacing-xl);
        }

        .earnings-card {
          background: linear-gradient(135deg, var(--bg-card) 0%, var(--accent-light) 100%);
          border: 1px solid var(--accent);
          border-radius: var(--radius-lg);
          padding: var(--spacing-lg);
        }

        .earnings-header {
          margin-bottom: var(--spacing-md);
        }

        .earnings-title-wrapper {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xs);
        }

        .earnings-title {
          font-size: 1.125rem;
          font-weight: 700;
          margin: 0;
        }

        .commission-badge {
          display: inline-block;
          padding: 4px 12px;
          background: rgba(139, 92, 246, 0.15);
          color: var(--accent);
          border-radius: var(--radius-md);
          font-size: 0.75rem;
          font-weight: 600;
          align-self: flex-start;
        }

        .earnings-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--spacing-md);
        }

        .earning-item {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .earning-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .earning-amount {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--accent);
        }

        .earning-amount.highlight {
          font-size: 1.5rem;
          color: var(--accent);
        }

        .earning-detail {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }

        .earning-item-highlight {
          background: rgba(139, 92, 246, 0.1);
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
        }

        @media (max-width: 640px) {
          .earnings-grid {
            grid-template-columns: 1fr;
            gap: var(--spacing-sm);
          }

          .earning-amount {
            font-size: 1.125rem;
          }

          .earning-amount.highlight {
            font-size: 1.375rem;
          }
        }

        .section {
          margin-bottom: var(--spacing-xl);
        }

        .mechanics-grid {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .mechanic-card-compact {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .mechanic-card-compact:hover {
          border-color: var(--primary);
          transform: translateX(4px);
        }

        .mechanic-rank {
          width: 32px;
          height: 32px;
          background: var(--primary-light);
          color: var(--primary);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.875rem;
          flex-shrink: 0;
        }

        .mechanic-info {
          flex: 1;
          min-width: 0;
        }

        .mechanic-name {
          font-weight: 600;
          font-size: 0.9375rem;
        }

        .mechanic-stats-compact {
          display: flex;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 2px;
        }

        .mechanic-revenue-compact {
          font-weight: 700;
          color: var(--primary);
          font-size: 0.9375rem;
        }

        .alert {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-lg);
        }

        .alert-warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fde68a;
        }

        .orders-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .modal-large {
          max-width: 600px;
          max-height: 85vh;
        }

        .modal-orders-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
          max-height: 60vh;
          overflow-y: auto;
        }

        .modal-order-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
          border: 1px solid transparent;
        }

        .modal-order-item:hover {
          background: var(--bg-hover);
          border-color: var(--primary);
          transform: translateX(4px);
        }

        .modal-order-info {
          flex: 1;
          min-width: 0;
        }

        .modal-order-number {
          font-weight: 700;
          color: var(--primary);
          font-size: 0.9375rem;
          margin-bottom: 4px;
        }

        .modal-order-details {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--text-secondary);
          flex-wrap: wrap;
        }

        .separator {
          color: var(--text-muted);
        }

        .modal-order-status {
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .modal-order-amount {
          font-weight: 700;
          color: var(--primary);
          font-size: 1rem;
          white-space: nowrap;
        }

        .payment-badge {
          background: #d1fae5;
          color: #065f46;
          padding: 4px 10px;
          border-radius: var(--radius-sm);
        }

        .modal-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--spacing-md);
          background: var(--bg-card);
          border-radius: var(--radius-md);
          border: 2px solid var(--primary);
          margin-top: var(--spacing-md);
          font-weight: 700;
        }

        .total-amount {
          font-size: 1.375rem;
          color: var(--primary);
        }

        .mechanic-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
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
          color: var(--text-primary);
        }

        .summary-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 4px;
        }

        .empty-state {
          text-align: center;
          padding: var(--spacing-xl);
          color: var(--text-secondary);
        }

        .empty-icon {
          opacity: 0.3;
          margin-bottom: var(--spacing-md);
        }
      `}</style>
    </div>
  );
}
