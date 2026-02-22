import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { orderRequestsService, ordersService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { sendDirectMessage, getOrderCreatedMessage } from '../../utils/whatsappHelper';
import {
    ArrowLeft,
    Clock,
    Check,
    X,
    User,
    Phone,
    Bike,
    Wrench,
    DollarSign,
    MessageSquare,
    ChevronDown,
    ChevronUp,
    Loader2,
    AlertCircle,
    Crown
} from 'lucide-react';

export default function MasterRequests() {
    const navigate = useNavigate();
    const { user, isMasterMechanic } = useAuth();
    const toast = useToast();

    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedRequest, setExpandedRequest] = useState(null);
    const [processingId, setProcessingId] = useState(null);
    const [rejectNotes, setRejectNotes] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(null);

    useEffect(() => {
        if (!isMasterMechanic()) {
            navigate('/mechanic');
            return;
        }
        loadRequests();
    }, [user, isMasterMechanic, navigate]);

    const loadRequests = async () => {
        try {
            const { data, error } = await orderRequestsService.getPendingForMaster(user?.id);
            if (error) {
                console.error('Error loading requests:', error);
                toast.error('Error al cargar solicitudes');
            }
            setRequests(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error loading requests:', error);
            toast.error('Error al cargar solicitudes');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (request) => {
        setProcessingId(request.id);
        try {
            // 1. Create the order from the request data
            const orderData = request.order_data;
            orderData.mechanic_id = request.requested_by; // Assign to the auxiliar
            orderData.approved_by = user.id; // Record who approved (the maestro)

            const newOrder = await ordersService.create(orderData);

            // 2. Approve the request and save the created order ID
            await orderRequestsService.approve(request.id, user.id, 'Aprobado', newOrder.id);

            // 3. Send WhatsApp notification to the client (only after maestro approval)
            try {
                const clientPhone = orderData.client_phone;
                if (clientPhone) {
                    const motoInfo = `${orderData.moto_brand || ''} ${orderData.moto_model || ''}`.trim();
                    const orderSvcs = orderData.services || [];
                    const oLaborTotal = orderSvcs.reduce((sum, s) => sum + (parseFloat(s.labor_cost) || 0), 0);
                    const oPartsTotal = orderSvcs.reduce((sum, s) => sum + (parseFloat(s.materials_cost) || 0), 0);
                    const oTotalAmount = orderSvcs.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
                    const oAdvance = parseFloat(orderData.advance_payment) || 0;
                    const waMessage = getOrderCreatedMessage(orderData.client_name, motoInfo, newOrder.order_number, null, {
                        services: orderSvcs,
                        laborTotal: oLaborTotal,
                        partsTotal: oPartsTotal,
                        totalAmount: oTotalAmount,
                        advancePayment: oAdvance,
                        paymentMethod: orderData.payment_method,
                        isPaid: oAdvance >= oTotalAmount && oTotalAmount > 0,
                    });
                    console.log('Enviando WhatsApp al cliente tras aprobacion del maestro...');
                    const waResult = await sendDirectMessage(user.id, clientPhone, waMessage, newOrder.id);
                    if (waResult.success && waResult.automated) {
                        toast.success('Cliente notificado por WhatsApp');
                    }
                }
            } catch (waError) {
                console.error('Error enviando WhatsApp tras aprobación:', waError);
                // Don't block the flow if WhatsApp fails
            }

            toast.success('Solicitud aprobada - Orden creada: ' + newOrder.order_number);
            loadRequests();
        } catch (error) {
            console.error('Error approving request:', error);
            toast.error('Error al aprobar: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (requestId) => {
        setProcessingId(requestId);
        try {
            await orderRequestsService.reject(requestId, user.id, rejectNotes);
            toast.success('Solicitud rechazada');
            setShowRejectModal(null);
            setRejectNotes('');
            loadRequests();
        } catch (error) {
            console.error('Error rejecting request:', error);
            toast.error('Error al rechazar: ' + error.message);
        } finally {
            setProcessingId(null);
        }
    };

    const formatMXN = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount || 0);
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
        <div className="master-requests-page">
            {/* Header */}
            <div className="page-header">
                <button className="btn-back" onClick={() => navigate('/mechanic')}>
                    <ArrowLeft size={20} />
                </button>
                <div className="header-content">
                    <h1 className="page-title">
                        <Crown size={24} />
                        Solicitudes Pendientes
                    </h1>
                    <p className="page-subtitle">
                        {requests.length} solicitudes por aprobar
                    </p>
                </div>
            </div>

            {/* Lista de solicitudes */}
            {requests.length === 0 ? (
                <div className="empty-state">
                    <Check size={48} />
                    <h3>¡Todo al día!</h3>
                    <p>No tienes solicitudes pendientes</p>
                </div>
            ) : (
                <div className="requests-list">
                    {requests.map(request => {
                        const orderData = request.order_data;
                        const isExpanded = expandedRequest === request.id;

                        return (
                            <div key={request.id} className="request-card">
                                {/* Header de la solicitud */}
                                <div
                                    className="request-header"
                                    onClick={() => setExpandedRequest(isExpanded ? null : request.id)}
                                >
                                    <div className="request-info">
                                        <div className="requester">
                                            <User size={18} />
                                            <strong>{request.requester?.full_name || 'Mecánico'}</strong>
                                        </div>
                                        <div className="request-time">
                                            <Clock size={14} />
                                            {new Date(request.created_at).toLocaleString('es-MX', {
                                                day: 'numeric',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </div>
                                    </div>
                                    <div className="request-total">
                                        {formatMXN(orderData?.total_amount || 0)}
                                    </div>
                                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                </div>

                                {/* Detalles expandidos */}
                                {isExpanded && (
                                    <div className="request-details">
                                        {/* Cliente */}
                                        <div className="detail-section">
                                            <h4><User size={16} /> Cliente</h4>
                                            <p>{orderData?.client_name || 'N/A'}</p>
                                            {orderData?.client_phone && (
                                                <p className="detail-secondary">
                                                    <Phone size={14} /> {orderData.client_phone}
                                                </p>
                                            )}
                                        </div>

                                        {/* Moto */}
                                        <div className="detail-section">
                                            <h4><Bike size={16} /> Motocicleta</h4>
                                            <p>{orderData?.moto_brand} {orderData?.moto_model}</p>
                                            {orderData?.moto_plates && (
                                                <p className="detail-secondary">Placas: {orderData.moto_plates}</p>
                                            )}
                                        </div>

                                        {/* Servicios */}
                                        <div className="detail-section">
                                            <h4><Wrench size={16} /> Servicios</h4>
                                            <ul className="services-list">
                                                {orderData?.services?.map((svc, idx) => (
                                                    <li key={idx}>
                                                        <span>{svc.name}</span>
                                                        <span>{formatMXN(svc.price)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        {/* Total */}
                                        <div className="detail-section total-section">
                                            <h4><DollarSign size={16} /> Total</h4>
                                            <p className="total-amount">{formatMXN(orderData?.total_amount)}</p>
                                        </div>

                                        {/* Queja del cliente */}
                                        {orderData?.customer_complaint && (
                                            <div className="detail-section">
                                                <h4><MessageSquare size={16} /> Queja del cliente</h4>
                                                <p className="complaint-text">{orderData.customer_complaint}</p>
                                            </div>
                                        )}

                                        {/* Acciones */}
                                        <div className="request-actions">
                                            <button
                                                className="btn btn-danger"
                                                onClick={() => setShowRejectModal(request.id)}
                                                disabled={processingId === request.id}
                                            >
                                                <X size={18} />
                                                Rechazar
                                            </button>
                                            <button
                                                className="btn btn-success"
                                                onClick={() => handleApprove(request)}
                                                disabled={processingId === request.id}
                                            >
                                                {processingId === request.id ? (
                                                    <Loader2 className="spinner" size={18} />
                                                ) : (
                                                    <Check size={18} />
                                                )}
                                                Aprobar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal de rechazo */}
            {showRejectModal && (
                <div className="modal-overlay" onClick={() => setShowRejectModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Rechazar Solicitud</h3>
                            <button className="modal-close" onClick={() => setShowRejectModal(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Motivo del rechazo (opcional)</label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Escribe el motivo..."
                                    value={rejectNotes}
                                    onChange={e => setRejectNotes(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowRejectModal(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={() => handleReject(showRejectModal)}
                                disabled={processingId === showRejectModal}
                            >
                                {processingId === showRejectModal ? (
                                    <Loader2 className="spinner" size={18} />
                                ) : (
                                    <X size={18} />
                                )}
                                Confirmar Rechazo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .master-requests-page {
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

                .header-content {
                    flex: 1;
                }

                .page-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin: 0;
                    color: var(--warning);
                }

                .page-subtitle {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    margin: 0;
                }

                .empty-state {
                    text-align: center;
                    padding: var(--spacing-xl);
                    color: var(--text-muted);
                }

                .empty-state svg {
                    color: var(--success);
                    margin-bottom: var(--spacing-md);
                }

                .empty-state h3 {
                    color: var(--text-primary);
                    margin: 0 0 var(--spacing-xs);
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

                .request-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .request-header:hover {
                    background: var(--bg-hover);
                }

                .request-info {
                    flex: 1;
                }

                .requester {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 1rem;
                }

                .request-time {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin-top: 4px;
                }

                .request-total {
                    font-size: 1rem;
                    font-weight: 700;
                    color: var(--success);
                }

                .request-details {
                    padding: var(--spacing-md);
                    border-top: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                }

                .detail-section {
                    margin-bottom: var(--spacing-md);
                }

                .detail-section h4 {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-muted);
                    margin: 0 0 var(--spacing-xs);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .detail-section p {
                    margin: 0;
                    font-size: 0.9375rem;
                }

                .detail-secondary {
                    font-size: 0.8125rem !important;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                }

                .services-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .services-list li {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-xs) 0;
                    border-bottom: 1px dashed var(--border-color);
                    font-size: 0.875rem;
                }

                .services-list li:last-child {
                    border-bottom: none;
                }

                .total-section {
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-top: var(--spacing-md);
                }

                .total-amount {
                    font-size: 1.25rem !important;
                    font-weight: 700;
                    color: var(--success);
                }

                .complaint-text {
                    background: var(--bg-card);
                    padding: var(--spacing-sm);
                    border-radius: var(--radius-sm);
                    font-size: 0.875rem;
                    font-style: italic;
                    color: var(--text-secondary);
                }

                .request-actions {
                    display: flex;
                    gap: var(--spacing-md);
                    margin-top: var(--spacing-lg);
                }

                .request-actions .btn {
                    flex: 1;
                }

                .btn-success {
                    background: var(--success);
                    color: white;
                }

                .btn-danger {
                    background: var(--danger);
                    color: white;
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
