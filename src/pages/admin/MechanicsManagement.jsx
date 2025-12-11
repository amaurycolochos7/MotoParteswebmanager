import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
    Users,
    TrendingUp,
    DollarSign,
    Wrench,
    CheckCircle,
    Clock,
    Package,
    ChevronRight,
    Calendar,
    AlertCircle,
    Award
} from 'lucide-react';

const TIME_FILTERS = [
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'year', label: 'Año' },
    { id: 'all', label: 'Todo' },
];

export default function MechanicsManagement() {
    const navigate = useNavigate();
    const { orders, clients, motorcycles, statuses } = useData();
    const { user, users } = useAuth();
    const [timeFilter, setTimeFilter] = useState('month');
    const [selectedMechanic, setSelectedMechanic] = useState(null);

    // Filter orders by time
    const filteredOrders = useMemo(() => {
        if (timeFilter === 'all') return orders;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const yearStart = new Date(now.getFullYear(), 0, 1);

        return orders.filter(order => {
            const orderDate = new Date(order.created_at);
            switch (timeFilter) {
                case 'week':
                    return orderDate >= weekAgo;
                case 'month':
                    return orderDate >= monthAgo;
                case 'year':
                    return orderDate >= yearStart;
                default:
                    return true;
            }
        });
    }, [orders, timeFilter]);

    // Calculate mechanic stats
    const mechanicStats = useMemo(() => {
        const mechanics = {};

        // Get all users who are mechanics (not just those with orders)
        const mechanicUsers = users.filter(u => u.role === 'mechanic' || u.role === 'admin');

        mechanicUsers.forEach(mechUser => {
            mechanics[mechUser.id] = {
                id: mechUser.id,
                name: mechUser.full_name,
                email: mechUser.email,
                role: mechUser.role,
                totalOrders: 0,
                activeOrders: 0,
                completedOrders: 0,
                totalRevenue: 0,
                paidRevenue: 0,
                pendingRevenue: 0,
                avgOrderValue: 0,
                completionRate: 0,
                orders: []
            };
        });

        // Add orders data
        filteredOrders.forEach(order => {
            const id = order.mechanic_id;
            if (!mechanics[id]) {
                // Handle mechanic not in users list (legacy data)
                mechanics[id] = {
                    id,
                    name: order.mechanic_name || 'Sin asignar',
                    email: '',
                    role: 'mechanic',
                    totalOrders: 0,
                    activeOrders: 0,
                    completedOrders: 0,
                    totalRevenue: 0,
                    paidRevenue: 0,
                    pendingRevenue: 0,
                    avgOrderValue: 0,
                    completionRate: 0,
                    orders: []
                };
            }

            mechanics[id].totalOrders++;
            mechanics[id].orders.push(order);
            mechanics[id].totalRevenue += order.total_amount || 0;

            if (order.status === 'Entregada') {
                mechanics[id].completedOrders++;
            } else {
                mechanics[id].activeOrders++;
            }

            if (order.is_paid) {
                mechanics[id].paidRevenue += order.total_amount || 0;
            } else {
                mechanics[id].pendingRevenue += order.total_amount || 0;
            }
        });

        // Calculate derived stats
        Object.values(mechanics).forEach(mech => {
            if (mech.totalOrders > 0) {
                mech.avgOrderValue = Math.round(mech.totalRevenue / mech.totalOrders);
                mech.completionRate = Math.round((mech.completedOrders / mech.totalOrders) * 100);
            }
        });

        return Object.values(mechanics).sort((a, b) => b.totalRevenue - a.totalRevenue);
    }, [filteredOrders, users]);

    const topPerformer = mechanicStats[0];

    const handleMechanicClick = (mechanic) => {
        setSelectedMechanic(mechanic);
    };

    const handleOrderClick = (orderId) => {
        navigate(`/mechanic/order/${orderId}`);
        setSelectedMechanic(null);
    };

    if (user.role !== 'admin') {
        return (
            <div className="page">
                <div className="empty-state">
                    <AlertCircle size={48} />
                    <h2>Acceso Denegado</h2>
                    <p>Solo los administradores pueden ver esta página</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mechanics-management">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <Users size={28} />
                        Gestión de Mecánicos
                    </h1>
                    <p className="page-subtitle">
                        Rendimiento y productividad del equipo
                    </p>
                </div>
            </div>

            {/* Time Filter */}
            <div className="filter-tabs mb-lg">
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

            {/* Top Performer */}
            {topPerformer && topPerformer.totalOrders > 0 && (
                <div className="card top-performer-card mb-lg">
                    <div className="top-performer-badge">
                        <Award size={24} />
                        <span>Mejor Rendimiento</span>
                    </div>
                    <div className="top-performer-content">
                        <h2>{topPerformer.name}</h2>
                        <div className="top-stats">
                            <div className="top-stat">
                                <DollarSign size={20} />
                                <div>
                                    <div className="top-stat-value">${topPerformer.totalRevenue.toLocaleString('es-MX')}</div>
                                    <div className="top-stat-label">Ingresos Generados</div>
                                </div>
                            </div>
                            <div className="top-stat">
                                <CheckCircle size={20} />
                                <div>
                                    <div className="top-stat-value">{topPerformer.completedOrders}</div>
                                    <div className="top-stat-label">Órdenes Completadas</div>
                                </div>
                            </div>
                            <div className="top-stat">
                                <TrendingUp size={20} />
                                <div>
                                    <div className="top-stat-value">{topPerformer.completionRate}%</div>
                                    <div className="top-stat-label">Tasa de Completado</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mechanics List */}
            <div className="mechanics-list">
                {mechanicStats.length === 0 ? (
                    <div className="empty-state card">
                        <Users size={48} style={{ opacity: 0.3 }} />
                        <h3>No hay mecánicos registrados</h3>
                        <p>Agrega usuarios con rol de mecánico para ver estadísticas</p>
                    </div>
                ) : (
                    mechanicStats.map((mechanic, index) => (
                        <div
                            key={mechanic.id}
                            className={`mechanic-stat-card card ${mechanic.totalOrders > 0 ? 'clickable' : ''}`}
                            onClick={() => mechanic.totalOrders > 0 && handleMechanicClick(mechanic)}
                        >
                            <div className="mechanic-header">
                                <div className="mechanic-rank">#{index + 1}</div>
                                <div className="mechanic-identity">
                                    <h3>{mechanic.name}</h3>
                                    <p className="mechanic-email">{mechanic.email}</p>
                                </div>
                                {mechanic.totalOrders > 0 && (
                                    <ChevronRight size={20} className="mechanic-arrow" />
                                )}
                            </div>

                            {mechanic.totalOrders === 0 ? (
                                <div className="no-activity">
                                    <Clock size={16} />
                                    <span>Sin actividad en este período</span>
                                </div>
                            ) : (
                                <>
                                    <div className="mechanic-kpis">
                                        <div className="kpi-item">
                                            <div className="kpi-icon kpi-icon-primary">
                                                <Package size={18} />
                                            </div>
                                            <div>
                                                <div className="kpi-number">{mechanic.totalOrders}</div>
                                                <div className="kpi-text">Órdenes</div>
                                            </div>
                                        </div>
                                        <div className="kpi-item">
                                            <div className="kpi-icon kpi-icon-warning">
                                                <Clock size={18} />
                                            </div>
                                            <div>
                                                <div className="kpi-number">{mechanic.activeOrders}</div>
                                                <div className="kpi-text">Activas</div>
                                            </div>
                                        </div>
                                        <div className="kpi-item">
                                            <div className="kpi-icon kpi-icon-success">
                                                <CheckCircle size={18} />
                                            </div>
                                            <div>
                                                <div className="kpi-number">{mechanic.completedOrders}</div>
                                                <div className="kpi-text">Completadas</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mechanic-revenue">
                                        <div className="revenue-row">
                                            <span className="revenue-label">Ingresos Totales:</span>
                                            <span className="revenue-value text-primary">
                                                ${mechanic.totalRevenue.toLocaleString('es-MX')}
                                            </span>
                                        </div>
                                        <div className="revenue-breakdown">
                                            <span className="revenue-item text-success">
                                                Cobrado: ${mechanic.paidRevenue.toLocaleString('es-MX')}
                                            </span>
                                            <span className="revenue-separator">•</span>
                                            <span className="revenue-item text-warning">
                                                Pendiente: ${mechanic.pendingRevenue.toLocaleString('es-MX')}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mechanic-footer">
                                        <div className="footer-metric">
                                            <span className="metric-label">Promedio/Orden:</span>
                                            <span className="metric-value">${mechanic.avgOrderValue.toLocaleString('es-MX')}</span>
                                        </div>
                                        <div className="footer-metric">
                                            <span className="metric-label">Tasa Completado:</span>
                                            <span className="metric-value">{mechanic.completionRate}%</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Mechanic Detail Modal */}
            {selectedMechanic && (
                <div className="modal-overlay" onClick={() => setSelectedMechanic(null)}>
                    <div className="modal modal-large" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                <Wrench size={20} />
                                {selectedMechanic.name}
                            </h3>
                            <button className="modal-close" onClick={() => setSelectedMechanic(null)}>
                                ✕
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="modal-stats-grid">
                                <div className="modal-stat">
                                    <div className="modal-stat-icon kpi-icon-primary">
                                        <Package size={20} />
                                    </div>
                                    <div>
                                        <div className="modal-stat-value">{selectedMechanic.totalOrders}</div>
                                        <div className="modal-stat-label">Órdenes</div>
                                    </div>
                                </div>
                                <div className="modal-stat">
                                    <div className="modal-stat-icon kpi-icon-success">
                                        <CheckCircle size={20} />
                                    </div>
                                    <div>
                                        <div className="modal-stat-value">{selectedMechanic.completedOrders}</div>
                                        <div className="modal-stat-label">Completadas</div>
                                    </div>
                                </div>
                                <div className="modal-stat">
                                    <div className="modal-stat-icon kpi-icon-warning">
                                        <Clock size={20} />
                                    </div>
                                    <div>
                                        <div className="modal-stat-value">{selectedMechanic.activeOrders}</div>
                                        <div className="modal-stat-label">En Proceso</div>
                                    </div>
                                </div>
                                <div className="modal-stat">
                                    <div className="modal-stat-icon kpi-icon-primary">
                                        <DollarSign size={20} />
                                    </div>
                                    <div>
                                        <div className="modal-stat-value">${selectedMechanic.totalRevenue.toLocaleString('es-MX')}</div>
                                        <div className="modal-stat-label">Ingresos</div>
                                    </div>
                                </div>
                            </div>

                            <h4 className="orders-section-title">
                                <Calendar size={18} />
                                Órdenes del Período
                            </h4>

                            <div className="orders-modal-list">
                                {selectedMechanic.orders.map(order => {
                                    const client = clients.find(c => c.id === order.client_id);
                                    const motorcycle = motorcycles.find(m => m.id === order.motorcycle_id);
                                    const status = statuses.find(s => s.name === order.status);

                                    return (
                                        <div
                                            key={order.id}
                                            className="order-modal-item clickable"
                                            onClick={() => handleOrderClick(order.id)}
                                        >
                                            <div className="order-modal-header">
                                                <div className="order-modal-number">{order.order_number}</div>
                                                <div
                                                    className="order-modal-status"
                                                    style={{
                                                        background: `${status?.color}20`,
                                                        color: status?.color
                                                    }}
                                                >
                                                    {order.status}
                                                </div>
                                            </div>
                                            <div className="order-modal-info">
                                                <div className="order-modal-client">
                                                    {client?.full_name || 'Cliente desconocido'}
                                                </div>
                                                <div className="order-modal-motorcycle">
                                                    {motorcycle?.brand} {motorcycle?.model}
                                                </div>
                                            </div>
                                            <div className="order-modal-footer">
                                                <div className="order-modal-date">
                                                    <Calendar size={14} />
                                                    {new Date(order.created_at).toLocaleDateString('es-MX', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric'
                                                    })}
                                                </div>
                                                <div className="order-modal-amount">
                                                    ${(order.total_amount || 0).toLocaleString('es-MX')}
                                                </div>
                                            </div>
                                            <ChevronRight className="order-modal-arrow" size={18} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .mechanics-management {
                    padding-bottom: 80px;
                }

                .page-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: 4px;
                }

                .page-subtitle {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .filter-tabs {
                    display: flex;
                    gap: var(--spacing-xs);
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

                .top-performer-card {
                    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
                    color: white;
                    padding: var(--spacing-lg);
                    border: none;
                }

                .top-performer-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    background: rgba(255, 255, 255, 0.2);
                    padding: var(--spacing-xs) var(--spacing-md);
                    border-radius: var(--radius-full);
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: var(--spacing-md);
                }

                .top-performer-content h2 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: var(--spacing-md);
                }

                .top-stats {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: var(--spacing-md);
                }

                .top-stat {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .top-stat-value {
                    font-size: 1.25rem;
                    font-weight: 700;
                    line-height: 1;
                }

                .top-stat-label {
                    font-size: 0.75rem;
                    opacity: 0.9;
                    margin-top: 2px;
                }

                .mechanics-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .mechanic-stat-card {
                    padding: var(--spacing-lg);
                }

                .mechanic-stat-card.clickable {
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .mechanic-stat-card.clickable:hover {
                    border-color: var(--primary);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
                }

                .mechanic-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-md);
                    padding-bottom: var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                }

                .mechanic-rank {
                    width: 40px;
                    height: 40px;
                    background: var(--primary-light);
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 1rem;
                    color: var(--primary);
                    flex-shrink: 0;
                }

                .mechanic-identity {
                    flex: 1;
                    min-width: 0;
                }

                .mechanic-identity h3 {
                    font-size: 1.125rem;
                    font-weight: 700;
                    margin-bottom: 2px;
                }

                .mechanic-email {
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .mechanic-arrow {
                    color: var(--text-muted);
                    flex-shrink: 0;
                }

                .no-activity {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-lg);
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .mechanic-kpis {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-md);
                }

                .kpi-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .kpi-number {
                    font-size: 1.25rem;
                    font-weight: 700;
                    line-height: 1;
                }

                .kpi-text {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    margin-top: 2px;
                }

                .mechanic-revenue {
                    padding: var(--spacing-md);
                    background: var(--bg-subtle);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                }

                .revenue-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-xs);
                }

                .revenue-label {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .revenue-value {
                    font-size: 1.125rem;
                    font-weight: 700;
                }

                .revenue-breakdown {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.75rem;
                }

                .revenue-item {
                    font-weight: 600;
                }

                .revenue-separator {
                    color: var(--text-muted);
                }

                .mechanic-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-color);
                }

                .footer-metric {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .metric-label {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .metric-value {
                    font-size: 0.9375rem;
                    font-weight: 700;
                }

                .modal-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-xl);
                }

                .modal-stat {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    background: var(--bg-subtle);
                    border-radius: var(--radius-md);
                }

                .modal-stat-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .modal-stat-value {
                    font-size: 1.5rem;
                    font-weight: 700;
                    line-height: 1;
                    color: var(--text-primary);
                }

                .modal-stat-label {
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                    margin-top: 4px;
                }

                .orders-section-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1rem;
                    font-weight: 600;
                    margin-bottom: var(--spacing-md);
                }

                .orders-modal-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                    max-height: 400px;
                    overflow-y: auto;
                }

                .order-modal-item {
                    position: relative;
                    padding: var(--spacing-md);
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .order-modal-item:hover {
                    border-color: var(--primary);
                    transform: translateX(4px);
                }

                .order-modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-sm);
                }

                .order-modal-number {
                    font-weight: 700;
                    font-size: 0.9375rem;
                }

                .order-modal-status {
                    padding: 4px var(--spacing-sm);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .order-modal-info {
                    margin-bottom: var(--spacing-sm);
                }

                .order-modal-client {
                    font-weight: 600;
                    margin-bottom: 2px;
                }

                .order-modal-motorcycle {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .order-modal-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: var(--spacing-sm);
                    border-top: 1px solid var(--border-color);
                }

                .order-modal-date {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .order-modal-amount {
                    font-weight: 700;
                    color: var(--primary);
                }

                .order-modal-arrow {
                    position: absolute;
                    top: 50%;
                    right: var(--spacing-md);
                    transform: translateY(-50%);
                    color: var(--text-muted);
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-2xl);
                }

                .empty-state h3 {
                    font-size: 1.125rem;
                    font-weight: 600;
                }

                .empty-state p {
                    color: var(--text-secondary);
                    text-align: center;
                }
            `}</style>
        </div>
    );
}
