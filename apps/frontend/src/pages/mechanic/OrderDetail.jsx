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
    Download,
    FileText,
    Save,
    Loader2,
    MessageCircle
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ordersService, authService } from '../../lib/api';
import {
    getDetailedOrderMessage,
    getStatusChangeMessage,
    getNewServiceAddedMessage,
    getServiceOrderMessage,
    sendDirectMessage,
    sendMessageWithPDF
} from '../../utils/whatsappHelper';
import { generateOrderPDFBlob, downloadOrderPDF } from '../../utils/pdfGenerator';
import Toast from '../../components/ui/Toast';
import NoChatWarning from '../../components/ui/NoChatWarning';
import OrderPhotosDownload from '../../components/ui/OrderPhotosDownload';
import './OrderDetail.css';

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

    // ===== COSTS PANEL STATE =====
    const [editingCosts, setEditingCosts] = useState(false);
    const [costsLabor, setCostsLabor] = useState([]);
    const [costsParts, setCostsParts] = useState([]);
    const [costsMarkAsPaid, setCostsMarkAsPaid] = useState(false);
    const [savingCosts, setSavingCosts] = useState(false);
    const [sendingPDF, setSendingPDF] = useState(false);
    const [showSendChoice, setShowSendChoice] = useState(false);

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

        // Enviar notificación automática de WhatsApp via bot para TODOS los estados
        if (newStatusName !== oldStatus && client?.phone) {
            try {
                const servicesTotal = order.services.reduce((sum, svc) => sum + (svc.price || 0), 0);
                const totalAmount = order.total_amount || servicesTotal;
                const baseUrl = window.location.origin;
                // SUSPENDIDO: enlaces de seguimiento deshabilitados temporalmente
                // const trackingLink = order.client_link ? `${baseUrl}${order.client_link}` : null;
                const trackingLink = null;

                const message = getStatusChangeMessage(newStatusName, {
                    clientName: client.full_name,
                    motorcycle: `${motorcycle.brand} ${motorcycle.model}`,
                    orderNumber: order.order_number,
                    trackingLink,
                    totalAmount,
                    services: order.services
                });

                console.log(`📤 Enviando notificación "${newStatusName}" via bot...`);
                const result = await sendDirectMessage(user.id, client.phone, message, order.id);

                if (result.success && result.automated) {
                    showToast(`✅ Cliente notificado por WhatsApp: ${newStatusName}`, 'success');
                } else if (!result.success) {
                    console.warn('⚠️ WhatsApp no enviado:', result.error);
                }
            } catch (error) {
                console.error('Error enviando notificación:', error);
            }
        }
    };

    const handleQuickStatusAdvance = async () => {
        if (nextStatus) {
            await handleStatusChange(nextStatus.name);
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
            const result = await ordersService.addService(order.id, {
                name: addServiceForm.name,
                laborCost,
                partsCost,
                price: laborCost + partsCost
            });

            // The API now returns the full updated order
            const updatedOrder = result.data || result;

            showToast('✅ Servicio agregado correctamente', 'success');
            setShowAddServiceModal(false);

            // Send WhatsApp notification with new service details
            if (client?.phone) {
                try {
                    const message = getNewServiceAddedMessage(
                        client.full_name,
                        `${motorcycle.brand} ${motorcycle.model}`,
                        order.order_number,
                        { name: addServiceForm.name, laborCost, partsCost },
                        updatedOrder
                    );

                    console.log('📤 Enviando notificación de servicio adicional via bot...');
                    const waResult = await sendDirectMessage(user.id, client.phone, message, order.id);

                    if (waResult.success && waResult.automated) {
                        showToast('📱 Cliente notificado por WhatsApp', 'success');
                    } else if (!waResult.success) {
                        console.warn('⚠️ WhatsApp no enviado:', waResult.error);
                    }
                } catch (waError) {
                    console.error('Error enviando WhatsApp:', waError);
                }
            }

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

        setSendingWhatsApp(true);

        try {
            const servicesTotal = order.services.reduce((sum, svc) => sum + (svc.price || 0), 0);
            const totalAmount = order.total_amount || servicesTotal;

            // Generar URL completa para el link de seguimiento
            const baseUrl = window.location.origin;
            // SUSPENDIDO: enlaces de seguimiento deshabilitados temporalmente
            // const trackingLink = order.client_link
            //     ? `${baseUrl}${order.client_link}`
            //     : null;
            const trackingLink = null;

            // Determinar contacto del mecánico responsable
            let contactInfo = null;
            const isAuxiliary = user?.requires_approval === true;

            if (isAuxiliary && order.approved_by) {
                let supervisorData = order.supervisor;
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

            // Enviar directo via bot — automático, sin abrir ventana
            console.log('📤 Enviando detalle de orden via bot...');
            const result = await sendDirectMessage(user.id, client.phone, message, order.id);

            if (result.success && result.automated) {
                showToast('✅ Mensaje enviado por WhatsApp automáticamente', 'success');

                // Actualizar timestamp de envío
                updateOrder(order.id, {
                    link_sent_at: new Date().toISOString()
                });
            } else {
                showToast(`⚠️ ${result.error}`, 'warning');
            }

        } catch (error) {
            console.error('Error al enviar WhatsApp:', error);
            showToast(`Error: ${error.message}`, 'error');
        } finally {
            setSendingWhatsApp(false);
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

    // ===== COSTS PANEL HANDLERS =====
    const handleStartEditCosts = () => {
        // Build labor items from order services or fallback to a single item with labor_total
        const existingLabor = (order.services || []).filter(s => (parseFloat(s.price) - parseFloat(s.cost || 0)) > 0).map(s => ({
            id: s.id,
            name: s.name,
            price: String(parseFloat(s.price) - parseFloat(s.cost || 0)),
        }));
        if (existingLabor.length === 0 && parseFloat(order.labor_total) > 0) {
            existingLabor.push({ id: `labor-${Date.now()}`, name: 'Mano de obra general', price: String(parseFloat(order.labor_total)) });
        }
        setCostsLabor(existingLabor.length > 0 ? existingLabor : [{ id: `labor-${Date.now()}`, name: '', price: '' }]);

        const existingParts = (order.parts || []).map(p => ({
            id: p.id,
            name: p.name,
            price: String(parseFloat(p.price)),
            quantity: p.quantity || 1,
        }));
        setCostsParts(existingParts.length > 0 ? existingParts : [{ id: `new-${Date.now()}`, name: '', price: '', quantity: 1 }]);
        setCostsMarkAsPaid(order?.is_paid || false);
        setEditingCosts(true);
    };

    const handleAddLaborRow = () => {
        setCostsLabor(prev => [...prev, { id: `labor-${Date.now()}`, name: '', price: '' }]);
    };
    const handleUpdateLabor = (index, field, value) => {
        setCostsLabor(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
    };
    const handleRemoveLabor = (index) => {
        setCostsLabor(prev => prev.filter((_, i) => i !== index));
    };

    const handleAddPartRow = () => {
        setCostsParts(prev => [...prev, { id: `new-${Date.now()}`, name: '', price: '', quantity: 1 }]);
    };
    const handleUpdatePart = (index, field, value) => {
        setCostsParts(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    };
    const handleRemovePart = (index) => {
        setCostsParts(prev => prev.filter((_, i) => i !== index));
    };

    const handleSaveCosts = async () => {
        setSavingCosts(true);
        try {
            const validParts = costsParts.filter(p => p.name.trim() && parseFloat(p.price) > 0);
            const validLabor = costsLabor.filter(l => parseFloat(l.price) > 0);
            const laborTotal = validLabor.reduce((sum, l) => sum + (parseFloat(l.price) || 0), 0);

            // Save labor description in mechanic_notes for reference
            const laborDescription = validLabor.filter(l => l.name.trim()).map(l => `${l.name}: $${parseFloat(l.price).toLocaleString('es-MX')}`).join(' | ');

            const result = await ordersService.updateCosts(order.id, {
                labor_total: laborTotal,
                parts: validParts.map(p => ({
                    name: p.name.trim(),
                    price: parseFloat(p.price) || 0,
                    quantity: parseInt(p.quantity) || 1,
                })),
                mark_as_paid: costsMarkAsPaid,
            });

            // Also save labor breakdown as mechanic_notes
            if (laborDescription) {
                await updateOrder(order.id, { mechanic_notes: laborDescription });
            }

            if (result.error) throw result.error;
            showToast('✅ Costos guardados correctamente', 'success');
            setEditingCosts(false);
            window.location.reload();
        } catch (error) {
            console.error('Error saving costs:', error);
            showToast('Error al guardar costos: ' + (error.message || error), 'error');
        } finally {
            setSavingCosts(false);
        }
    };
    // ===== PDF + WHATSAPP HANDLER (SERVER-SIDE) =====
    const handleSendPDF = async () => {
        if (!client?.phone) {
            showToast('Este cliente no tiene numero de telefono', 'error');
            return;
        }
        setSendingPDF(true);
        try {
            const token = localStorage.getItem('motopartes_token');
            const res = await fetch(`/api/order-pdf/${order.id}/send`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const result = await res.json();

            if (result.success && result.automated) {
                showToast('PDF enviado por WhatsApp al cliente', 'success');
            } else if (result.fallback) {
                showToast('WhatsApp no disponible. Conecte el bot primero.', 'warning');
            } else {
                showToast(result.error || 'Error al enviar PDF', 'error');
            }
        } catch (error) {
            console.error('Error sending PDF:', error);
            showToast('Error de conexion con el servidor', 'error');
        } finally {
            setSendingPDF(false);
        }
    };

    // Send summary as WhatsApp text message (no PDF)
    const handleSendText = async () => {
        if (!client?.phone) {
            showToast('Este cliente no tiene número de teléfono', 'error');
            return;
        }
        setSendingPDF(true);
        setShowSendChoice(false);
        try {
            const motoInfo = motorcycle ? `${motorcycle.brand} ${motorcycle.model}` : 'N/A';
            const laborAmt = parseFloat(order.labor_total) || 0;
            const partsAmt = parseFloat(order.parts_total) || 0;
            const totalAmt = parseFloat(order.total_amount) || 0;

            let msgLines = [
                `*${client.full_name}*,`,
                ``,
                `📋 *RESUMEN DE SERVICIO - ${order.order_number}*`,
                ``,
                `🏍️ Moto: *${motoInfo}*`,
            ];

            // Add services list
            if (order.services?.length > 0) {
                msgLines.push(``);
                msgLines.push(`🔧 *Servicios realizados:*`);
                order.services.forEach(s => {
                    const price = parseFloat(s.price) || 0;
                    msgLines.push(`  • ${s.name}${price > 0 ? ` - $${price.toLocaleString('es-MX')}` : ''}`);
                });
            }

            // Add labor breakdown from mechanic_notes
            if (order.mechanic_notes) {
                msgLines.push(``);
                msgLines.push(`🔧 *Mano de Obra:*`);
                order.mechanic_notes.split(' | ').forEach(item => {
                    msgLines.push(`  • ${item}`);
                });
            }

            // Add parts
            if ((order.parts || []).length > 0) {
                msgLines.push(``);
                msgLines.push(`🔩 *Refacciones:*`);
                order.parts.forEach(p => {
                    msgLines.push(`  • ${p.name} - $${(parseFloat(p.price) || 0).toLocaleString('es-MX')}`);
                });
            }

            if (totalAmt > 0) {
                msgLines.push(``);
                msgLines.push(`━━━━━━━━━━━━━━`);
                if (laborAmt > 0) msgLines.push(`Mano de obra: *$${laborAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*`);
                if (partsAmt > 0) msgLines.push(`Refacciones: *$${partsAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*`);
                msgLines.push(`*💰 TOTAL: $${totalAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*`);
            }

            if (order.advance_payment > 0) {
                msgLines.push(`Anticipo: -$${parseFloat(order.advance_payment).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
            }

            msgLines.push(``);
            msgLines.push(`Gracias por su preferencia. 🙏`);
            msgLines.push(`— *MotoPartes Club*`);

            const message = msgLines.join('\n');

            const waResult = await sendDirectMessage(user.id, client.phone, message, order.id);

            if (waResult.success && waResult.automated) {
                showToast('✅ Resumen enviado por WhatsApp', 'success');
            } else {
                // Fallback: open WhatsApp web
                const encodedMsg = encodeURIComponent(message);
                const cleanedPhone = client.phone.replace(/\D/g, '');
                const phone = cleanedPhone.startsWith('52') ? cleanedPhone : `52${cleanedPhone}`;
                window.open(`https://wa.me/${phone}?text=${encodedMsg}`, '_blank');
                showToast('📱 Abriendo WhatsApp...', 'info');
            }
        } catch (error) {
            console.error('Error sending text:', error);
            showToast('Error al enviar resumen: ' + error.message, 'error');
        } finally {
            setSendingPDF(false);
        }
    };

    return (
        <div className="order-detail">
            {/* Header compacto */}
            <div className="order-detail-header">
                <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
                    <ArrowLeft size={24} />
                </button>
                <div style={{ flex: 1 }}>
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

            {/* Cancellation Request Alert */}
            {order.cancellation_requested_at && (canDeleteOrders() || user.role === 'admin') && (
                <div className="alert-box mb-lg" style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
                    <div className="flex items-start gap-md">
                        <AlertTriangle className="text-danger" size={24} />
                        <div style={{ flex: 1 }}>
                            <h3 className="text-danger font-bold mb-xs">Solicitud de Cancelación pendiente</h3>
                            <p className="mb-sm"><strong>Motivo:</strong> {order.cancellation_reason}</p>
                            <div className="flex gap-sm">
                                <button className="btn btn-danger btn-sm" onClick={handleApproveCancellation}>Aprobar y Eliminar</button>
                                <button className="btn btn-outline btn-sm" onClick={handleRejectCancellation} style={{ background: 'white' }}>Rechazar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Client & Motorcycle Info — combined card to reduce scroll */}
            <div className="od-info-combo">
                <div className="od-info-row">
                    <div className="od-info-icon" style={{ background: 'var(--od-rojo-soft)', color: 'var(--od-rojo)' }}>
                        <User size={16} />
                    </div>
                    <div className="od-info-text">
                        <strong>{client?.full_name || 'Sin nombre'}</strong>
                        <span>{client?.phone}</span>
                    </div>
                </div>
                <div className="od-info-divider" />
                <div className="od-info-row">
                    <div className="od-info-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                        <Bike size={16} />
                    </div>
                    <div className="od-info-text">
                        <strong>{motorcycle?.brand} {motorcycle?.model}</strong>
                        <span>{motorcycle?.year} • {motorcycle?.plates || 'Sin placas'}</span>
                    </div>
                </div>
            </div>

            {/* Falla reportada (si existe) */}
            {order.customer_complaint && (
                <div className="od-complaint">
                    <span className="od-complaint-label">Falla reportada:</span>
                    <p>{order.customer_complaint}</p>
                </div>
            )}

            {/* ── COSTOS ── */}
            <div className="od-section">
                <div className="od-section-header">
                    <DollarSign size={18} />
                    <span>Costos</span>
                    {!editingCosts ? (
                        <button className="od-edit-btn" onClick={handleStartEditCosts}>
                            <Edit2 size={14} />
                            {(parseFloat(order.labor_total) > 0 || (order.parts || []).length > 0) ? 'Editar' : 'Agregar'}
                        </button>
                    ) : (
                        <button className="od-edit-btn cancel" onClick={() => setEditingCosts(false)}>
                            <X size={14} /> Cancelar
                        </button>
                    )}
                </div>
                <div className="od-section-body">
                    {editingCosts ? (
                        <div className="od-costs-form">
                            {/* Mano de Obra - itemizada */}
                            <div className="od-costs-parts">
                                <div className="od-costs-parts-hdr">
                                    <label>🔧 Mano de Obra</label>
                                    <button onClick={handleAddLaborRow}><Plus size={14} /> Agregar</button>
                                </div>
                                {costsLabor.map((item, idx) => (
                                    <div key={item.id || idx} className="od-part-row">
                                        <input type="text" placeholder="Ej: Cambio de bujes" value={item.name} onChange={e => handleUpdateLabor(idx, 'name', e.target.value)} />
                                        <div className="od-input-wrap small">
                                            <span>$</span>
                                            <input type="number" placeholder="0" value={item.price} onChange={e => handleUpdateLabor(idx, 'price', e.target.value)} min="0" />
                                        </div>
                                        <button className="od-rm-btn" onClick={() => handleRemoveLabor(idx)}><X size={16} /></button>
                                    </div>
                                ))}
                            </div>

                            {/* Refacciones */}
                            <div className="od-costs-parts">
                                <div className="od-costs-parts-hdr">
                                    <label>🔩 Refacciones</label>
                                    <button onClick={handleAddPartRow}><Plus size={14} /> Agregar</button>
                                </div>
                                {costsParts.map((part, idx) => (
                                    <div key={part.id || idx} className="od-part-row">
                                        <input type="text" placeholder="Ej: Filtro de aceite" value={part.name} onChange={e => handleUpdatePart(idx, 'name', e.target.value)} />
                                        <div className="od-input-wrap small">
                                            <span>$</span>
                                            <input type="number" placeholder="0" value={part.price} onChange={e => handleUpdatePart(idx, 'price', e.target.value)} min="0" />
                                        </div>
                                        <button className="od-rm-btn" onClick={() => handleRemovePart(idx)}><X size={16} /></button>
                                    </div>
                                ))}
                            </div>

                            <div className="od-costs-total">
                                <span>Total estimado:</span>
                                <strong>${(costsLabor.reduce((s, l) => s + (parseFloat(l.price) || 0), 0) + costsParts.reduce((s, p) => s + ((parseFloat(p.price) || 0) * (parseInt(p.quantity) || 1)), 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
                            </div>
                            <label className="od-mark-paid">
                                <input type="checkbox" checked={costsMarkAsPaid} onChange={e => setCostsMarkAsPaid(e.target.checked)} />
                                <span>Marcar como pagada (cobrada al cliente)</span>
                            </label>
                            <button className="od-save-btn" onClick={handleSaveCosts} disabled={savingCosts}>
                                {savingCosts ? <Loader2 size={18} className="spinner" /> : <Save size={18} />}
                                {savingCosts ? 'Guardando...' : 'Guardar Costos'}
                            </button>
                        </div>
                    ) : (
                        <>
                            {parseFloat(order.labor_total) > 0 || (order.parts || []).length > 0 || order.mechanic_notes ? (
                                <>
                                    {/* Show itemized labor if mechanic_notes has breakdown */}
                                    {order.mechanic_notes && order.mechanic_notes.includes('|') ? (
                                        order.mechanic_notes.split(' | ').map((item, idx) => (
                                            <div key={`labor-${idx}`} className="od-cost-row">
                                                <span>🔧 {item.split(':')[0]}</span>
                                                <span className="od-cost-val">{item.split(':')[1]?.trim()}</span>
                                            </div>
                                        ))
                                    ) : parseFloat(order.labor_total) > 0 ? (
                                        <div className="od-cost-row">
                                            <span>🔧 {order.mechanic_notes || 'Mano de Obra'}</span>
                                            <span className="od-cost-val">${(parseFloat(order.labor_total) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    ) : null}
                                    {(order.parts || []).map((p, idx) => (
                                        <div key={p.id || idx} className="od-cost-row part">
                                            <span>{p.name}</span>
                                            <span>${(parseFloat(p.price) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    ))}
                                    <div className="od-cost-row total">
                                        <span>TOTAL</span>
                                        <span>${(parseFloat(order.total_amount) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {order.advance_payment > 0 && (
                                        <div className="od-cost-row advance">
                                            <span>Anticipo</span>
                                            <span>-${(parseFloat(order.advance_payment) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="od-empty-text">No se han registrado costos aún</p>
                            )}
                            {order.is_paid && (
                                <div className="od-paid-badge"><Check size={16} /> PAGADO</div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── FOTOS DE INGRESO ── */}
            <OrderPhotosDownload order={order} />

            {/* ── ACCIONES ── */}
            <div className="od-actions">
                {/* Fila principal: enviar + descargar */}
                {!showSendChoice ? (
                    <div className="od-actions-row">
                        <button className="od-action-btn primary" onClick={() => setShowSendChoice(true)} disabled={sendingPDF}>
                            {sendingPDF ? <Loader2 size={18} className="spinner" /> : <FileText size={18} />}
                            {sendingPDF ? 'Enviando...' : 'Enviar Resumen'}
                        </button>
                        <button className="od-action-btn outline" onClick={async () => await downloadOrderPDF(order, client, motorcycle)}>
                            <Download size={18} /> Descargar PDF
                        </button>
                    </div>
                ) : (
                    <div className="od-send-choice">
                        <div className="od-send-choice-header">
                            <span>Enviar resumen como:</span>
                            <button className="od-send-choice-close" onClick={() => setShowSendChoice(false)}>&times;</button>
                        </div>
                        <div className="od-actions-row">
                            <button className="od-action-btn primary" onClick={() => { setShowSendChoice(false); handleSendPDF(); }} disabled={sendingPDF}>
                                <FileText size={16} /> PDF
                            </button>
                            <button className="od-action-btn wa-text" onClick={handleSendText} disabled={sendingPDF}>
                                <MessageCircle size={16} /> Texto
                            </button>
                        </div>
                    </div>
                )}

                {/* Fila secundaria */}
                <div className="od-actions-row">
                    <button className="od-action-btn secondary" onClick={() => setShowStatusModal(true)}>
                        <Edit2 size={16} /> Estado
                    </button>
                    {!order.is_paid && (
                        <button className="od-action-btn success" onClick={() => setShowPaymentModal(true)}>
                            <DollarSign size={16} /> Registrar Pago
                        </button>
                    )}
                </div>

                {/* Finalizar */}
                {statusName !== 'Entregada' && (order.is_paid || statusName === 'Lista para Entregar') && (
                    <button className="od-action-btn finish" onClick={() => handleStatusChange('Entregada')}>
                        <CheckCircle size={18} /> Finalizar Orden
                    </button>
                )}

                {/* Cancelar */}
                <button className="od-cancel-link" onClick={handleBeginCancellation}>
                    <Trash2 size={14} /> Cancelar Orden
                </button>
            </div>

            {/* ── HISTORIAL ── */}
            {order.history?.length > 0 && (
                <div className="od-section">
                    <div className="od-section-header">
                        <Clock size={18} />
                        <span>Historial</span>
                    </div>
                    <div className="od-section-body">
                        <div className="timeline">
                            {order.history.map((entry, idx) => (
                                <div key={idx} className="timeline-item">
                                    <div className="timeline-dot" />
                                    <div className="timeline-content">
                                        <div className="timeline-header">
                                            <strong>{entry.new_status}</strong>
                                            <span className="timeline-time">
                                                {new Date(entry.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {entry.notes && <p className="timeline-note">{entry.notes}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

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
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">Registrar Pago Completo</h3>
                                <button className="modal-close" onClick={() => setShowPaymentModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body">
                                {/* Order Summary */}
                                {(() => {
                                    // Always calculate from services first (most accurate source)
                                    let laborTotal = 0;
                                    let partsTotal = 0;

                                    if (order.services?.length > 0) {
                                        order.services.forEach(svc => {
                                            const svcLabor = parseFloat(svc.labor_cost) || 0;
                                            const svcMaterials = parseFloat(svc.materials_cost) || 0;
                                            const svcPrice = parseFloat(svc.price) || 0;

                                            // If service has breakdown, use it
                                            if (svcLabor > 0 || svcMaterials > 0) {
                                                laborTotal += svcLabor;
                                                partsTotal += svcMaterials;
                                            } else {
                                                // No breakdown, price is treated as labor
                                                laborTotal += svcPrice;
                                            }
                                        });
                                    }

                                    // Fallback to order totals if no services calculated
                                    if (laborTotal === 0 && partsTotal === 0) {
                                        laborTotal = parseFloat(order.labor_total) || 0;
                                        partsTotal = parseFloat(order.parts_total) || 0;
                                    }

                                    const totalAmount = order.total_amount || (laborTotal + partsTotal);
                                    const advancePayment = order.advance_payment || 0;
                                    const remaining = Math.max(0, totalAmount - advancePayment);

                                    return (
                                        <div style={{
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: 'var(--radius-md)',
                                            padding: 'var(--spacing-md)',
                                            marginBottom: 'var(--spacing-md)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Mano de obra:</span>
                                                <span style={{ fontWeight: '500' }}>${laborTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Refacciones:</span>
                                                <span style={{ fontWeight: '500' }}>${partsTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border-color)', marginBottom: '8px' }}>
                                                <span style={{ fontWeight: '600' }}>Total:</span>
                                                <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            {advancePayment > 0 && (
                                                <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                        <span style={{ color: 'var(--success)' }}>Anticipo recibido:</span>
                                                        <span style={{ color: 'var(--success)', fontWeight: '500' }}>-${advancePayment.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                                                        <span style={{ fontWeight: '700', color: 'var(--primary)' }}>Por cobrar:</span>
                                                        <span style={{ fontWeight: '800', fontSize: '1.25rem', color: 'var(--primary)' }}>${remaining.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })()}

                                <p style={{
                                    fontSize: '0.875rem',
                                    color: 'var(--text-muted)',
                                    textAlign: 'center',
                                    marginBottom: '0'
                                }}>
                                    Al confirmar, la orden se marcará como pagada y finalizada.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>
                                    Cancelar
                                </button>
                                <button
                                    className="btn btn-success"
                                    onClick={() => {
                                        // Always calculate from services first (most accurate source)
                                        let laborTotal = 0;
                                        let partsTotal = 0;

                                        if (order.services?.length > 0) {
                                            order.services.forEach(svc => {
                                                const svcLabor = parseFloat(svc.labor_cost) || 0;
                                                const svcMaterials = parseFloat(svc.materials_cost) || 0;
                                                const svcPrice = parseFloat(svc.price) || 0;

                                                // If service has breakdown, use it
                                                if (svcLabor > 0 || svcMaterials > 0) {
                                                    laborTotal += svcLabor;
                                                    partsTotal += svcMaterials;
                                                } else {
                                                    // No breakdown, price is treated as labor
                                                    laborTotal += svcPrice;
                                                }
                                            });
                                        }

                                        // Fallback to order totals if no services calculated
                                        if (laborTotal === 0 && partsTotal === 0) {
                                            laborTotal = parseFloat(order.labor_total) || 0;
                                            partsTotal = parseFloat(order.parts_total) || 0;
                                        }

                                        // Update finalization form with calculated values
                                        setFinalizationForm({
                                            serviceDescription: '',
                                            laborCost: laborTotal.toString(),
                                            partsCost: partsTotal.toString()
                                        });
                                        setPaymentAmount('');

                                        // Call the payment handler
                                        handlePaymentUpdate();
                                    }}
                                >
                                    <CheckCircle size={18} />
                                    Confirmar Pago
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
        /* Reglas locales no cubiertas por OrderDetail.css ni index.css */
        .order-detail .timeline {
          position: relative;
          padding-left: 24px;
        }
        .order-detail .timeline::before {
          content: '';
          position: absolute;
          left: 6px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--border-color, #e5e7eb);
        }
        .order-detail .timeline-item {
          position: relative;
          padding-bottom: 14px;
        }
        .order-detail .timeline-dot {
          position: absolute;
          left: -22px;
          top: 4px;
          width: 10px;
          height: 10px;
          background: #dc2626;
          border-radius: 50%;
        }
        .order-detail .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 2px;
        }
        .order-detail .timeline-time {
          font-size: 12px;
          color: #9ca3af;
        }
        .order-detail .timeline-note {
          font-size: 13px;
          color: #6b7280;
          margin: 4px 0 0;
        }

        .order-detail .status-options {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .order-detail .status-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: #fafafa;
          border: 2px solid #e5e7eb;
          border-radius: 10px;
          color: #1f2937;
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
          font-weight: 600;
          transition: all 120ms ease;
          width: 100%;
        }
        .order-detail .status-option:hover:not(:disabled) {
          border-color: #dc2626;
          background: #fff;
        }
        .order-detail .status-option:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .order-detail .status-option.current {
          border-color: #dc2626;
          background: #fee2e2;
        }
        .order-detail .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .order-detail .current-badge {
          margin-left: auto;
          font-size: 11px;
          font-weight: 800;
          color: #dc2626;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .order-detail .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
          color: #1f2937;
        }
        .order-detail .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #dc2626;
        }

        .order-detail .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
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
