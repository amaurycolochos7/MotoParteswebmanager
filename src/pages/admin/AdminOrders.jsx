import { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Link } from 'react-router-dom';
import {
    Search,
    Filter,
    Eye,
    Phone,
    Calendar,
    DollarSign,
    Clock,
    CheckCircle,
    XCircle,
    Trash2
} from 'lucide-react';
import OrderCard from '../../components/ui/OrderCard';

export default function AdminOrders() {
    const { orders, statuses, loading, deleteOrder } = useData();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [paidFilter, setPaidFilter] = useState('all');

    // Filtrar órdenes
    const filteredOrders = useMemo(() => {
        return orders.filter(order => {
            // Búsqueda
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm ||
                order.order_number?.toLowerCase().includes(searchLower) ||
                order.client?.full_name?.toLowerCase().includes(searchLower) ||
                order.client?.phone?.includes(searchTerm) ||
                order.motorcycle?.brand?.toLowerCase().includes(searchLower) ||
                order.motorcycle?.model?.toLowerCase().includes(searchLower);

            // Filtro de estado
            const matchesStatus = statusFilter === 'all' ||
                order.status?.name === statusFilter;

            // Filtro de pago
            const matchesPaid = paidFilter === 'all' ||
                (paidFilter === 'paid' && order.is_paid) ||
                (paidFilter === 'pending' && !order.is_paid);

            return matchesSearch && matchesStatus && matchesPaid;
        });
    }, [orders, searchTerm, statusFilter, paidFilter]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className="loading-overlay" style={{ position: 'relative', minHeight: 400 }}>
                <div className="spinner spinner-lg"></div>
                <p>Cargando órdenes...</p>
            </div>
        );
    }

    return (
        <div className="admin-orders">
            {/* Header */}
            <div className="page-header flex justify-between items-center">
                <div>
                    <h1 className="page-title">Órdenes de Servicio</h1>
                    <p className="page-subtitle">
                        {filteredOrders.length} órdenes encontradas
                    </p>
                </div>
            </div>

            {/* Filtros */}
            <div className="filters-bar">
                <div className="search-box">
                    <Search size={20} className="search-icon" />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Buscar por número, cliente, moto..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    <select
                        className="form-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">Todos los estados</option>
                        {statuses.map(status => (
                            <option key={status.id} value={status.name}>
                                {status.name}
                            </option>
                        ))}
                    </select>

                    <select
                        className="form-select"
                        value={paidFilter}
                        onChange={(e) => setPaidFilter(e.target.value)}
                    >
                        <option value="all">Pago: Todos</option>
                        <option value="paid">Pagadas</option>
                        <option value="pending">Pendientes</option>
                    </select>
                </div>
            </div>

            {/* Lista de órdenes */}
            {filteredOrders.length === 0 ? (
                <div className="card">
                    <div className="card-body">
                        <div className="empty-state">
                            <Clock size={48} className="empty-state-icon" />
                            <p className="empty-state-title">No hay órdenes</p>
                            <p className="empty-state-message">
                                {searchTerm || statusFilter !== 'all' || paidFilter !== 'all'
                                    ? 'No se encontraron órdenes con los filtros aplicados'
                                    : 'Aún no hay órdenes registradas'}
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Vista Desktop (Tabla) */}
                    <div className="card hidden-mobile">
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Orden</th>
                                        <th>Cliente</th>
                                        <th>Moto</th>
                                        <th>Mecánico</th>
                                        <th>Estado</th>
                                        <th>Total</th>
                                        <th>Pago</th>
                                        <th>Fecha</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredOrders.map(order => (
                                        <tr key={order.id}>
                                            <td>
                                                <span className="order-number-cell">
                                                    {order.order_number}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="client-cell">
                                                    <strong>{order.client?.full_name || 'Sin cliente'}</strong>
                                                    {order.client?.phone && (
                                                        <span className="client-phone">
                                                            <Phone size={12} />
                                                            {order.client.phone}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="moto-cell">
                                                    <strong>{order.motorcycle?.brand} {order.motorcycle?.model}</strong>
                                                    <span>{order.motorcycle?.year} • {order.motorcycle?.plates || 'Sin placas'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                {order.mechanic ? (
                                                    <Link
                                                        to={`/admin/users/${order.mechanic.id}/orders`}
                                                        className="mechanic-link"
                                                        title="Ver historial del mecánico"
                                                    >
                                                        {order.mechanic.full_name}
                                                    </Link>
                                                ) : (
                                                    <span className="text-muted">Sin asignar</span>
                                                )}
                                            </td>
                                            <td>
                                                <span
                                                    className="badge badge-status"
                                                    style={{
                                                        background: `${order.status?.color}20`,
                                                        color: order.status?.color
                                                    }}
                                                >
                                                    {order.status?.name || 'Sin estado'}
                                                </span>
                                            </td>
                                            <td>
                                                <strong>{formatCurrency(order.total_amount)}</strong>
                                            </td>
                                            <td>
                                                {order.is_paid ? (
                                                    <span className="badge badge-success">
                                                        <CheckCircle size={12} />
                                                        Pagada
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-warning">
                                                        <Clock size={12} />
                                                        Pendiente
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="date-cell">
                                                    <Calendar size={12} />
                                                    {formatDate(order.created_at)}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <Link
                                                        to={`/admin/order/${order.id}`}
                                                        className="btn btn-ghost btn-icon-sm"
                                                        title="Ver detalle"
                                                    >
                                                        <Eye size={18} />
                                                    </Link>
                                                    <button
                                                        className="btn btn-ghost btn-icon-sm"
                                                        title="Eliminar orden"
                                                        style={{ color: 'var(--danger)' }}
                                                        onClick={() => {
                                                            if (window.confirm(`¿Eliminar orden ${order.order_number}?`)) {
                                                                deleteOrder(order.id);
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Vista Móvil (Tarjetas) */}
                    <div className="orders-list-mobile">
                        {filteredOrders.map(order => (
                            <OrderCard
                                key={order.id}
                                order={order}
                                statuses={statuses}
                                baseUrl="/admin/order"
                                onDelete={deleteOrder}
                            />
                        ))}
                    </div>
                </>
            )
            }

            <style>{`
                .filters-bar {
                    display: flex;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                    flex-wrap: wrap;
                }

                .filters-bar .search-box {
                    flex: 1;
                    min-width: 250px;
                }

                .filter-group {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .filter-group .form-select {
                    min-width: 150px;
                }

                .order-number-cell {
                    font-weight: 700;
                    color: var(--primary);
                }

                .client-cell,
                .moto-cell {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .client-cell strong,
                .moto-cell strong {
                    font-weight: 600;
                }

                .client-phone {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                }

                .moto-cell span {
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                }

                .date-cell {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .mechanic-link {
                    color: var(--primary);
                    text-decoration: none;
                    font-weight: 500;
                }

                .mechanic-link:hover {
                    text-decoration: underline;
                }

                @media (max-width: 1024px) {
                    .hidden-mobile {
                        display: none;
                    }
                    
                    .orders-list-mobile {
                        display: flex;
                        flex-direction: column;
                        gap: var(--spacing-md);
                    }
                }

                @media (min-width: 1025px) {
                    .orders-list-mobile {
                        display: none;
                    }
                }
            `}</style>
        </div >
    );
}
