import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowLeft, History, AlertCircle, User, Wrench, Calendar, DollarSign } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { authService, ordersService } from '../../lib/api';

export default function AuxiliaryOrders() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { statuses } = useData();
    const [mechanic, setMechanic] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                // 1. Obtener datos del mecánico auxiliar
                const mechanicData = await authService.getProfile(id);
                setMechanic(mechanicData);

                // 2. Obtener TODAS las órdenes del auxiliar
                const history = await ordersService.getByMechanic(id);
                setOrders(history || []);
            } catch (error) {
                console.error('Error loading auxiliary history:', error);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            loadData();
        }
    }, [id]);

    const formatMXN = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-MX', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const getStatusColor = (status) => {
        const terminalStatus = statuses?.find(s => s.is_terminal);
        if (status?.id === terminalStatus?.id) return 'var(--success)';
        return 'var(--primary)';
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner spinner-lg"></div>
                <p>Cargando historial...</p>
            </div>
        );
    }

    if (!mechanic) {
        return (
            <div className="empty-state">
                <AlertCircle size={48} />
                <h2>Mecánico no encontrado</h2>
                <button className="btn btn-primary" onClick={() => navigate('/mechanic/auxiliaries')}>
                    Volver a Auxiliares
                </button>
            </div>
        );
    }

    return (
        <div className="auxiliary-orders-page">
            {/* Header */}
            <div className="page-header">
                <button className="btn-back" onClick={() => navigate('/mechanic/auxiliaries')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="header-content">
                    <h1 className="page-title">
                        <History size={24} />
                        Historial de {mechanic.full_name}
                    </h1>
                    <p className="page-subtitle">
                        {orders.length} servicios registrados
                    </p>
                </div>
            </div>

            {/* Orders List */}
            {orders.length === 0 ? (
                <div className="empty-state">
                    <ClipboardList size={48} />
                    <h3>Sin historial</h3>
                    <p>Este auxiliar aún no ha realizado servicios.</p>
                </div>
            ) : (
                <div className="orders-list">
                    {orders.map(order => (
                        <div
                            key={order.id}
                            className="order-card"
                            onClick={() => navigate(`/mechanic/order/${order.id}`)}
                        >
                            <div className="order-header">
                                <span className="order-number">{order.order_number}</span>
                                <span
                                    className="order-status"
                                    style={{ color: getStatusColor(order.status) }}
                                >
                                    {order.status?.name || 'Pendiente'}
                                </span>
                            </div>

                            <div className="order-body">
                                <div className="order-info">
                                    <User size={14} />
                                    <span>{order.client?.full_name || 'Cliente'}</span>
                                </div>
                                <div className="order-info">
                                    <Wrench size={14} />
                                    <span>{order.motorcycle?.brand} {order.motorcycle?.model}</span>
                                </div>
                            </div>

                            <div className="order-footer">
                                <div className="order-date">
                                    <Calendar size={12} />
                                    {formatDate(order.created_at)}
                                </div>
                                <div className="order-total">
                                    <DollarSign size={14} />
                                    {formatMXN(order.total_amount)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <style>{`
                .auxiliary-orders-page {
                    padding: var(--spacing-md);
                    padding-bottom: 100px;
                    max-width: 600px;
                    margin: 0 auto;
                }

                .page-header {
                    display: flex;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }

                .btn-back {
                    padding: var(--spacing-sm);
                    border-radius: var(--radius-md);
                    border: none;
                    background: var(--bg-card);
                    color: var(--text-primary);
                    cursor: pointer;
                }

                .page-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin: 0;
                    color: var(--primary);
                }

                .page-subtitle {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    margin: 0;
                }

                .orders-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .order-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    padding: var(--spacing-md);
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .order-card:hover {
                    border-color: var(--primary);
                    transform: translateY(-2px);
                }

                .order-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-sm);
                }

                .order-number {
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .order-status {
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .order-body {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    margin-bottom: var(--spacing-sm);
                }

                .order-info {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .order-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: var(--spacing-sm);
                    border-top: 1px dashed var(--border-color);
                }

                .order-date {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }

                .order-total {
                    display: flex;
                    align-items: center;
                    font-weight: 600;
                    color: var(--success);
                }

                .empty-state {
                    text-align: center;
                    padding: var(--spacing-xl);
                    color: var(--text-muted);
                }

                .empty-state svg {
                    opacity: 0.5;
                    margin-bottom: var(--spacing-md);
                }

                .empty-state h3 {
                    color: var(--text-primary);
                    margin: 0 0 var(--spacing-xs);
                }

                .loading-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 300px;
                    gap: var(--spacing-md);
                    color: var(--text-muted);
                }
            `}</style>
        </div>
    );
}
