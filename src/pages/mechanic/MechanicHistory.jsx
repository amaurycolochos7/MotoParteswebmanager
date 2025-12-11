import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History,
  Search,
  User,
  Wrench,
  Calendar,
  Clock,
  DollarSign,
  CheckCircle,
  ChevronRight,
  Filter,
  Bike,
  Trash2,
  AlertCircle,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export default function MechanicHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { orders, clients, motorcycles, statuses, deleteOrder } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date'); // date, amount, mechanic
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const isAdmin = user?.role === 'admin';

  // Get orders based on user role
  const allOrders = useMemo(() => {
    if (isAdmin) {
      // Admin sees ALL orders
      return orders || [];
    }
    // Mechanic sees only their orders
    return orders.filter(o => o.mechanic_id === user?.id) || [];
  }, [orders, user, isAdmin]);

  const deliveredOrders = useMemo(() => {
    return allOrders.filter(o => o.status === 'Entregada');
  }, [allOrders]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return deliveredOrders;

    const query = searchQuery.toLowerCase();
    return deliveredOrders.filter(order => {
      const client = clients.find(c => c.id === order.client_id);
      const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);

      return (
        order.order_number?.toLowerCase().includes(query) ||
        client?.full_name?.toLowerCase().includes(query) ||
        order.mechanic_name?.toLowerCase().includes(query) ||
        `${motorcycle?.brand} ${motorcycle?.model}`.toLowerCase().includes(query)
      );
    });
  }, [deliveredOrders, searchQuery, clients, motorcycles]);

  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders];

    switch (sortBy) {
      case 'date':
        return sorted.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      case 'amount':
        return sorted.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
      case 'mechanic':
        return sorted.sort((a, b) => (a.mechanic_name || '').localeCompare(b.mechanic_name || ''));
      default:
        return sorted;
    }
  }, [filteredOrders, sortBy]);

  const stats = useMemo(() => {
    const total = deliveredOrders.length;
    const totalRevenue = deliveredOrders
      .filter(o => o.is_paid)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    const avgRevenue = total > 0 ? totalRevenue / total : 0;

    return { total, totalRevenue, avgRevenue };
  }, [deliveredOrders]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeSince = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 30) return `${Math.floor(days / 30)} mes${Math.floor(days / 30) > 1 ? 'es' : ''}`;
    if (days > 0) return `${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours}h`;
    return 'Hoy';
  };

  const getDuration = (createdAt, updatedAt) => {
    const start = new Date(createdAt);
    const end = new Date(updatedAt);
    const diff = end - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''}`;
    return 'Menos de 1 hora';
  };

  const handleOrderClick = (order, e) => {
    // Don't do anything if clicking delete button
    if (e.target.closest('.delete-btn')) return;

    if (isAdmin) {
      // Admin: Show detailed modal
      setSelectedOrder(order);
      setShowDetailsModal(true);
    } else {
      // Mechanic: Navigate to order detail
      navigate(`/mechanic/order/${order.id}`);
    }
  };

  const handleDeleteClick = (order, e) => {
    e.stopPropagation();
    setOrderToDelete(order);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (orderToDelete) {
      deleteOrder(orderToDelete.id);
      setShowDeleteModal(false);
      setOrderToDelete(null);
    }
  };

  return (
    <div className="mechanic-history">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <History size={24} />
            {isAdmin ? 'Historial Completo' : 'Mi Historial'}
          </h1>
          <p className="page-subtitle">
            {stats.total} servicio{stats.total !== 1 ? 's' : ''} completado{stats.total !== 1 ? 's' : ''}
            {isAdmin && ' (Todos los mecánicos)'}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-cards">
        <div className="stat-card card">
          <div className="stat-icon">
            <CheckCircle size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Completados</div>
          </div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon">
            <DollarSign size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">${stats.totalRevenue.toLocaleString('es-MX')}</div>
            <div className="stat-label">Total Generado</div>
          </div>
        </div>
        <div className="stat-card card">
          <div className="stat-icon">
            <DollarSign size={20} />
          </div>
          <div className="stat-content">
            <div className="stat-value">${Math.round(stats.avgRevenue).toLocaleString('es-MX')}</div>
            <div className="stat-label">Promedio</div>
          </div>
        </div>
      </div>

      {/* Search & Sort */}
      <div className="search-section">
        <div className="search-box">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            className="form-input"
            placeholder="Buscar por orden, cliente, mecánico o moto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="sort-buttons">
          <button
            className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`}
            onClick={() => setSortBy('date')}
          >
            Fecha
          </button>
          <button
            className={`sort-btn ${sortBy === 'amount' ? 'active' : ''}`}
            onClick={() => setSortBy('amount')}
          >
            Monto
          </button>
          {isAdmin && (
            <button
              className={`sort-btn ${sortBy === 'mechanic' ? 'active' : ''}`}
              onClick={() => setSortBy('mechanic')}
            >
              Mecánico
            </button>
          )}
        </div>
      </div>

      {sortedOrders.length === 0 ? (
        <div className="empty-state card">
          <History size={48} className="empty-state-icon" />
          <h3>Sin historial</h3>
          <p className="text-secondary">
            {searchQuery ? 'No se encontraron resultados' : 'Los servicios completados aparecerán aquí'}
          </p>
        </div>
      ) : (
        <div className="orders-list">
          {sortedOrders.map(order => {
            const client = clients.find(c => c.id === order.client_id);
            const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);
            const status = statuses.find(s => s.name === order.status);

            return (
              <div
                key={order.id}
                className="history-card card clickable"
                onClick={(e) => handleOrderClick(order, e)}
              >
                <div className="card-header">
                  <div className="order-info">
                    <div className="order-number">{order.order_number}</div>
                    <div className="time-badge">
                      <Clock size={12} />
                      {getTimeSince(order.updated_at)}
                    </div>
                  </div>
                  <div className="header-actions">
                    <div
                      className="status-badge"
                      style={{
                        background: `${status?.color}20`,
                        color: status?.color
                      }}
                    >
                      <CheckCircle size={14} />
                      {order.status}
                    </div>
                    {isAdmin && (
                      <button
                        className="delete-btn"
                        onClick={(e) => handleDeleteClick(order, e)}
                        title="Eliminar orden"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="card-content">
                  {/* Mechanic - SUPER VISIBLE */}
                  <div className="mechanic-highlight">
                    <div className="mechanic-icon-badge">
                      <Wrench size={20} />
                    </div>
                    <div className="mechanic-details">
                      <div className="mechanic-label">Mecánico Asignado</div>
                      <div className="mechanic-name-large">
                        {order.mechanic_name || 'Sin asignar'}
                      </div>
                    </div>
                  </div>

                  {/* Client & Motorcycle */}
                  <div className="info-grid">
                    <div className="info-item">
                      <User size={16} className="info-icon" />
                      <div className="info-content">
                        <div className="info-label">Cliente</div>
                        <div className="info-value">{client?.full_name || 'Desconocido'}</div>
                      </div>
                    </div>

                    <div className="info-item">
                      <Bike size={16} className="info-icon" />
                      <div className="info-content">
                        <div className="info-label">Motocicleta</div>
                        <div className="info-value">{motorcycle?.brand} {motorcycle?.model}</div>
                      </div>
                    </div>
                  </div>

                  {/* Services - VISIBLE FOR ADMIN */}
                  {order.services && order.services.length > 0 && (
                    <div className="services-section">
                      <div className="services-header">
                        <Wrench size={14} />
                        <span>Servicios Realizados ({order.services.length})</span>
                      </div>
                      <div className="services-list">
                        {order.services.map((service, idx) => (
                          <div key={idx} className="service-item">
                            <span className="service-dot">•</span>
                            <span className="service-name">{service.description}</span>
                            <span className="service-price">${service.price?.toLocaleString('es-MX')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Date & Amount */}
                  <div className="card-footer">
                    <div className="date-info">
                      <Calendar size={14} />
                      <span>{formatDate(order.updated_at)}</span>
                      <span className="time-text">{formatTime(order.updated_at)}</span>
                    </div>
                    <div className="amount-info">
                      <DollarSign size={18} />
                      <span className="amount-value">${(order.total_amount || 0).toLocaleString('es-MX')}</span>
                    </div>
                  </div>
                </div>

                <ChevronRight className="card-arrow" size={20} />
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && orderToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal delete-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-icon-danger">
                <AlertCircle size={24} />
              </div>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <h3 className="modal-title">¿Eliminar orden?</h3>
              <p className="modal-description">
                Esta acción eliminará permanentemente la orden <strong>{orderToDelete.order_number}</strong> del historial.
              </p>
              <div className="modal-warning">
                <AlertCircle size={16} />
                <span>Esta acción no se puede deshacer</span>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmDelete}
              >
                <Trash2 size={16} />
                Eliminar Orden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal - ONLY FOR ADMIN */}
      {showDetailsModal && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal details-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Detalles del Servicio</h3>
              <button className="modal-close" onClick={() => setShowDetailsModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {(() => {
                const client = clients.find(c => c.id === selectedOrder.client_id);
                const motorcycle = motorcycles.find(m => m.id === selectedOrder.motorcycle_id);
                const status = statuses.find(s => s.name === selectedOrder.status);

                return (
                  <>
                    {/* Order Number & Status */}
                    <div className="detail-header">
                      <div className="detail-order-number">{selectedOrder.order_number}</div>
                      <div
                        className="detail-status-badge"
                        style={{
                          background: `${status?.color}20`,
                          color: status?.color
                        }}
                      >
                        <CheckCircle size={16} />
                        {selectedOrder.status}
                      </div>
                    </div>

                    {/* Mechanic Section - DESTACADO */}
                    <div className="detail-section mechanic-section">
                      <div className="section-header">
                        <Wrench size={18} />
                        <span>Mecánico Responsable</span>
                      </div>
                      <div className="mechanic-card-detail">
                        <div className="mechanic-avatar">
                          <User size={28} />
                        </div>
                        <div className="mechanic-info-detail">
                          <div className="mechanic-name-detail">{selectedOrder.mechanic_name || 'Sin asignar'}</div>
                          <div className="mechanic-role">Técnico Especializado</div>
                        </div>
                      </div>
                    </div>

                    {/* Client & Motorcycle Grid */}
                    <div className="detail-grid">
                      <div className="detail-section">
                        <div className="section-header">
                          <User size={16} />
                          <span>Cliente</span>
                        </div>
                        <div className="detail-content">
                          <div className="detail-text-large">{client?.full_name || 'Desconocido'}</div>
                          {client?.phone && (
                            <div className="detail-text-small">
                              📱 {client.phone}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="detail-section">
                        <div className="section-header">
                          <Bike size={16} />
                          <span>Motocicleta</span>
                        </div>
                        <div className="detail-content">
                          <div className="detail-text-large">{motorcycle?.brand} {motorcycle?.model}</div>
                          <div className="detail-text-small">
                            {motorcycle?.year} • {motorcycle?.plate}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Services Section */}
                    {selectedOrder.services && selectedOrder.services.length > 0 && (
                      <div className="detail-section">
                        <div className="section-header">
                          <Wrench size={16} />
                          <span>Servicios Realizados ({selectedOrder.services.length})</span>
                        </div>
                        <div className="services-detail-list">
                          {selectedOrder.services.map((service, idx) => (
                            <div key={idx} className="service-detail-item">
                              <div className="service-detail-left">
                                <div className="service-detail-number">{idx + 1}</div>
                                <div className="service-detail-info">
                                  <div className="service-detail-name">{service.description || 'Servicio sin nombre'}</div>
                                  {service.notes && (
                                    <div className="service-detail-notes">{service.notes}</div>
                                  )}
                                </div>
                              </div>
                              <div className="service-detail-price">
                                ${service.price?.toLocaleString('es-MX')}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="services-total">
                          <span>Total Servicios:</span>
                          <span className="total-amount">
                            ${selectedOrder.services.reduce((sum, s) => sum + (s.price || 0), 0).toLocaleString('es-MX')}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Timeline Section */}
                    <div className="detail-section">
                      <div className="section-header">
                        <Clock size={16} />
                        <span>Línea de Tiempo</span>
                      </div>
                      <div className="timeline">
                        <div className="timeline-item">
                          <div className="timeline-dot"></div>
                          <div className="timeline-content">
                            <div className="timeline-label">Ingresada</div>
                            <div className="timeline-date">
                              {formatDate(selectedOrder.created_at)} • {formatTime(selectedOrder.created_at)}
                            </div>
                          </div>
                        </div>
                        <div className="timeline-item">
                          <div className="timeline-dot timeline-dot-success"></div>
                          <div className="timeline-content">
                            <div className="timeline-label">Entregada</div>
                            <div className="timeline-date">
                              {formatDate(selectedOrder.updated_at)} • {formatTime(selectedOrder.updated_at)}
                            </div>
                          </div>
                        </div>
                        <div className="timeline-duration">
                          <Clock size={14} />
                          <span>Duración total: {getDuration(selectedOrder.created_at, selectedOrder.updated_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Payment Info */}
                    <div className="detail-section">
                      <div className="section-header">
                        <DollarSign size={16} />
                        <span>Información de Pago</span>
                      </div>
                      <div className="payment-info">
                        <div className="payment-row">
                          <span>Total de la Orden:</span>
                          <span className="payment-amount">
                            ${(selectedOrder.total_amount || 0).toLocaleString('es-MX')}
                          </span>
                        </div>
                        <div className="payment-row">
                          <span>Estado de Pago:</span>
                          <span className={`payment-status ${selectedOrder.is_paid ? 'paid' : 'pending'}`}>
                            {selectedOrder.is_paid ? '✓ Pagado' : '⏳ Pendiente'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      className="btn btn-primary btn-full"
                      onClick={() => {
                        navigate(`/mechanic/order/${selectedOrder.id}`);
                        setShowDetailsModal(false);
                      }}
                    >
                      Ver Detalles Completos
                      <ChevronRight size={18} />
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mechanic-history {
          padding-bottom: 100px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--spacing-lg);
        }

        .page-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: var(--spacing-xs);
        }

        .page-subtitle {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .stats-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-lg);
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-md);
        }

        .stat-icon {
          width: 40px;
          height: 40px;
          background: var(--primary-light);
          color: var(--primary);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-content {
          flex: 1;
          min-width: 0;
        }

        .stat-value {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1;
        }

        .stat-label {
          font-size: 0.6875rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-top: 4px;
        }

        .search-section {
          margin-bottom: var(--spacing-lg);
        }

        .search-box {
          position: relative;
          margin-bottom: var(--spacing-sm);
        }

        .search-box .form-input {
          padding-left: 48px;
        }

        .search-icon {
          position: absolute;
          left: var(--spacing-md);
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .sort-buttons {
          display: flex;
          gap: var(--spacing-xs);
        }

        .sort-btn {
          flex: 1;
          padding: var(--spacing-sm) var(--spacing-md);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          font-size: 0.8125rem;
          font-weight: 500;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .sort-btn.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .orders-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .history-card {
          position: relative;
          padding: var(--spacing-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .history-card:hover {
          border-color: var(--primary);
          transform: translateX(4px);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-md);
        }

        .order-info {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
        }

        .order-number {
          font-weight: 700;
          color: var(--primary);
          font-size: 0.9375rem;
        }

        .time-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          font-size: 0.6875rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .delete-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .delete-btn:hover {
          background: #fee2e2;
          border-color: #ef4444;
          color: #ef4444;
        }

        .card-content {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .mechanic-highlight {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border-radius: var(--radius-md);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        }

        .mechanic-icon-badge {
          width: 48px;
          height: 48px;
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(10px);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }

        .mechanic-details {
          flex: 1;
          min-width: 0;
        }

        .mechanic-label {
          font-size: 0.6875rem;
          color: rgba(255, 255, 255, 0.85);
          text-transform: uppercase;
          letter-spacing: 1px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .mechanic-name-large {
          font-size: 1.25rem;
          font-weight: 700;
          color: white;
          line-height: 1.2;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-sm);
        }

        .info-item {
          display: flex;
          align-items: flex-start;
          gap: var(--spacing-sm);
          padding: var(--spacing-sm);
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
        }

        .info-icon {
          color: var(--primary);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .info-content {
          flex: 1;
          min-width: 0;
        }

        .info-label {
          font-size: 0.6875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .info-value {
          font-size: 0.875rem;
          color: var(--text-primary);
          font-weight: 600;
        }

        .services-section {
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: var(--spacing-sm);
          border: 1px solid var(--border-color);
        }

        .services-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--spacing-sm);
          padding-bottom: var(--spacing-xs);
          border-bottom: 1px solid var(--border-color);
        }

        .services-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .service-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          font-size: 0.8125rem;
          padding: 6px 8px;
          background: var(--bg-card);
          border-radius: var(--radius-sm);
        }

        .service-dot {
          color: var(--primary);
          font-weight: 700;
        }

        .service-name {
          flex: 1;
          color: var(--text-secondary);
        }

        .service-price {
          color: var(--text-primary);
          font-weight: 700;
          font-size: 0.875rem;
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: var(--spacing-sm);
          border-top: 1px solid var(--border-color);
        }

        .date-info {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .time-text {
          color: var(--text-muted);
          font-size: 0.6875rem;
        }

        .amount-info {
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 700;
          color: var(--primary);
        }

        .amount-value {
          font-size: 1.125rem;
        }

        .card-arrow {
          position: absolute;
          right: var(--spacing-md);
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .delete-modal {
          max-width: 400px;
        }

        .modal-icon-danger {
          width: 56px;
          height: 56px;
          background: #fee2e2;
          color: #ef4444;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto var(--spacing-md);
        }

        .modal-title {
          font-size: 1.25rem;
          font-weight: 700;
          text-align: center;
          margin-bottom: var(--spacing-sm);
        }

        .modal-description {
          text-align: center;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: var(--spacing-md);
        }

        .modal-warning {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-xs);
          padding: var(--spacing-sm);
          background: #fef3c7;
          color: #92400e;
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          font-weight: 500;
        }

        .modal-footer {
          display: flex;
          gap: var(--spacing-sm);
          margin-top: var(--spacing-lg);
        }

        .modal-footer .btn {
          flex: 1;
        }

        .btn-danger {
          background: #ef4444;
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-xs);
        }

        .btn-danger:hover {
          background: #dc2626;
        }

        .details-modal {
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .details-modal .modal-body {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-lg);
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: var(--spacing-md);
          border-bottom: 2px solid var(--border-color);
        }

        .detail-order-number {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--primary);
        }

        .detail-status-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-weight: 600;
        }

        .detail-section {
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: var(--spacing-md);
          border: 1px solid var(--border-color);
        }

        .mechanic-section {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border: none;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--spacing-md);
        }

        .mechanic-section .section-header {
          color: rgba(255, 255, 255, 0.9);
        }

        .mechanic-card-detail {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }

        .mechanic-avatar {
          width: 64px;
          height: 64px;
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }

        .mechanic-info-detail {
          flex: 1;
        }

        .mechanic-name-detail {
          font-size: 1.375rem;
          font-weight: 700;
          color: white;
          line-height: 1.2;
          margin-bottom: 4px;
        }

        .mechanic-role {
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.8);
          font-weight: 500;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-md);
        }

        .detail-content {
          padding-top: 4px;
        }

        .detail-text-large {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .detail-text-small {
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .services-detail-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .service-detail-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: var(--spacing-md);
          background: var(--bg-card);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          gap: var(--spacing-md);
        }

        .service-detail-left {
          display: flex;
          align-items: flex-start;
          gap: var(--spacing-sm);
          flex: 1;
        }

        .service-detail-number {
          width: 32px;
          height: 32px;
          background: var(--primary);
          color: white;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        .service-detail-info {
          flex: 1;
          min-width: 0;
        }

        .service-detail-name {
          font-size: 1.125rem;
          color: var(--text-primary);
          font-weight: 700;
          line-height: 1.4;
          margin-bottom: 4px;
        }

        .service-detail-notes {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-top: 4px;
        }

        .service-detail-price {
          font-size: 1rem;
          font-weight: 700;
          color: var(--primary);
        }

        .services-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: var(--spacing-sm);
          margin-top: var(--spacing-sm);
          border-top: 2px solid var(--border-color);
          font-weight: 600;
        }

        .total-amount {
          font-size: 1.25rem;
          color: var(--primary);
        }

        .timeline {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .timeline-item {
          display: flex;
          gap: var(--spacing-md);
          position: relative;
        }

        .timeline-item:not(:last-of-type)::after {
          content: '';
          position: absolute;
          left: 7px;
          top: 24px;
          width: 2px;
          height: calc(100% + var(--spacing-md));
          background: var(--border-color);
        }

        .timeline-dot {
          width: 16px;
          height: 16px;
          background: var(--text-muted);
          border-radius: var(--radius-full);
          flex-shrink: 0;
          margin-top: 2px;
          z-index: 1;
        }

        .timeline-dot-success {
          background: #10b981;
        }

        .timeline-content {
          flex: 1;
        }

        .timeline-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 2px;
        }

        .timeline-date {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .timeline-duration {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          padding: var(--spacing-sm);
          background: var(--bg-card);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          color: var(--text-secondary);
          font-weight: 500;
          border: 1px solid var(--border-color);
          margin-top: var(--spacing-xs);
        }

        .payment-info {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .payment-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--spacing-sm);
          background: var(--bg-card);
          border-radius: var(--radius-sm);
        }

        .payment-amount {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--primary);
        }

        .payment-status {
          padding: 4px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .payment-status.paid {
          background: #d1fae5;
          color: #065f46;
        }

        .payment-status.pending {
          background: #fef3c7;
          color: #92400e;
        }

        .btn-full {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-xs);
          font-size: 1rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
