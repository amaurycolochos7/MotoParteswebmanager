import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { earningsService, paymentRequestsService, orderRequestsService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
    ArrowLeft,
    Users,
    DollarSign,
    TrendingUp,
    Calendar,
    ChevronDown,
    ChevronUp,
    Loader2,
    Crown,
    CheckCircle,
    Clock,
    Percent,
    Bike,
    History,
    User
} from 'lucide-react';

export default function AuxiliaryDashboard() {
    const navigate = useNavigate();
    const { user, isMasterMechanic } = useAuth();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [auxiliaryData, setAuxiliaryData] = useState([]);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [selectedWeek, setSelectedWeek] = useState(() => getWeekStart(new Date()));
    const [expandedAuxiliary, setExpandedAuxiliary] = useState(null);
    const [expandedPayment, setExpandedPayment] = useState(null);
    const [initiatingPayment, setInitiatingPayment] = useState(null);
    const [activeTab, setActiveTab] = useState('auxiliaries'); // auxiliaries, payments

    useEffect(() => {
        if (!isMasterMechanic || !isMasterMechanic()) {
            navigate('/mechanic');
            return;
        }
        loadAuxiliaryData();
    }, [user, isMasterMechanic, navigate, selectedWeek]);

    const loadAuxiliaryData = async () => {
        try {
            setLoading(true);
            const [data, history] = await Promise.all([
                // Use getAuxiliariesWithStats to get auxiliaries from order_requests
                orderRequestsService.getAuxiliariesWithStats(user?.id),
                paymentRequestsService.getHistoryForMaster(user?.id)
            ]);
            setAuxiliaryData(data || []);
            setPaymentHistory(history || []);
        } catch (error) {
            console.error('Error loading auxiliary data:', error);
            toast.error('Error al cargar datos de auxiliares');
        } finally {
            setLoading(false);
        }
    };

    const handleInitiatePayment = async (aux) => {
        try {
            setInitiatingPayment(aux.mechanic_id);

            // Create payment request
            await paymentRequestsService.create({
                from_master_id: user?.id,
                to_auxiliary_id: aux.mechanic_id,
                total_amount: aux.pending_payment,
                labor_amount: aux.total_labor,
                commission_percentage: aux.commission_percentage || 10,
                orders_summary: aux.pending_orders_list || [],
                earning_ids: aux.pending_orders_list?.map(o => o.earning_id).filter(Boolean) || [],
                notes: `Pago Liquidación - ${aux.total_orders} órdenes`
            });

            toast.success(`Solicitud de pago enviada a ${aux.mechanic_name}`);
            await loadAuxiliaryData();
        } catch (error) {
            console.error('Error initiating payment:', error);
            toast.error('Error al iniciar pago');
        } finally {
            setInitiatingPayment(null);
        }
    };

    // Get start of week (Monday)
    function getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // Format currency
    const formatMXN = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    // Format date range (week)
    const formatWeekRange = (startDate) => {
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 5); // Lunes a Sábado

        const options = { day: 'numeric', month: 'short' };
        return `${start.toLocaleDateString('es-MX', options)} - ${end.toLocaleDateString('es-MX', options)}`;
    };

    // Generate week options (last 8 weeks)
    const weekOptions = useMemo(() => {
        const weeks = [];
        const today = new Date();
        for (let i = 0; i < 8; i++) {
            const weekStart = getWeekStart(new Date(today));
            weekStart.setDate(weekStart.getDate() - (i * 7));
            weeks.push(weekStart);
        }
        return weeks;
    }, []);

    // Filter to only show auxiliaries with pending payments
    const unpaidAuxiliaries = useMemo(() => {
        return auxiliaryData.filter(aux => aux.pending_payment > 0);
    }, [auxiliaryData]);

    // Calculate totals from all active auxiliaries
    const totals = useMemo(() => {
        return auxiliaryData.reduce((acc, aux) => ({
            pendingOrders: acc.pendingOrders + (aux.total_orders || 0),
            pendingLabor: acc.pendingLabor + (aux.total_labor || 0),
            pendingPayment: acc.pendingPayment + (aux.pending_payment || 0)
        }), { pendingOrders: 0, pendingLabor: 0, pendingPayment: 0 });
    }, [auxiliaryData]);

    if (loading) {
        return (
            <div className="loading-container">
                <Loader2 className="spinner" size={32} />
                <p>Cargando información de auxiliares...</p>
            </div>
        );
    }

    return (
        <div className="auxiliary-dashboard">
            {/* Header */}
            <div className="page-header">
                <button className="btn-back" onClick={() => navigate('/mechanic')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="header-content">
                    <h1 className="page-title">
                        <Users size={24} />
                        Control de Auxiliares
                    </h1>
                    <p className="page-subtitle">
                        Resumen de ganancias y trabajo
                    </p>
                </div>
            </div>

            {/* Summary Cards - Only show pending amounts */}
            <div className="summary-cards">
                <div className="summary-card">
                    <div className="card-icon orders">
                        <Bike size={20} />
                    </div>
                    <div className="card-content">
                        <span className="card-value">{totals.pendingOrders}</span>
                        <span className="card-label">Órdenes Pendientes</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="card-icon labor">
                        <DollarSign size={20} />
                    </div>
                    <div className="card-content">
                        <span className="card-value">{formatMXN(totals.pendingLabor)}</span>
                        <span className="card-label">Mano de Obra</span>
                    </div>
                </div>
                <div className="summary-card highlight">
                    <div className="card-icon earned">
                        <TrendingUp size={20} />
                    </div>
                    <div className="card-content">
                        <span className="card-value">{formatMXN(totals.pendingPayment)}</span>
                        <span className="card-label">A Pagar</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="dashboard-tabs">
                <button
                    className={`tab ${activeTab === 'auxiliaries' ? 'active' : ''}`}
                    onClick={() => setActiveTab('auxiliaries')}
                >
                    <Users size={18} />
                    Auxiliares
                    <span className="tab-count">{auxiliaryData.length}</span>
                </button>
                <button
                    className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
                    onClick={() => setActiveTab('payments')}
                >
                    <History size={18} />
                    Historial Pagos
                    <span className="tab-count">{paymentHistory.length}</span>
                </button>
            </div>

            {/* Auxiliaries Tab */}
            {activeTab === 'auxiliaries' && (
                <>
                    {/* Auxiliary List - Show all auxiliaries with activity */}
                    <div className="section-header">
                        <h2>Mecánicos Auxiliares</h2>
                        <span className="count-badge">{auxiliaryData.length}</span>
                    </div>

                    {auxiliaryData.length === 0 ? (
                        <div className="empty-state">
                            <Users size={48} />
                            <h3>Sin pagos pendientes</h3>
                            <p>Todos los auxiliares están al corriente</p>
                        </div>
                    ) : (
                        <div className="auxiliary-list">
                            {auxiliaryData.map(aux => {
                                const isExpanded = expandedAuxiliary === aux.mechanic_id;

                                return (
                                    <div key={aux.mechanic_id} className="auxiliary-card">
                                        <div
                                            className="auxiliary-header"
                                            onClick={() => setExpandedAuxiliary(isExpanded ? null : aux.mechanic_id)}
                                        >
                                            <div className="aux-info">
                                                <div className="aux-avatar">
                                                    {aux.mechanic_name?.charAt(0) || 'A'}
                                                </div>
                                                <div className="aux-details">
                                                    <strong>{aux.mechanic_name}</strong>
                                                    <span className="aux-stats">
                                                        {aux.total_orders} órdenes
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="aux-earnings">
                                                <span className="earnings-amount">{formatMXN(aux.pending_payment)}</span>
                                                <span className="earnings-label">a pagar</span>
                                            </div>
                                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                        </div>

                                        {isExpanded && (
                                            <div className="auxiliary-details">
                                                <div className="detail-row">
                                                    <span className="detail-label">
                                                        <Bike size={14} /> Órdenes completadas
                                                    </span>
                                                    <span className="detail-value">{aux.total_orders}</span>
                                                </div>
                                                <div className="detail-row">
                                                    <span className="detail-label">
                                                        <DollarSign size={14} /> Mano de obra total
                                                    </span>
                                                    <span className="detail-value">{formatMXN(aux.total_labor)}</span>
                                                </div>
                                                <div className="detail-row">
                                                    <span className="detail-label">
                                                        <Percent size={14} /> Comisión ({aux.commission_percentage || 10}%)
                                                    </span>
                                                    <span className="detail-value">{formatMXN(aux.total_earned)}</span>
                                                </div>
                                                <div className="detail-row highlight">
                                                    <span className="detail-label">
                                                        <DollarSign size={14} /> Total a liquidar
                                                    </span>
                                                    <span className="detail-value success">{formatMXN(aux.pending_payment)}</span>
                                                </div>

                                                {/* Breakdown of pending orders */}
                                                {aux.pending_orders_list?.length > 0 && (
                                                    <div className="pending-orders-breakdown">
                                                        <div className="breakdown-header">
                                                            <span>Órdenes por Liquidar</span>
                                                            <Clock size={14} />
                                                        </div>
                                                        <div className="breakdown-list">
                                                            {aux.pending_orders_list.map(order => (
                                                                <div
                                                                    key={order.id}
                                                                    className="breakdown-item clickable"
                                                                    onClick={() => navigate(`/mechanic/order/${order.id}`)}
                                                                >
                                                                    <div className="order-tag">#{order.order_number}</div>
                                                                    <div className="order-amt">
                                                                        <span>Comisión:</span>
                                                                        <strong>{formatMXN(order.commission)}</strong>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="actions">
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => navigate(`/mechanic/auxiliary/${aux.mechanic_id}/orders`)}
                                                    >
                                                        <Clock size={14} />
                                                        Ver historial
                                                    </button>
                                                    <button
                                                        className="btn btn-sm btn-success"
                                                        onClick={() => handleInitiatePayment(aux)}
                                                        disabled={initiatingPayment === aux.mechanic_id || aux.pending_payment <= 0}
                                                    >
                                                        {initiatingPayment === aux.mechanic_id ? (
                                                            <>
                                                                <Loader2 size={14} className="spinner" />
                                                                Enviando...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CheckCircle size={14} />
                                                                Iniciar Pago
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                    }
                </>
            )}

            {/* Payments Tab */}
            {activeTab === 'payments' && (
                <div className="payments-history">
                    <div className="section-header">
                        <h2>Historial de Pagos</h2>
                        <span className="count-badge">{paymentHistory.length}</span>
                    </div>

                    {paymentHistory.length === 0 ? (
                        <div className="empty-state">
                            <History size={48} />
                            <h3>Sin pagos registrados</h3>
                            <p>Los pagos realizados aparecerán aquí</p>
                        </div>
                    ) : (
                        <div className="payment-history-list">
                            {paymentHistory.map(payment => {
                                const isExpanded = expandedPayment === payment.id;
                                const isPending = payment.status === 'pending';
                                const formatPaymentDate = (date) => new Date(date).toLocaleDateString('es-MX', {
                                    day: 'numeric', month: 'short', year: 'numeric'
                                });

                                return (
                                    <div key={payment.id} className={`payment-card ${payment.status}`}>
                                        <div
                                            className="payment-header"
                                            onClick={() => setExpandedPayment(isExpanded ? null : payment.id)}
                                        >
                                            <div className="payment-info">
                                                <div className="payment-identifier">
                                                    <span className="folio-badge">{payment.payment_number || 'S/F'}</span>
                                                </div>
                                                <div className="payment-status-badge">
                                                    {isPending ? <Clock size={14} /> : <CheckCircle size={14} />}
                                                    {isPending ? 'Pendiente' : 'Aceptado'}
                                                </div>
                                                <div className="payment-aux">
                                                    <User size={14} />
                                                    {payment.auxiliary?.full_name || payment.auxiliary_name || 'Auxiliar'}
                                                </div>
                                                <div className="payment-date">
                                                    {formatPaymentDate(payment.created_at)}
                                                </div>
                                            </div>
                                            <div className="payment-amount">
                                                {formatMXN(payment.total_amount)}
                                            </div>
                                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>

                                        {isExpanded && (
                                            <div className="payment-details">
                                                <div className="detail-row">
                                                    <span>Mano de obra:</span>
                                                    <strong>{formatMXN(payment.labor_amount)}</strong>
                                                </div>
                                                <div className="detail-row">
                                                    <span>Comisión pagada:</span>
                                                    <strong className="success">{formatMXN(payment.total_amount)}</strong>
                                                </div>
                                                {payment.notes && (
                                                    <div className="payment-notes">{payment.notes}</div>
                                                )}
                                                {payment.responded_at && (
                                                    <div className="accepted-date">
                                                        Aceptado: {formatPaymentDate(payment.responded_at)}
                                                    </div>
                                                )}

                                                {/* Action buttons */}
                                                <div className="payment-actions">
                                                    <button
                                                        className="btn btn-sm btn-outline"
                                                        onClick={() => navigate(`/mechanic/auxiliary/${payment.to_auxiliary_id}/orders`)}
                                                    >
                                                        <Bike size={14} />
                                                        Ver Órdenes
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <style>{`
                .auxiliary-dashboard {
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

                .week-selector {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-card);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                    color: var(--text-secondary);
                }

                .week-select {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: var(--text-primary);
                    font-size: 0.9375rem;
                    font-weight: 500;
                    cursor: pointer;
                }

                .summary-cards {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
                }

                .summary-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-md);
                    padding: var(--spacing-md);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-xs);
                }

                .summary-card.highlight {
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                }

                .card-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .card-icon.orders { background: rgba(59, 130, 246, 0.15); color: var(--info); }
                .card-icon.labor { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
                .card-icon.earned { background: rgba(16, 185, 129, 0.15); color: var(--success); }

                .card-content {
                    text-align: center;
                }

                .card-value {
                    display: block;
                    font-size: 1rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .card-label {
                    font-size: 0.6875rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: var(--spacing-md);
                }

                .section-header h2 {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0;
                }

                .count-badge {
                    background: var(--primary);
                    color: white;
                    font-size: 0.75rem;
                    font-weight: 600;
                    padding: 2px 8px;
                    border-radius: 10px;
                }

                .auxiliary-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .auxiliary-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                }

                .auxiliary-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .auxiliary-header:hover {
                    background: var(--bg-hover);
                }

                .aux-info {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .aux-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 1rem;
                }

                .aux-details strong {
                    display: block;
                    font-size: 0.9375rem;
                }

                .aux-stats {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }

                .aux-earnings {
                    text-align: right;
                }

                .earnings-amount {
                    display: block;
                    font-size: 1rem;
                    font-weight: 700;
                    color: var(--success);
                }

                .earnings-label {
                    font-size: 0.6875rem;
                    color: var(--text-muted);
                }

                .auxiliary-details {
                    padding: var(--spacing-md);
                    border-top: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                }

                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-xs) 0;
                }

                .detail-row.highlight {
                    background: rgba(16, 185, 129, 0.1);
                    margin: var(--spacing-sm) calc(-1 * var(--spacing-md));
                    padding: var(--spacing-sm) var(--spacing-md);
                }

                .detail-label {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .detail-value {
                    font-weight: 600;
                }

                .detail-value.success {
                    color: var(--success);
                    font-size: 1rem;
                }

                .detail-value.paid {
                    color: var(--primary);
                    font-size: 0.9rem;
                    opacity: 0.8;
                }

                .pending-orders-breakdown {
                    margin: var(--spacing-sm) 0;
                    background: var(--bg-card);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                }

                .breakdown-header {
                    background: var(--bg-tertiary);
                    padding: var(--spacing-xs) var(--spacing-sm);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    border-bottom: 1px solid var(--border-color);
                }

                .breakdown-list {
                    display: flex;
                    flex-direction: column;
                }

                .breakdown-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-sm);
                    border-bottom: 1px solid var(--border-color);
                    transition: background 0.2s;
                }

                .breakdown-item.clickable {
                    cursor: pointer;
                }

                .breakdown-item.clickable:hover {
                    background: rgba(124, 58, 237, 0.05);
                }

                .breakdown-item.clickable:active {
                    background: rgba(124, 58, 237, 0.1);
                }

                .breakdown-item:last-child {
                    border-bottom: none;
                }

                .order-tag {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--primary);
                    background: rgba(124, 58, 237, 0.1);
                    padding: 2px 8px;
                    border-radius: 4px;
                }

                .order-amt {
                    text-align: right;
                    font-size: 0.8125rem;
                }

                .order-amt span {
                    color: var(--text-muted);
                    margin-right: var(--spacing-xs);
                }

                .actions {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-top: var(--spacing-md);
                }

                .actions .btn {
                    flex: 1;
                    font-size: 0.8125rem;
                }

                .btn-sm {
                    padding: var(--spacing-xs) var(--spacing-sm);
                }

                .btn-outline {
                    background: transparent;
                    border: 1px solid var(--border-color);
                    color: var(--text-primary);
                }

                .btn-success {
                    background: var(--success);
                    color: white;
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

                .dashboard-tabs {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
                }

                .dashboard-tabs .tab {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-md);
                    border: 2px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    background: var(--bg-card);
                    color: var(--text-secondary);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .dashboard-tabs .tab.active {
                    border-color: var(--primary);
                    color: var(--primary);
                    background: rgba(124, 58, 237, 0.1);
                }

                .dashboard-tabs .tab-count {
                    background: rgba(0,0,0,0.1);
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 0.75rem;
                }

                .dashboard-tabs .tab.active .tab-count {
                    background: rgba(124, 58, 237, 0.2);
                }

                .payment-history-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .payment-history-list .payment-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                }

                .payment-history-list .payment-card.pending {
                    border-left: 4px solid var(--warning);
                }

                .payment-history-list .payment-card.accepted {
                    border-left: 4px solid var(--success);
                }

                .payment-history-list .payment-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    cursor: pointer;
                }

                .payment-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .folio-badge {
                    display: inline-block;
                    font-family: monospace;
                    font-weight: 700;
                    font-size: 0.75rem;
                    background: var(--bg-input);
                    color: var(--text-primary);
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--border-color);
                    margin-bottom: 4px;
                }

                .payment-status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    padding: 2px 8px;
                    border-radius: var(--radius-sm);
                    background: rgba(16, 185, 129, 0.15);
                    color: var(--success);
                    margin-bottom: 4px;
                }

                .payment-card.pending .payment-status-badge {
                    background: rgba(245, 158, 11, 0.15);
                    color: var(--warning);
                }

                .payment-aux {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.9375rem;
                    font-weight: 600;
                }

                .payment-history-list .payment-date {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }

                .payment-history-list .payment-amount {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--success);
                }

                .payment-history-list .payment-details {
                    padding: var(--spacing-md);
                    border-top: 1px dashed var(--border-color);
                    background: var(--bg-input);
                }

                .payment-history-list .payment-notes {
                    padding: var(--spacing-sm);
                    background: rgba(148, 163, 184, 0.1);
                    border-radius: var(--radius-sm);
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                    margin-top: var(--spacing-sm);
                }

                .accepted-date {
                    font-size: 0.75rem;
                    color: var(--success);
                    margin-top: var(--spacing-sm);
                }

                .payment-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-color);
                }

                .payment-actions .btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }
            `}</style>
        </div>
    );
}
