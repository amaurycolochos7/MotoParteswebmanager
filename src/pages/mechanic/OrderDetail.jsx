import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    User,
    Bike,
    Wrench,
    Camera,
    Clock,
    DollarSign,
    Check,
    CheckCircle,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Edit2,
    X,
    Send,
    Plus,
    Trash2,
    AlertTriangle,
    Download
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ordersService, authService } from '../../lib/supabase';
import {
    getDetailedOrderMessage,
    sendViaWhatsApp
} from '../../utils/whatsappHelper';
import Toast from '../../components/ui/Toast';
import NoChatWarning from '../../components/ui/NoChatWarning';
import OrderPhotosDownload from '../../components/ui/OrderPhotosDownload';

export default function OrderDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, canDeleteOrders } = useAuth();
    const { orders, clients, statuses, serviceUpdates, updateOrderStatus, updateOrder, getOrderUpdates, addServiceUpdate, deleteOrder } = useData();

    // State for fetched order (when not found in context)
    const [fetchedOrder, setFetchedOrder] = useState(null);
    const [loadingOrder, setLoadingOrder] = useState(false);

    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [cancellationReason, setCancellationReason] = useState('');
    const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
    const [toast, setToast] = useState(null);
    const [showNoChatWarning, setShowNoChatWarning] = useState(false);
    const [noChatPhone, setNoChatPhone] = useState('');
    const [expandedSections, setExpandedSections] = useState({
        services: true,
        photos: true,
        updates: true,
        history: false,
    });
    const [statusNote, setStatusNote] = useState('');
    const [paymentAmount, setPaymentAmount] = useState('');
    // Finalization form - used when marking order as paid
    const [finalizationForm, setFinalizationForm] = useState({
        serviceDescription: '',
        laborCost: '',
        partsCost: '',
    });
    // Add service modal and form
    const [showAddServiceModal, setShowAddServiceModal] = useState(false);
    const [addServiceForm, setAddServiceForm] = useState({
        name: '',
        laborCost: '',
        partsCost: '',
    });
    const [updateForm, setUpdateForm] = useState({
        type: 'additional_work',
        title: '',
        description: '',
        price: '',
        requiresAuth: true,
    });

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
    };

    const handleOpenWhatsAppManual = async () => {
        if (noChatPhone) {
            const { generateWhatsAppLink } = await import('../../utils/whatsappHelper');
            const whatsappUrl = generateWhatsAppLink(noChatPhone, '');
            window.open(whatsappUrl, '_blank');
            setShowNoChatWarning(false);
        }
    };

    // Try to find order in context first
    const contextOrder = useMemo(() => orders.find(o => o.id === id), [orders, id]);

    // Fetch order from DB if not found in context
    useEffect(() => {
        const fetchOrder = async () => {
            if (!contextOrder && id && !fetchedOrder && !loadingOrder) {
                setLoadingOrder(true);
                try {
                    const dbOrder = await ordersService.getById(id);
                    if (dbOrder) {
                        setFetchedOrder(dbOrder);
                    }
                } catch (error) {
                    console.error('Error fetching order:', error);
                } finally {
                    setLoadingOrder(false);
                }
            }
        };
        fetchOrder();
    }, [contextOrder, id, fetchedOrder, loadingOrder]);

    // Use context order or fetched order
    const order = contextOrder || fetchedOrder;

    // Debug log
    useEffect(() => {
        if (order) {
            console.log('Order data:', order);
            console.log('Order services:', order.services);
        }
    }, [order]);

    const client = useMemo(() => order?.client || (order?.client_id && clients.find(c => c.id === order.client_id)), [order, clients]);
    const motorcycle = useMemo(() => order?.motorcycle, [order]);
    const updates = useMemo(() => order ? getOrderUpdates(order.id) : [], [order, serviceUpdates]);

    // Show loading while fetching
    if (loadingOrder) {
        return (
            <div className="page">
                <div className="loading-container">
                    <div className="spinner spinner-lg"></div>
                    <p>Cargando orden...</p>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="page">
                <div className="empty-state">
                    <AlertCircle size={48} />
                    <h2>Orden no encontrada</h2>
                    <button className="btn btn-primary mt-md" onClick={() => navigate(-1)}>
                        Volver
                    </button>
                </div>
            </div>
        );
    }

    const statusName = typeof order.status === 'object' ? order.status?.name : order.status;
    const currentStatus = statuses.find(s => s.name === statusName);
    const currentStatusIndex = statuses.findIndex(s => s.name === statusName);
    const nextStatus = statuses[currentStatusIndex + 1];

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const handleStatusChange = async (newStatusName) => {
        const oldStatus = statusName;
        // Buscar el ID del estado por nombre
        const statusObj = statuses.find(s => s.name === newStatusName);
        if (!statusObj) {
            showToast('Error: Estado no encontrado', 'error');
            return;
        }
        updateOrderStatus(order.id, statusObj.id, statusNote);
        setShowStatusModal(false);
        setStatusNote('');

        // Send automatic WhatsApp notification based on status
        // "Lista para Entregar" = Ready for pickup (still needs to pay/pickup)
        // "Entregada" = Delivered (thank you message)
        if (newStatus === 'Lista para Entregar' && oldStatus !== 'Lista para Entregar') {
            try {
                const servicesTotal = order.services.reduce((sum, svc) => sum + (svc.price || 0), 0);
                const totalAmount = order.total_amount || servicesTotal;

                const message = getReadyForPickupMessage(
                    client.full_name,
                    `${motorcycle.brand} ${motorcycle.model}`,
                    order.order_number,
                    totalAmount
                );

                console.log('📤 Enviando notificación de "Lista para Entregar"...');
                const result = await sendAutomatedMessage(client.phone, message);

                if (result.success && result.automated) {
                    console.log('✅ Notificación enviada exitosamente');
                    showToast('✅ Cliente notificado: Moto lista para ser recogida', 'success');
                }
            } catch (error) {
                console.error('Error enviando notificación:', error);
            }
        } else if (newStatus === 'Entregada' && oldStatus !== 'Entregada') {
            try {
                const message = getDeliveryNotificationMessage(
                    client.full_name,
                    `${motorcycle.brand} ${motorcycle.model}`,
                    order.order_number
                );

                console.log('📤 Enviando confirmación de entrega...');
                const result = await sendAutomatedMessage(client.phone, message);

                if (result.success && result.automated) {
                    console.log('✅ Confirmación de entrega enviada exitosamente');
                    showToast('✅ Cliente notificado: Orden entregada. Gracias por su preferencia.', 'success');
                }
            } catch (error) {
                console.error('Error enviando confirmación:', error);
            }
        }
    };

    const handleQuickStatusAdvance = async () => {
        if (nextStatus) {
            const oldStatus = statusName;
            updateOrderStatus(order.id, nextStatus.id, '');

            // Send automatic WhatsApp notification via manual link if desired
            // For now, removing automated message as per user request to avoid errors
            /* 
            if (nextStatus.name === 'Lista para Entregar' && oldStatus !== 'Lista para Entregar') {
                 ... logic removed ...
            }
            */
        }
    };

    const handlePaymentUpdate = async () => {
        const laborCost = parseFloat(finalizationForm.laborCost) || 0;
        const partsCost = parseFloat(finalizationForm.partsCost) || 0;
        const manualTotal = parseFloat(paymentAmount) || 0;

        // Use manual total if provided, otherwise calculate from labor + parts
        const total = manualTotal > 0 ? manualTotal : (laborCost + partsCost);

        try {
            // Update order with finalization details
            await updateOrder(order.id, {
                total_amount: total,
                labor_total: laborCost,
                parts_total: partsCost,
                mechanic_notes: finalizationForm.serviceDescription || order.mechanic_notes,
                is_paid: true,
                paid_at: new Date().toISOString(),
            });

            showToast('✅ Orden finalizada correctamente', 'success');
            setShowPaymentModal(false);
            setPaymentAmount('');
            setFinalizationForm({ serviceDescription: '', laborCost: '', partsCost: '' });
        } catch (error) {
            console.error('Error finalizing order:', error);
            showToast('Error al finalizar orden', 'error');
        }
    };

    const handleAddService = async () => {
        const laborCost = parseFloat(addServiceForm.laborCost) || 0;
        const partsCost = parseFloat(addServiceForm.partsCost) || 0;

        // Validation
        if (!addServiceForm.name.trim()) {
            showToast('El nombre del servicio es requerido', 'warning');
            return;
        }

        if (laborCost <= 0 && partsCost <= 0) {
            showToast('Debes ingresar al menos mano de obra o refacciones', 'warning');
            return;
        }

        try {
            await ordersService.addService(order.id, {
                name: addServiceForm.name,
                laborCost,
                partsCost,
                price: laborCost + partsCost
            });

            showToast('✅ Servicio agregado correctamente', 'success');
            setShowAddServiceModal(false);
            setAddServiceForm({ name: '', laborCost: '', partsCost: '' });

            // Reload order to show new service
            window.location.reload();
        } catch (error) {
            console.error('Error adding service:', error);
            showToast('Error al agregar servicio', 'error');
        }
    };

    const handleSendClientLink = async () => {
        // Validar que el cliente tenga número de teléfono
        if (!client?.phone) {
            showToast('Este cliente no tiene número de teléfono registrado', 'error');
            return;
        }

        try {
            const servicesTotal = order.services.reduce((sum, svc) => sum + (svc.price || 0), 0);
            const totalAmount = order.total_amount || servicesTotal;

            // Generar URL completa para el link de seguimiento
            const baseUrl = window.location.origin;
            const trackingLink = order.client_link
                ? `${baseUrl}${order.client_link}`
                : null;

            // Determinar contacto del mecánico responsable
            // Si el usuario actual es auxiliar y la orden tiene approved_by, mostrar el número del maestro
            let contactInfo = null;

            // Verificar si el usuario actual requiere aprobación (es auxiliar)
            const isAuxiliary = user?.requires_approval === true;

            if (isAuxiliary && order.approved_by) {
                // Es una orden de mecánico auxiliar - buscar datos del supervisor
                let supervisorData = order.supervisor;

                // Si no tenemos los datos del supervisor, intentar buscarlos
                if (!supervisorData && order.approved_by) {
                    try {
                        supervisorData = await authService.getProfile(order.approved_by);
                    } catch (e) {
                        console.log('No se pudo obtener datos del supervisor:', e);
                    }
                }

                if (supervisorData && supervisorData.phone) {
                    contactInfo = {
                        mechanicName: supervisorData.full_name,
                        mechanicPhone: supervisorData.phone,
                        isSupervisor: true
                    };
                }
            }
            // Si es maestro, no mostrar número (solo "cualquier duda quedamos atentos")

            // Crear mensaje detallado con servicios y total
            const message = getDetailedOrderMessage(
                client.full_name,
                `${motorcycle.brand} ${motorcycle.model}`,
                order.order_number,
                order.services,
                totalAmount,
                trackingLink,
                {
                    advancePayment: order.advance_payment || 0,
                    paymentMethod: order.payment_method
                },
                {
                    laborTotal: order.labor_total || 0,
                    partsTotal: order.parts_total || 0
                },
                contactInfo
            );

            // Abrir WhatsApp directamente
            sendViaWhatsApp(client.phone, message);

            showToast('Abriendo WhatsApp con el detalle de la orden...', 'success');

            // Actualizar timestamp de envío
            updateOrder(order.id, {
                link_sent_at: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error al abrir WhatsApp:', error);
            showToast(`Error: ${error.message}`, 'error');
        }
    };

    const handleAddUpdate = () => {
        if (!updateForm.title.trim() || !updateForm.description.trim()) {
            showToast('Por favor completa título y descripción', 'warning');
            return;
        }


        setUpdateForm({
            type: 'additional_work',
            title: '',
            description: '',
            price: '',
            requiresAuth: true,
        });
        setShowUpdateModal(false);
    };

    // ==========================================
    // CANCELLATION LOGIC
    // ==========================================
    const handleBeginCancellation = () => {
        if (canDeleteOrders()) {
            setShowDeleteConfirmModal(true);
        } else {
            setShowCancelModal(true);
        }
    };

    const handleRequestCancellation = async () => {
        if (!cancellationReason.trim()) {
            showToast('Debes indicar un motivo de cancelación', 'warning');
            return;
        }

        try {
            await updateOrder(order.id, {
                cancellation_reason: cancellationReason,
                cancellation_requested_at: new Date().toISOString()
            });
            setShowCancelModal(false);
            showToast('Solicitud de cancelación enviada al administrador', 'info');
        } catch (error) {
            console.error('Error requesting cancellation:', error);
            showToast('Error al solicitar cancelación', 'error');
        }
    };

    const handleDeleteOrder = async () => {
        try {
            await deleteOrder(order.id);
            showToast('Orden eliminada correctamente', 'success');
            navigate(-1); // Go back
        } catch (error) {
            console.error('Error deleting order:', error);
            showToast('Error al eliminar orden: ' + error.message, 'error');
        }
    };

    const handleApproveCancellation = async () => {
        setShowDeleteConfirmModal(true);
    };

    const handleRejectCancellation = async () => {
        try {
            await updateOrder(order.id, {
                cancellation_reason: null,
                cancellation_requested_at: null
            });
            showToast('Solicitud de cancelación rechazada', 'success');
        } catch (error) {
            console.error('Error rejecting cancellation:', error);
            showToast('Error al rechazar solicitud', 'error');
        }
    };

    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'pending': return 'badge-warning';
            case 'approved': return 'badge-success';
            case 'rejected': return 'badge-danger';
            default: return 'badge-secondary';
        }
    };



    return (
        <div className="order-detail">
            {/* Header */}
            <div className="order-detail-header">
                <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h1 className="order-number">{order.order_number}</h1>
                    <span className="order-date">
                        {new Date(order.created_at).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </span>
                </div>
                <span
                    className="badge badge-lg"
                    style={{
                        background: `${currentStatus?.color}20`,
                        color: currentStatus?.color,
                    }}
                >
                    {statusName}
                </span>
            </div>

            {/* Cancellation Request Alert (Admin/Authorized View) */}
            {order.cancellation_requested_at && (canDeleteOrders() || user.role === 'admin') && (
                <div className="alert-box mb-lg" style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
                    <div className="flex items-start gap-md">
                        <AlertTriangle className="text-danger" size={24} />
                        <div style={{ flex: 1 }}>
                            <h3 className="text-danger font-bold mb-xs">Solicitud de Cancelación pendiente</h3>
                            <p className="mb-sm"><strong>Motivo:</strong> {order.cancellation_reason}</p>
                            <p className="text-sm text-secondary mb-md">Solicitado el {new Date(order.cancellation_requested_at).toLocaleString('es-MX')}</p>

                            <div className="flex gap-sm">
                                <button className="btn btn-danger btn-sm" onClick={handleApproveCancellation}>
                                    Aprobar y Eliminar
                                </button>
                                <button className="btn btn-outline btn-sm" onClick={handleRejectCancellation} style={{ background: 'white' }}>
                                    Rechazar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            <div className="quick-actions">
                {/* Botón Finalizar Orden - Solo cuando está lista y pagada */}
                {statusName !== 'Entregada' && (order.is_paid || statusName === 'Lista para Entregar') && (
                    <button
                        className="btn btn-finish btn-full"
                        onClick={() => handleStatusChange('Entregada')}
                    >
                        <CheckCircle size={22} />
                        Finalizar Orden
                    </button>
                )}

                <button
                    className="btn btn-primary btn-full"
                    onClick={handleSendClientLink}
                    disabled={sendingWhatsApp || !client?.phone}
                >
                    {sendingWhatsApp ? (
                        <>
                            <div className="spinner-small" />
                            Enviando...
                        </>
                    ) : (
                        <>
                            <Send size={20} />
                            Enviar por WhatsApp
                        </>
                    )}
                </button>

                {nextStatus && statusName !== 'Entregada' && statusName !== 'Lista para Entregar' && (
                    <button className="btn btn-secondary btn-full" onClick={handleQuickStatusAdvance}>
                        <Check size={20} />
                        Avanzar a: {nextStatus.name}
                    </button>
                )}
                {statusName === 'Lista para Entregar' && !order.is_paid && (
                    <button className="btn btn-accent btn-full" onClick={() => setShowPaymentModal(true)}>
                        <CheckCircle size={20} />
                        Finalizar y Cobrar
                    </button>
                )}
                <button className="btn btn-outline" onClick={() => setShowStatusModal(true)}>
                    <Edit2 size={18} />
                    Cambiar Estado
                </button>

                <button
                    className="btn btn-outline"
                    onClick={handleBeginCancellation}
                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                >
                    <Trash2 size={18} />
                    Cancelar Orden
                </button>
            </div>

            {/* Client & Motorcycle Info */}
            <div className="info-cards">
                <div className="info-card">
                    <div className="info-card-icon">
                        <User size={20} />
                    </div>
                    <div className="info-card-content">
                        <span className="info-label">Cliente</span>
                        <strong>{client?.full_name || 'Sin nombre'}</strong>
                        <span className="info-secondary">{client?.phone}</span>
                    </div>
                </div>

                <div className="info-card">
                    <div className="info-card-icon" style={{ background: 'rgba(0, 212, 255, 0.15)', color: 'var(--secondary)' }}>
                        <Bike size={20} />
                    </div>
                    <div className="info-card-content">
                        <span className="info-label">Moto</span>
                        <strong>{motorcycle?.brand} {motorcycle?.model}</strong>
                        <span className="info-secondary">
                            {motorcycle?.year} • {motorcycle?.plates || 'Sin placas'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Services Section */}
            <div className="detail-section">
                <button className="section-header-btn" onClick={() => toggleSection('services')}>
                    <div className="section-title">
                        <Wrench size={20} />
                        <span>Servicios</span>
                        <span className="badge badge-primary">{(order.services?.length || 0) + (order.mechanic_notes ? 1 : 0)}</span>
                    </div>
                    {expandedSections.services ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>

                {expandedSections.services && (
                    <div className="section-content">
                        {/* Show mechanic notes if exists */}
                        {order.mechanic_notes && (
                            <div className="service-item-detail custom-service">
                                <div className="service-info">
                                    <span className="service-name">{order.mechanic_notes}</span>
                                    <span className="service-breakdown">
                                        <span className="breakdown-item custom">Trabajo realizado</span>
                                    </span>
                                </div>
                                <span className="text-primary">${order.total_amount?.toLocaleString('es-MX') || '0'}</span>
                            </div>
                        )}


                        {order.services?.map((service, idx) => {
                            // Calculate values - fallback to price as labor if no breakdown exists
                            const laborCost = parseFloat(service.labor_cost) || 0;
                            const materialsCost = parseFloat(service.materials_cost) || 0;
                            const price = parseFloat(service.price) || 0;
                            const hasBreakdown = laborCost > 0 || materialsCost > 0;

                            return (
                                <div
                                    key={idx}
                                    className="service-item-detail"
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        gap: 'var(--spacing-md)',
                                        padding: 'var(--spacing-sm) 0',
                                        borderBottom: '1px solid rgba(0,0,0,0.05)'
                                    }}
                                >
                                    <div className="service-info" style={{ flex: 1, minWidth: 0 }}>
                                        <span className="service-name" style={{
                                            wordWrap: 'break-word',
                                            wordBreak: 'break-word',
                                            display: 'block'
                                        }}>
                                            {service.name}
                                        </span>
                                    </div>
                                    {price > 0 && (
                                        <span
                                            className="text-primary"
                                            style={{
                                                fontWeight: 'bold',
                                                whiteSpace: 'nowrap',
                                                flexShrink: 0
                                            }}
                                        >
                                            ${price.toLocaleString('es-MX')}
                                        </span>
                                    )}
                                </div>
                            );
                        })}

                        {/* Empty state when no services found */}
                        {(!order.services || order.services.length === 0) && !order.mechanic_notes && (
                            <div className="empty-services" style={{ padding: 'var(--spacing-md)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                <p style={{ margin: 0 }}>Servicios no registrados individualmente</p>
                            </div>
                        )}

                        {/* Add Service Button - Discreet */}
                        <button
                            className="btn-add-service"
                            onClick={() => setShowAddServiceModal(true)}
                            style={{
                                marginTop: 'var(--spacing-sm)',
                                padding: '8px 12px',
                                fontSize: '0.85rem',
                                background: 'transparent',
                                border: '1px dashed var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.borderColor = 'var(--primary)';
                                e.target.style.color = 'var(--primary)';
                                e.target.style.background = 'rgba(59, 130, 246, 0.05)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.borderColor = 'var(--border-color)';
                                e.target.style.color = 'var(--text-muted)';
                                e.target.style.background = 'transparent';
                            }}
                        >
                            <Plus size={16} />
                            Agregar Servicio
                        </button>

                        {order.customer_complaint && (
                            <div className="complaint-box">
                                <span className="complaint-label">Descripción de falla:</span>
                                <p>{order.customer_complaint}</p>
                            </div>
                        )}

                        {/* Internal Financial Breakdown */}
                        <div className="internal-breakdown">
                            <div className="breakdown-header">
                                <DollarSign size={16} />
                                <span>{(order.labor_total > 0 || order.parts_total > 0) ? 'Desglose Interno (Control)' : 'Total Estimado'}</span>
                            </div>
                            <div className="breakdown-items">
                                {(order.labor_total > 0 || order.parts_total > 0) ? (
                                    <>
                                        <div className="breakdown-row">
                                            <span className="breakdown-label">Mano de Obra:</span>
                                            <span className="breakdown-value labor">
                                                ${(order.labor_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="breakdown-row">
                                            <span className="breakdown-label">Refacciones:</span>
                                            <span className="breakdown-value parts">
                                                ${(order.parts_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </>
                                ) : null}
                                <div className="breakdown-row total">
                                    <span className="breakdown-label">Total:</span>
                                    <span className="breakdown-value">
                                        ${(order.total_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Payment Summary - Premium Design */}
            <div className="payment-card">
                <div className="payment-card-header">
                    <DollarSign size={20} />
                    <span>Resumen de Pago</span>
                </div>

                <div className="payment-card-body">
                    <div className="payment-item">
                        <span className="payment-label">Anticipo recibido</span>
                        <span className={`payment-value ${order.advance_payment > 0 ? 'has-value' : ''}`}>
                            ${(order.advance_payment || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>

                    <div className="payment-divider" />

                    <div className="payment-item total">
                        <span className="payment-label">Total de la Orden</span>
                        <span className="payment-value highlight">
                            ${(order.total_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>

                    <div className="payment-divider" />

                    <div className="payment-item balance">
                        <span className="payment-label">
                            {order.is_paid ? 'Saldo Pagado' : 'Por Cobrar'}
                        </span>
                        <span className={`payment-value ${!order.is_paid && (order.total_amount - (order.advance_payment || 0)) > 0 ? 'pending' : 'paid'}`}>
                            ${Math.max(0, (order.total_amount || 0) - (order.advance_payment || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>

                <div className="payment-card-footer">
                    {order.is_paid ? (
                        <div className="payment-badge paid">
                            <Check size={16} />
                            PAGADO COMPLETO
                        </div>
                    ) : (
                        <button
                            className="btn btn-payment btn-full"
                            onClick={() => setShowPaymentModal(true)}
                        >
                            <DollarSign size={20} />
                            Registrar Pago Completo
                        </button>
                    )}
                </div>
            </div>

            {/* History Section */}
            <div className="detail-section">
                <button className="section-header-btn" onClick={() => toggleSection('history')}>
                    <div className="section-title">
                        <Clock size={20} />
                        <span>Historial</span>
                    </div>
                    {expandedSections.history ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>

                {expandedSections.history && (
                    <div className="section-content">
                        <div className="timeline">
                            {order.history?.map((entry, idx) => (
                                <div key={idx} className="timeline-item">
                                    <div className="timeline-dot" />
                                    <div className="timeline-content">
                                        <div className="timeline-header">
                                            <strong>{entry.new_status}</strong>
                                            <span className="timeline-time">
                                                {new Date(entry.changed_at).toLocaleString('es-MX', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                        </div>
                                        {entry.notes && <p className="timeline-note">{entry.notes}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Status Change Modal */}
            {
                showStatusModal && (
                    <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Cambiar Estado</h3>
                                <button className="modal-close" onClick={() => setShowStatusModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="status-options">
                                    {statuses
                                        .filter(status => status.name !== 'Autorización Pendiente')
                                        .map(status => (
                                            <button
                                                key={status.id}
                                                className={`status-option ${statusName === status.name ? 'current' : ''}`}
                                                onClick={() => handleStatusChange(status.name)}
                                                disabled={statusName === status.name}
                                            >
                                                <span
                                                    className="status-dot"
                                                    style={{ background: status.color }}
                                                />
                                                {status.name}
                                                {statusName === status.name && <span className="current-badge">Actual</span>}
                                            </button>
                                        ))
                                    }
                                </div>

                                <div className="form-group mt-md">
                                    <label className="form-label">Nota (opcional)</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Agregar nota sobre el cambio..."
                                        value={statusNote}
                                        onChange={e => setStatusNote(e.target.value)}
                                        rows={2}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Payment Modal - Finalization */}
            {
                showPaymentModal && (
                    <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
                        <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Finalizar Orden</h3>
                                <button className="modal-close" onClick={() => setShowPaymentModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--spacing-md)' }}>
                                    Ingresa los detalles finales del trabajo realizado antes de marcar como pagado.
                                </p>

                                {/* Service Description */}
                                <div className="form-group">
                                    <label className="form-label">¿Qué trabajo se realizó?</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Ej: Cambio de aceite, revisión de frenos, afinación completa..."
                                        value={finalizationForm.serviceDescription}
                                        onChange={e => setFinalizationForm(prev => ({ ...prev, serviceDescription: e.target.value }))}
                                        rows={3}
                                    />
                                </div>

                                {/* Labor Cost */}
                                <div className="form-group">
                                    <label className="form-label">Mano de Obra</label>
                                    <div className="input-with-icon">
                                        <DollarSign className="input-icon" size={20} />
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="0.00"
                                            value={finalizationForm.laborCost}
                                            onChange={e => setFinalizationForm(prev => ({ ...prev, laborCost: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                {/* Parts Cost */}
                                <div className="form-group">
                                    <label className="form-label">Refacciones / Materiales</label>
                                    <div className="input-with-icon">
                                        <DollarSign className="input-icon" size={20} />
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="0.00"
                                            value={finalizationForm.partsCost}
                                            onChange={e => setFinalizationForm(prev => ({ ...prev, partsCost: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                {/* Calculated Total */}
                                <div style={{
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    padding: 'var(--spacing-md)',
                                    borderRadius: 'var(--radius-md)',
                                    marginTop: 'var(--spacing-md)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Mano de obra:</span>
                                        <span>${(parseFloat(finalizationForm.laborCost) || 0).toLocaleString('es-MX')}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Refacciones:</span>
                                        <span>${(parseFloat(finalizationForm.partsCost) || 0).toLocaleString('es-MX')}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '8px' }}>
                                        <span>Total:</span>
                                        <span style={{ color: 'var(--success)' }}>
                                            ${((parseFloat(finalizationForm.laborCost) || 0) + (parseFloat(finalizationForm.partsCost) || 0)).toLocaleString('es-MX')}
                                        </span>
                                    </div>
                                </div>

                                {/* Override Total (optional) */}
                                <div className="form-group" style={{ marginTop: 'var(--spacing-md)' }}>
                                    <label className="form-label">Total Final (opcional - solo si difiere)</label>
                                    <div className="input-with-icon">
                                        <DollarSign className="input-icon" size={20} />
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="Dejar vacío para usar suma automática"
                                            value={paymentAmount}
                                            onChange={e => setPaymentAmount(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {order.advance_payment > 0 && (
                                    <p className="text-secondary" style={{ marginTop: 'var(--spacing-sm)' }}>
                                        ✓ Anticipo recibido: ${order.advance_payment.toLocaleString('es-MX')}
                                    </p>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-success"
                                    onClick={handlePaymentUpdate}
                                    disabled={
                                        !(finalizationForm.laborCost || finalizationForm.partsCost || paymentAmount) ||
                                        ((parseFloat(finalizationForm.laborCost) || 0) + (parseFloat(finalizationForm.partsCost) || 0) + (parseFloat(paymentAmount) || 0)) <= 0
                                    }
                                >
                                    <CheckCircle size={18} />
                                    Finalizar y Cobrar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Add Update Modal */}
            {
                showUpdateModal && (
                    <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Agregar Novedad</h3>
                                <button className="modal-close" onClick={() => setShowUpdateModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Tipo</label>
                                    <select
                                        className="form-input"
                                        value={updateForm.type}
                                        onChange={e => setUpdateForm(prev => ({ ...prev, type: e.target.value }))}
                                    >
                                        <option value="additional_work">Trabajo Adicional</option>
                                        <option value="part_needed">Repuesto Necesario</option>
                                        <option value="info">Información</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Título</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Ej: Cambio de pastillas de freno"
                                        value={updateForm.title}
                                        onChange={e => setUpdateForm(prev => ({ ...prev, title: e.target.value }))}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Descripción</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Describe el trabajo adicional detectado..."
                                        value={updateForm.description}
                                        onChange={e => setUpdateForm(prev => ({ ...prev, description: e.target.value }))}
                                        rows={3}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Precio Estimado</label>
                                    <div className="input-with-icon">
                                        <DollarSign className="input-icon" size={20} />
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="0.00"
                                            value={updateForm.price}
                                            onChange={e => setUpdateForm(prev => ({ ...prev, price: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={updateForm.requiresAuth}
                                            onChange={e => setUpdateForm(prev => ({ ...prev, requiresAuth: e.target.checked }))}
                                        />
                                        <span>Requiere autorización del cliente</span>
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setShowUpdateModal(false)}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleAddUpdate}
                                >
                                    <Plus size={18} />
                                    Agregar Novedad
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Add Service Modal */}
            {
                showAddServiceModal && (
                    <div className="modal-overlay" onClick={() => setShowAddServiceModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Agregar Servicio Adicional</h3>
                                <button className="modal-close" onClick={() => setShowAddServiceModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--spacing-md)' }}>
                                    Agrega un servicio que se realizó durante o después del trabajo inicial.
                                </p>

                                <div className="form-group">
                                    <label className="form-label">Nombre del Servicio <span className="text-danger">*</span></label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Ej: Cambio de filtro, Soldadura, etc."
                                        value={addServiceForm.name}
                                        onChange={e => setAddServiceForm(prev => ({ ...prev, name: e.target.value }))}
                                        autoFocus
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Mano de Obra</label>
                                    <div className="input-with-icon">
                                        <DollarSign className="input-icon" size={20} />
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="0.00"
                                            value={addServiceForm.laborCost}
                                            onChange={e => setAddServiceForm(prev => ({ ...prev, laborCost: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Refacciones / Materiales</label>
                                    <div className="input-with-icon">
                                        <DollarSign className="input-icon" size={20} />
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="0.00"
                                            value={addServiceForm.partsCost}
                                            onChange={e => setAddServiceForm(prev => ({ ...prev, partsCost: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div style={{
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    padding: 'var(--spacing-sm)',
                                    borderRadius: 'var(--radius-md)',
                                    fontSize: '0.875rem',
                                    marginTop: 'var(--spacing-sm)'
                                }}>
                                    <strong>Total del servicio: </strong>
                                    <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                        ${((parseFloat(addServiceForm.laborCost) || 0) + (parseFloat(addServiceForm.partsCost) || 0)).toLocaleString('es-MX')}
                                    </span>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setShowAddServiceModal(false)}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleAddService}
                                    disabled={
                                        !addServiceForm.name.trim() ||
                                        ((parseFloat(addServiceForm.laborCost) || 0) + (parseFloat(addServiceForm.partsCost) || 0)) <= 0
                                    }
                                >
                                    <Plus size={18} />
                                    Agregar Servicio
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Cancellation Modal */}
            {
                showCancelModal && (
                    <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title text-danger">Solicitar Cancelación</h3>
                                <button className="modal-close" onClick={() => setShowCancelModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="alert-box mb-md" style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px', fontSize: '0.9rem' }}>
                                    <div className="flex gap-sm">
                                        <AlertTriangle size={18} className="text-warning" />
                                        <span>
                                            No tienes permisos para eliminar órdenes directamente.
                                            Se enviará una solicitud al administrador.
                                        </span>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Motivo de Cancelación <span className="text-danger">*</span></label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Explica por qué se debe cancelar esta orden..."
                                        value={cancellationReason}
                                        onChange={e => setCancellationReason(e.target.value)}
                                        rows={3}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setShowCancelModal(false)}>
                                    Volver
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={handleRequestCancellation}
                                    disabled={!cancellationReason.trim()}
                                >
                                    Enviar Solicitud
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Confirmation Modal */}
            {
                showDeleteConfirmModal && (
                    <div className="modal-overlay" onClick={() => setShowDeleteConfirmModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title text-danger">Eliminar Orden</h3>
                                <button className="modal-close" onClick={() => setShowDeleteConfirmModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="alert-box mb-md" style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', display: 'flex', gap: '12px' }}>
                                    <AlertTriangle size={24} className="text-danger" style={{ flexShrink: 0 }} />
                                    <div>
                                        <p className="font-bold text-danger mb-xs">¿Estás seguro de que deseas eliminar esta orden permanentemente?</p>
                                        <p className="text-sm">Esta acción <strong>no se puede deshacer</strong>. Se eliminarán todos los servicios, historial y datos asociados.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setShowDeleteConfirmModal(false)}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={handleDeleteOrder}
                                >
                                    <Trash2 size={18} />
                                    Eliminar Definitivamente
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }



            <style>{`
        .order-detail {
          padding-bottom: 100px;
        }

        .order-detail-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
        }

        .order-number {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--primary);
        }

        .order-date {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .badge-lg {
          padding: var(--spacing-sm) var(--spacing-md);
          font-size: 0.875rem;
          margin-left: auto;
        }

        .quick-actions {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-xl);
        }

        .info-cards {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-xl);
        }

        .info-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }

        .info-card-icon {
          width: 44px;
          height: 44px;
          background: rgba(59, 130, 246, 0.15);
          color: var(--primary);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .info-card-content {
          display: flex;
          flex-direction: column;
        }

        .info-label {
          font-size: 0.625rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-secondary {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .detail-section {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          margin-bottom: var(--spacing-md);
          overflow: hidden;
        }

        .section-header-btn {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--spacing-md);
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-weight: 600;
        }

        .section-content {
          padding: 0 var(--spacing-md) var(--spacing-md);
        }

        .service-item-detail {
          display: flex;
          justify-content: space-between;
          padding: var(--spacing-sm) 0;
          border-bottom: 1px solid var(--border-color);
        }

        .service-item-detail:last-child {
          border-bottom: none;
        }

        .complaint-box {
          margin-top: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-input);
          border-radius: var(--radius-md);
        }

        .complaint-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          display: block;
          margin-bottom: var(--spacing-xs);
        }

        .updates-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .update-item {
          padding: var(--spacing-md);
          background: var(--bg-input);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
        }

        .update-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-xs);
        }

        .update-type-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .update-item-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: var(--spacing-xs);
        }

        .update-item-desc {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: var(--spacing-sm);
        }

        .update-item-price {
          font-size: 0.875rem;
          color: var(--primary);
          margin-bottom: var(--spacing-xs);
        }

        .update-item-date {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .damage-summary {
          display: flex;
          flex-wrap: wrap;
          gap: var(--spacing-sm);
          margin-top: var(--spacing-md);
        }

        .damage-tag {
          background: rgba(255, 107, 0, 0.15);
          color: var(--accent);
          padding: var(--spacing-xs) var(--spacing-sm);
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 500;
        }

        .payment-summary {
          margin-bottom: var(--spacing-md);
        }

        .payment-row {
          display: flex;
          justify-content: space-between;
          padding: var(--spacing-sm) 0;
        }

        .payment-row span {
          color: var(--text-secondary);
        }

        .payment-status {
          margin-top: var(--spacing-sm);
          padding-top: var(--spacing-sm);
          border-top: 1px solid var(--border-color);
          text-align: center;
        }

        .timeline {
          position: relative;
          padding-left: var(--spacing-lg);
        }

        .timeline::before {
          content: '';
          position: absolute;
          left: 6px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--border-color);
        }

        .timeline-item {
          position: relative;
          padding-bottom: var(--spacing-md);
        }

        .timeline-dot {
          position: absolute;
          left: calc(-1 * var(--spacing-lg) + 2px);
          top: 4px;
          width: 10px;
          height: 10px;
          background: var(--primary);
          border-radius: 50%;
        }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 2px;
        }

        .timeline-time {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .timeline-note {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .status-options {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .status-option {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-input);
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .status-option:hover:not(:disabled) {
          border-color: var(--primary);
        }

        .status-option:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .status-option.current {
          border-color: var(--primary);
          background: rgba(59, 130, 246, 0.05);
        }

        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .current-badge {
          margin-left: auto;
          font-size: 0.75rem;
          color: var(--primary);
        }

        .input-with-icon {
          position: relative;
        }

        .input-with-icon .form-input {
          padding-left: 48px;
        }

        .input-icon {
          position: absolute;
          left: var(--spacing-md);
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .text-accent {
          color: var(--accent);
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          cursor: pointer;
        }

        .checkbox-label input[type="checkbox"] {
          width: 20px;
          height: 20px;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Payment Card - Premium Design */
        .payment-card {
          background: var(--bg-card);
          border-radius: var(--radius-xl);
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          border: 1px solid var(--border-color);
          margin-bottom: var(--spacing-lg);
        }

        .payment-card-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          color: white;
          font-weight: 600;
          font-size: 0.9375rem;
        }

        .payment-card-body {
          padding: 1rem 1.25rem;
        }

        .payment-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 0;
        }

        .payment-label {
          color: var(--text-secondary);
          font-size: 0.9375rem;
        }

        .payment-value {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .payment-value.has-value {
          color: var(--primary);
        }

        .payment-value.highlight {
          color: var(--primary);
          font-size: 1.375rem;
        }

        .payment-value.pending {
          color: var(--warning);
        }

        .payment-value.paid {
          color: var(--success);
        }

        .payment-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, var(--border-color) 50%, transparent 100%);
        }

        .payment-card-footer {
          padding: 1rem 1.25rem;
          background: var(--bg-hover);
          border-top: 1px solid var(--border-light);
        }

        .payment-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.75rem;
          border-radius: var(--radius-lg);
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }

        .payment-badge.paid {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
        }

        .payment-badge.pending {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
        }

        /* Service Item with Breakdown */
        .service-item-detail {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: var(--spacing-sm) 0;
          border-bottom: 1px solid var(--border-light);
        }

        .service-item-detail:last-of-type {
          border-bottom: none;
        }

        .service-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .service-name {
          font-weight: 600;
          color: var(--text-primary);
        }

        .service-breakdown {
          display: flex;
          gap: var(--spacing-sm);
          flex-wrap: wrap;
        }

        .breakdown-item {
          font-size: 0.75rem;
          padding: 2px 8px;
          border-radius: var(--radius-sm);
        }

        .breakdown-item.labor {
          background: rgba(59, 130, 246, 0.1);
          color: var(--primary);
        }

        .breakdown-item.parts {
          background: rgba(245, 158, 11, 0.1);
          color: var(--warning);
        }

        /* Internal Financial Breakdown */
        .internal-breakdown {
          margin-top: var(--spacing-md);
          padding: var(--spacing-md);
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border-radius: var(--radius-md);
          border: 1px solid rgba(59, 130, 246, 0.2);
        }

        .internal-breakdown .breakdown-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--primary);
          margin-bottom: var(--spacing-sm);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .internal-breakdown .breakdown-items {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xs);
        }

        .internal-breakdown .breakdown-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--spacing-xs) 0;
        }

        .internal-breakdown .breakdown-row.total {
          border-top: 1px dashed var(--border-color);
          padding-top: var(--spacing-sm);
          margin-top: var(--spacing-xs);
        }

        .internal-breakdown .breakdown-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .internal-breakdown .breakdown-value {
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .internal-breakdown .breakdown-value.labor {
          color: var(--primary);
        }

        .internal-breakdown .breakdown-value.parts {
          color: var(--warning);
        }

        .internal-breakdown .breakdown-row.total .breakdown-label,
        .internal-breakdown .breakdown-row.total .breakdown-value {
          font-weight: 800;
          color: var(--text-primary);
        }
      `}</style>

            {/* Order Photos Download Section */}
            <OrderPhotosDownload orderId={order.id} order={order} />

            {/* Toast Notifications */}
            {
                toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )
            }

            {/* No Chat Warning Modal */}
            {
                showNoChatWarning && (
                    <NoChatWarning
                        phone={noChatPhone}
                        onClose={() => setShowNoChatWarning(false)}
                        onOpenWhatsApp={handleOpenWhatsAppManual}
                    />
                )
            }
        </div>
    );
}
