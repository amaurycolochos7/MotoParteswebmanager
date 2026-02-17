import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { orderRequestsService, ordersService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
    ArrowLeft,
    Clock,
    CheckCircle,
    XCircle,
    ChevronRight,
    Loader2,
    Send,
    User,
    Bike,
    Wrench,
    DollarSign,
    Calendar
} from 'lucide-react';

export default function MyRequests() {
    const navigate = useNavigate();
    const { user, requiresApproval } = useAuth();
    const toast = useToast();

    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, pending, approved, rejected
    const [ordersData, setOrdersData] = useState({}); // Cache de datos de órdenes

    useEffect(() => {
        if (!requiresApproval || !requiresApproval()) {
            navigate('/mechanic');
            return;
        }
        loadRequests();
    }, [user, requiresApproval, navigate]);

    const loadRequests = async () => {
        try {
            setLoading(true);
            const data = await orderRequestsService.getMyRequests(user?.id);
            setRequests(data || []);

            // Para solicitudes aprobadas, cargar datos actuales de las órdenes
            const approvedRequests = (data || []).filter(r => r.status === 'approved' && r.created_order_id);
            if (approvedRequests.length > 0) {
                const ordersMap = {};
                for (const req of approvedRequests) {
                    try {
                        const order = await ordersService.getById(req.created_order_id);
                        if (order) {
                            ordersMap[req.created_order_id] = order;
                        }
                    } catch (e) {
                        console.log('Error loading order:', req.created_order_id);
                    }
                }
                setOrdersData(ordersMap);
            }
        } catch (error) {
            console.error('Error loading requests:', error);
            toast.error('Error al cargar solicitudes');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-MX', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatMXN = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    const getStatusInfo = (status) => {
        switch (status) {
            case 'pending':
                return { icon: Clock, label: 'Pendiente', color: 'warning', bg: 'rgba(245, 158, 11, 0.15)' };
            case 'approved':
                return { icon: CheckCircle, label: 'Aprobada', color: 'success', bg: 'rgba(16, 185, 129, 0.15)' };
            case 'rejected':
                return { icon: XCircle, label: 'Rechazada', color: 'danger', bg: 'rgba(239, 68, 68, 0.15)' };
            default:
                return { icon: Clock, label: 'Desconocido', color: 'muted', bg: 'rgba(148, 163, 184, 0.15)' };
        }
    };

    const filteredRequests = requests.filter(req => {
        if (filter === 'all') return true;
        return req.status === filter;
    });

    const counts = {
        all: requests.length,
        pending: requests.filter(r => r.status === 'pending').length,
        approved: requests.filter(r => r.status === 'approved').length,
        rejected: requests.filter(r => r.status === 'rejected').length
    };

    if (loading) {
        return (
            <div className="loading-container">
                <Loader2 className="spinner" size={32} />
                <p>Cargando solicitudes...</p>
            </div>
        );
    }

    return (
        <div className="my-requests">
            {/* Header */}
            <div className="page-header">
                <button className="btn-back" onClick={() => navigate('/mechanic')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="header-content">
                    <h1 className="page-title">
                        <Send size={24} />
                        Mis Solicitudes
                    </h1>
                    <p className="page-subtitle">
                        Historial de solicitudes enviadas
                    </p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="filter-tabs">
                {[
                    { key: 'all', label: 'Todas' },
                    { key: 'pending', label: 'Pendientes' },
                    { key: 'approved', label: 'Aprobadas' },
                    { key: 'rejected', label: 'Rechazadas' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        className={`filter-tab ${filter === tab.key ? 'active' : ''}`}
                        onClick={() => setFilter(tab.key)}
                    >
                        {tab.label}
                        <span className="tab-count">{counts[tab.key]}</span>
                    </button>
                ))}
            </div>

            {/* Requests List */}
            {filteredRequests.length === 0 ? (
                <div className="empty-state">
                    <Send size={48} />
                    <h3>Sin solicitudes</h3>
                    <p>{filter === 'all' ? 'Aún no has enviado solicitudes' : `No tienes solicitudes ${filter === 'pending' ? 'pendientes' : filter === 'approved' ? 'aprobadas' : 'rechazadas'}`}</p>
                </div>
            ) : (
                <div className="requests-list">
                    {filteredRequests.map(request => {
                        const statusInfo = getStatusInfo(request.status);
                        const StatusIcon = statusInfo.icon;
                        const orderData = request.order_data || {};

                        // Si la solicitud está aprobada, usar datos actuales de la orden
                        const actualOrder = request.status === 'approved' && request.created_order_id
                            ? ordersData[request.created_order_id]
                            : null;

                        // Datos para mostrar (de la orden real si existe, sino del request original)
                        const displayData = {
                            clientName: actualOrder?.client?.full_name || orderData.client_name || 'Cliente',
                            motoBrand: actualOrder?.motorcycle?.brand || orderData.moto_brand,
                            motoModel: actualOrder?.motorcycle?.model || orderData.moto_model,
                            servicesCount: actualOrder?.services?.length || orderData.services?.length || 0,
                            totalAmount: actualOrder?.total_amount || orderData.total_amount || 0
                        };

                        return (
                            <div
                                key={request.id}
                                className="request-card"
                                onClick={() => {
                                    if (request.status === 'approved' && request.created_order_id) {
                                        navigate(`/mechanic/order/${request.created_order_id}`);
                                    }
                                }}
                                style={{ cursor: request.status === 'approved' ? 'pointer' : 'default' }}
                            >
                                <div className="request-status" style={{ background: statusInfo.bg }}>
                                    <StatusIcon size={18} style={{ color: `var(--${statusInfo.color})` }} />
                                    <span style={{ color: `var(--${statusInfo.color})` }}>{statusInfo.label}</span>
                                </div>

                                <div className="request-content">
                                    <div className="request-main">
                                        <div className="client-info">
                                            <User size={16} />
                                            <strong>{displayData.clientName}</strong>
                                        </div>
                                        <div className="moto-info">
                                            <Bike size={16} />
                                            <span>{displayData.motoBrand} {displayData.motoModel}</span>
                                        </div>
                                    </div>

                                    <div className="request-meta">
                                        <div className="meta-item">
                                            <Wrench size={14} />
                                            <span>{displayData.servicesCount} servicios</span>
                                        </div>
                                        <div className="meta-item">
                                            <DollarSign size={14} />
                                            <span>{formatMXN(displayData.totalAmount)}</span>
                                        </div>
                                        <div className="meta-item">
                                            <Calendar size={14} />
                                            <span>{formatDate(request.created_at)}</span>
                                        </div>
                                    </div>

                                    {/* Master info */}
                                    <div className="master-info">
                                        <span>Enviada a: </span>
                                        <strong>{request.master?.full_name || 'Mecánico Maestro'}</strong>
                                    </div>

                                    {/* Rejection notes */}
                                    {request.status === 'rejected' && request.response_notes && (
                                        <div className="rejection-notes">
                                            <strong>Motivo:</strong> {request.response_notes}
                                        </div>
                                    )}

                                    {/* Link to order if approved */}
                                    {request.status === 'approved' && request.created_order_id && (
                                        <div className="order-link">
                                            <span>Ver orden creada</span>
                                            <ChevronRight size={16} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                .my-requests {
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

                .filter-tabs {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--spacing-xs);
                    margin-bottom: var(--spacing-lg);
                }

                .filter-tab {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: var(--spacing-xs) var(--spacing-sm);
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-full);
                    color: var(--text-secondary);
                    font-size: 0.8125rem;
                    white-space: nowrap;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .filter-tab.active {
                    background: var(--primary);
                    color: white;
                    border-color: var(--primary);
                }

                .tab-count {
                    background: rgba(0,0,0,0.1);
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .filter-tab.active .tab-count {
                    background: rgba(255,255,255,0.2);
                }

                .requests-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .request-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                }

                .request-status {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-sm) var(--spacing-md);
                    font-size: 0.8125rem;
                    font-weight: 600;
                }

                .request-content {
                    padding: var(--spacing-md);
                }

                .request-main {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                    margin-bottom: var(--spacing-sm);
                }

                .client-info, .moto-info {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                }

                .client-info strong {
                    font-size: 1rem;
                }

                .moto-info {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .request-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-sm);
                }

                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }

                .master-info {
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                    padding-top: var(--spacing-sm);
                    border-top: 1px dashed var(--border-color);
                }

                .rejection-notes {
                    margin-top: var(--spacing-sm);
                    padding: var(--spacing-sm);
                    background: rgba(239, 68, 68, 0.1);
                    border-radius: var(--radius-sm);
                    font-size: 0.8125rem;
                    color: var(--danger);
                }

                .order-link {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: var(--spacing-sm);
                    padding: var(--spacing-sm);
                    background: rgba(16, 185, 129, 0.1);
                    border-radius: var(--radius-sm);
                    color: var(--success);
                    font-weight: 500;
                    font-size: 0.875rem;
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
