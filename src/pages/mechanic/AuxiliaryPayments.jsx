import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { paymentRequestsService } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { generatePaymentReceipt } from '../../components/ui/PaymentReceiptDownload';
import {
    ArrowLeft,
    DollarSign,
    CheckCircle,
    Clock,
    ChevronDown,
    ChevronUp,
    Loader2,
    FileText,
    User,
    Calendar,
    Wrench,
    Download
} from 'lucide-react';

export default function AuxiliaryPayments() {
    const navigate = useNavigate();
    const { user, requiresApproval } = useAuth();
    const toast = useToast();

    const [pendingPayments, setPendingPayments] = useState([]);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedPayment, setExpandedPayment] = useState(null);
    const [accepting, setAccepting] = useState(null);
    const [downloading, setDownloading] = useState(null);
    const [activeTab, setActiveTab] = useState('pending');

    useEffect(() => {
        if (!requiresApproval || !requiresApproval()) {
            navigate('/mechanic');
            return;
        }
        loadPayments();
    }, [user, requiresApproval, navigate]);

    const loadPayments = async () => {
        try {
            setLoading(true);
            const [pending, history] = await Promise.all([
                paymentRequestsService.getPendingForAuxiliary(user?.id),
                paymentRequestsService.getHistoryForAuxiliary(user?.id)
            ]);
            setPendingPayments(pending || []);
            setPaymentHistory(history || []);
        } catch (error) {
            console.error('Error loading payments:', error);
            toast.error('Error al cargar pagos');
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptPayment = async (payment) => {
        try {
            setAccepting(payment.id);
            const acceptedPayment = await paymentRequestsService.accept(payment.id, user?.id);
            toast.success('¡Pago aceptado! Descargando comprobante...');

            // Auto-download receipt
            const paymentWithDates = {
                ...payment,
                responded_at: new Date().toISOString(),
                commission_percentage: user?.commission_percentage || payment.commission_percentage
            };
            await generatePaymentReceipt(paymentWithDates, true);

            await loadPayments();
        } catch (error) {
            console.error('Error accepting payment:', error);
            toast.error('Error al aceptar el pago');
        } finally {
            setAccepting(null);
        }
    };

    const handleDownloadReceipt = async (payment) => {
        try {
            setDownloading(payment.id);
            const paymentWithCommission = {
                ...payment,
                commission_percentage: user?.commission_percentage || payment.commission_percentage
            };
            await generatePaymentReceipt(paymentWithCommission, true);
            toast.success('Comprobante descargado');
        } catch (error) {
            console.error('Error downloading receipt:', error);
            toast.error('Error al descargar');
        } finally {
            setDownloading(null);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('es-MX', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
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

    if (loading) {
        return (
            <div className="loading-container">
                <Loader2 className="spinner" size={32} />
                <p>Cargando pagos...</p>
            </div>
        );
    }

    return (
        <div className="auxiliary-payments">
            {/* Header */}
            <div className="page-header">
                <button className="btn-back" onClick={() => navigate('/mechanic')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="header-content">
                    <h1 className="page-title">
                        <DollarSign size={24} />
                        Mis Pagos
                    </h1>
                    <p className="page-subtitle">
                        Acepta pagos y revisa tu historial
                    </p>
                </div>
            </div>

            {/* Tabs */}
            <div className="payment-tabs">
                <button
                    className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
                    onClick={() => setActiveTab('pending')}
                >
                    <Clock size={18} />
                    Pendientes
                    {pendingPayments.length > 0 && (
                        <span className="tab-badge">{pendingPayments.length}</span>
                    )}
                </button>
                <button
                    className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    <CheckCircle size={18} />
                    Historial
                </button>
            </div>

            {/* Pending Payments */}
            {activeTab === 'pending' && (
                <div className="payments-section">
                    {pendingPayments.length === 0 ? (
                        <div className="empty-state">
                            <Clock size={48} />
                            <h3>Sin pagos pendientes</h3>
                            <p>No tienes pagos esperando confirmación</p>
                        </div>
                    ) : (
                        <div className="payments-list">
                            {pendingPayments.map(payment => (
                                <div key={payment.id} className="payment-card pending">
                                    <div
                                        className="payment-header"
                                        onClick={() => setExpandedPayment(
                                            expandedPayment === payment.id ? null : payment.id
                                        )}
                                    >
                                        <div className="payment-main">
                                            <div className="payment-amount">
                                                {formatMXN(payment.total_amount)}
                                            </div>
                                            <div className="payment-from">
                                                <User size={14} />
                                                De: {payment.master?.full_name || payment.master_name || 'Maestro'}
                                            </div>
                                            <div className="payment-date">
                                                <Calendar size={14} />
                                                {formatDate(payment.created_at)}
                                            </div>
                                        </div>
                                        <div className="payment-expand">
                                            {expandedPayment === payment.id ? (
                                                <ChevronUp size={20} />
                                            ) : (
                                                <ChevronDown size={20} />
                                            )}
                                        </div>
                                    </div>

                                    {expandedPayment === payment.id && (
                                        <div className="payment-details">
                                            <div className="detail-row">
                                                <span>Mano de obra total:</span>
                                                <strong>{formatMXN(payment.labor_amount)}</strong>
                                            </div>
                                            <div className="detail-row">
                                                <span>Tu ganancia ({user?.commission_percentage || 0}%):</span>
                                                <strong className="earnings">{formatMXN(payment.total_amount)}</strong>
                                            </div>

                                            {payment.orders_summary?.length > 0 && (
                                                <div className="orders-breakdown">
                                                    <h4><Wrench size={16} /> Órdenes incluidas:</h4>
                                                    {payment.orders_summary.map((order, idx) => (
                                                        <div key={idx} className="order-item">
                                                            <span
                                                                className="order-number clickable"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/mechanic/order/${order.id}`);
                                                                }}
                                                            >
                                                                #{order.order_number}
                                                            </span>
                                                            <span className="order-client">{order.client_name}</span>
                                                            <span className="order-labor">{formatMXN(order.commission || order.labor_amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {payment.notes && (
                                                <div className="payment-notes">
                                                    <FileText size={14} />
                                                    <span>{payment.notes}</span>
                                                </div>
                                            )}

                                            <button
                                                className="btn btn-primary btn-accept"
                                                onClick={() => handleAcceptPayment(payment)}
                                                disabled={accepting === payment.id}
                                            >
                                                {accepting === payment.id ? (
                                                    <>
                                                        <Loader2 size={18} className="spinner" />
                                                        Aceptando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle size={18} />
                                                        Aceptar Pago
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Payment History */}
            {activeTab === 'history' && (
                <div className="payments-section">
                    {paymentHistory.length === 0 ? (
                        <div className="empty-state">
                            <DollarSign size={48} />
                            <h3>Sin historial</h3>
                            <p>Aún no has recibido pagos</p>
                        </div>
                    ) : (
                        <div className="payments-list">
                            {paymentHistory.map(payment => (
                                <div key={payment.id} className="payment-card completed">
                                    <div
                                        className="payment-header"
                                        onClick={() => setExpandedPayment(
                                            expandedPayment === payment.id ? null : payment.id
                                        )}
                                    >
                                        <div className="payment-main">
                                            <div className="payment-status accepted">
                                                <CheckCircle size={16} />
                                                Pagado
                                            </div>
                                            <div className="payment-amount">
                                                {formatMXN(payment.total_amount)}
                                            </div>
                                            <div className="payment-from">
                                                <User size={14} />
                                                {payment.master?.full_name || payment.master_name}
                                            </div>
                                            <div className="payment-date">
                                                <Calendar size={14} />
                                                {formatDate(payment.responded_at)}
                                            </div>
                                        </div>
                                        <div className="payment-expand">
                                            {expandedPayment === payment.id ? (
                                                <ChevronUp size={20} />
                                            ) : (
                                                <ChevronDown size={20} />
                                            )}
                                        </div>
                                    </div>

                                    {expandedPayment === payment.id && (
                                        <div className="payment-details">
                                            <div className="detail-row">
                                                <span>Mano de obra total:</span>
                                                <strong>{formatMXN(payment.labor_amount)}</strong>
                                            </div>
                                            <div className="detail-row">
                                                <span>Tu ganancia:</span>
                                                <strong className="earnings">{formatMXN(payment.total_amount)}</strong>
                                            </div>

                                            {payment.orders_summary?.length > 0 && (
                                                <div className="orders-breakdown">
                                                    <h4><Wrench size={16} /> Órdenes incluidas:</h4>
                                                    {payment.orders_summary.map((order, idx) => (
                                                        <div key={idx} className="order-item">
                                                            <span
                                                                className="order-number clickable"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigate(`/mechanic/order/${order.id}`);
                                                                }}
                                                            >
                                                                #{order.order_number}
                                                            </span>
                                                            <span className="order-client">{order.client_name}</span>
                                                            <span className="order-labor">{formatMXN(order.commission || order.labor_amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <button
                                                className="btn btn-success btn-download"
                                                onClick={() => handleDownloadReceipt(payment)}
                                                disabled={downloading === payment.id}
                                            >
                                                {downloading === payment.id ? (
                                                    <>
                                                        <Loader2 size={16} className="spinner" />
                                                        Descargando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download size={16} />
                                                        Descargar Comprobante
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <style>{`
                .auxiliary-payments {
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
                    color: var(--secondary);
                }

                .page-subtitle {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    margin: 0;
                }

                .payment-tabs {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
                }

                .tab {
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

                .tab.active {
                    border-color: var(--secondary);
                    color: var(--secondary);
                    background: rgba(16, 185, 129, 0.1);
                }

                .tab-badge {
                    background: var(--danger);
                    color: white;
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 0.75rem;
                    font-weight: 700;
                }

                .payments-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .payment-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                }

                .payment-card.pending {
                    border-left: 4px solid var(--warning);
                }

                .payment-card.completed {
                    border-left: 4px solid var(--success);
                }

                .payment-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-md);
                    cursor: pointer;
                }

                .payment-main {
                    flex: 1;
                }

                .payment-amount {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--secondary);
                    margin-bottom: var(--spacing-xs);
                }

                .payment-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    padding: 4px 8px;
                    border-radius: var(--radius-sm);
                    margin-bottom: var(--spacing-xs);
                }

                .payment-status.accepted {
                    background: rgba(16, 185, 129, 0.2);
                    color: var(--success);
                }

                .payment-from, .payment-date {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .payment-expand {
                    color: var(--text-muted);
                }

                .payment-details {
                    padding: var(--spacing-md);
                    border-top: 1px dashed var(--border-color);
                    background: var(--bg-input);
                }

                .detail-row {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-xs) 0;
                    font-size: 0.875rem;
                }

                .detail-row .earnings {
                    color: var(--secondary);
                    font-size: 1.125rem;
                }

                .orders-breakdown {
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px dashed var(--border-color);
                }

                .orders-breakdown h4 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.875rem;
                    margin: 0 0 var(--spacing-sm);
                    color: var(--text-primary);
                }

                .order-item {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-xs) 0;
                    font-size: 0.8125rem;
                    border-bottom: 1px dotted var(--border-color);
                }

                .order-number {
                    color: var(--primary);
                    font-weight: 600;
                }

                .order-number.clickable {
                    cursor: pointer;
                    text-decoration: underline;
                    text-underline-offset: 2px;
                }

                .order-number.clickable:hover {
                    color: var(--secondary);
                }

                .order-client {
                    flex: 1;
                    text-align: center;
                    color: var(--text-secondary);
                }

                .order-labor {
                    font-weight: 600;
                }

                .payment-notes {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    margin-top: var(--spacing-sm);
                    padding: var(--spacing-sm);
                    background: rgba(148, 163, 184, 0.1);
                    border-radius: var(--radius-sm);
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .btn-accept {
                    width: 100%;
                    margin-top: var(--spacing-md);
                    padding: var(--spacing-md);
                    font-size: 1rem;
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
