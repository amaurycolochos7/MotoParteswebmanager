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

    // ===== PDF + WHATSAPP HANDLER =====
    const handleSendPDF = async () => {
        if (!client?.phone) {
            showToast('Este cliente no tiene número de teléfono', 'error');
            return;
        }
        setSendingPDF(true);
        try {
            // Generate PDF blob
            const pdfBlob = await generateOrderPDFBlob(order, client, motorcycle);
            const filename = `orden-${order.order_number}-${Date.now()}.pdf`;

            // Upload PDF to storage
            const uploadResult = await sendMessageWithPDF(client.phone, '', pdfBlob, filename);

            if (!uploadResult.success) {
                throw new Error(uploadResult.error || 'Error al subir PDF');
            }

            // Build WhatsApp message with PDF link
            const motoInfo = motorcycle ? `${motorcycle.brand} ${motorcycle.model}` : 'N/A';
            const laborAmt = parseFloat(order.labor_total) || 0;
            const partsAmt = parseFloat(order.parts_total) || 0;
            const totalAmt = parseFloat(order.total_amount) || 0;

            let msgLines = [
                `*${client.full_name}*,`,
                ``,
                `📄 *RESUMEN DE SERVICIO - ${order.order_number}*`,
                ``,
                `Moto: *${motoInfo}*`,
            ];

            if (totalAmt > 0) {
                msgLines.push(``);
                if (laborAmt > 0) msgLines.push(`Mano de obra: *$${laborAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*`);
                if (partsAmt > 0) msgLines.push(`Refacciones: *$${partsAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*`);
                msgLines.push(`*TOTAL: $${totalAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*`);
            }

            msgLines.push(``);
            msgLines.push(`📎 Resumen en PDF:`);
            msgLines.push(uploadResult.pdfUrl);
            msgLines.push(``);
            msgLines.push(`Gracias por su preferencia.`);
            msgLines.push(`— *MotoPartes Club*`);

            const message = msgLines.join('\n');

            // Send WhatsApp message
            const waResult = await sendDirectMessage(user.id, client.phone, message, order.id);

            if (waResult.success && waResult.automated) {
                showToast('✅ PDF enviado por WhatsApp al cliente', 'success');
            } else {
                showToast('PDF subido. WhatsApp no enviado: ' + (waResult.error || 'sesión no activa'), 'warning');
            }
        } catch (error) {
            console.error('Error sending PDF:', error);
            showToast('Error al enviar PDF: ' + error.message, 'error');
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
                if (order.mechanic_notes.includes('|')) {
                    order.mechanic_notes.split(' | ').forEach(item => {
                        msgLines.push(`  • ${item}`);
                    });
                } else {
                    msgLines.push(`  • ${order.mechanic_notes}: $${laborAmt.toLocaleString('es-MX')}`);
                }
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

            {/* Falla reportada (si existe) */}
            {order.customer_complaint && (
                <div className="od-complaint" style={{ marginBottom: 'var(--spacing-md)' }}>
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
                {/* PDF y WhatsApp */}
                {!showSendChoice ? (
                    <button className="od-action-btn primary" onClick={() => setShowSendChoice(true)} disabled={sendingPDF}>
                        {sendingPDF ? <Loader2 size={20} className="spinner" /> : <FileText size={20} />}
                        {sendingPDF ? 'Enviando...' : 'Enviar Resumen al Cliente'}
                    </button>
                ) : (
                    <div className="od-send-choice">
                        <p className="od-send-choice-title">¿Cómo enviar el resumen?</p>
                        <button className="od-action-btn primary" onClick={() => { setShowSendChoice(false); handleSendPDF(); }} disabled={sendingPDF}>
                            <FileText size={18} /> Enviar PDF por WhatsApp
                        </button>
                        <button className="od-action-btn success" onClick={handleSendText} disabled={sendingPDF}>
                            <MessageCircle size={18} /> Enviar como Texto por WhatsApp
                        </button>
                        <button className="od-action-btn outline" style={{ fontSize: '0.85rem', padding: '10px' }} onClick={() => setShowSendChoice(false)}>
                            Cancelar
                        </button>
                    </div>
                )}
                <button className="od-action-btn outline" onClick={() => downloadOrderPDF(order, client, motorcycle)}>
                    <Download size={18} /> Descargar PDF
                </button>

                {/* Pago */}
                {!order.is_paid && (
                    <button className="od-action-btn success" onClick={() => setShowPaymentModal(true)}>
                        <DollarSign size={18} /> Registrar Pago Completo
                    </button>
                )}

                {/* Estado */}
                <button className="od-action-btn secondary" onClick={() => setShowStatusModal(true)}>
                    <Edit2 size={18} /> Cambiar Estado
                </button>

                {/* Finalizar */}
                {statusName !== 'Entregada' && (order.is_paid || statusName === 'Lista para Entregar') && (
                    <button className="od-action-btn finish" onClick={() => handleStatusChange('Entregada')}>
                        <CheckCircle size={20} /> Finalizar Orden
                    </button>
                )}

                {/* Cancelar - discreto */}
                <button className="od-action-btn danger-outline" onClick={handleBeginCancellation}>
                    <Trash2 size={16} /> Cancelar Orden
                </button>
            </div>

            {/* ── HISTORIAL ── */}
            {order.history?.length > 0 && (
                <div className="od-section" style={{ marginTop: 'var(--spacing-md)' }}>
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
        /* ── NEW FLAT LAYOUT ── */
        .od-section {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          margin-bottom: var(--spacing-md);
          overflow: hidden;
        }
        .od-section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          font-weight: 600;
          font-size: 0.95rem;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-primary);
        }
        .od-section-header .badge { margin-left: 4px; font-size: 0.75rem; }
        .od-section-body {
          padding: 12px 16px;
        }
        .od-service-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid rgba(0,0,0,0.04);
        }
        .od-service-row:last-of-type { border-bottom: none; }
        .od-service-name {
          flex: 1;
          word-break: break-word;
          font-size: 0.9rem;
        }
        .od-service-price {
          font-weight: 700;
          color: var(--primary);
          white-space: nowrap;
          margin-left: 12px;
        }
        .od-empty-text {
          color: var(--text-muted);
          font-style: italic;
          font-size: 0.875rem;
          padding: 8px 0;
          margin: 0;
        }
        .od-complaint {
          margin-top: 8px;
          padding: 10px 12px;
          background: rgba(245,158,11,0.08);
          border-radius: var(--radius-md);
          font-size: 0.875rem;
        }
        .od-complaint-label { font-weight: 600; color: var(--text-secondary); }
        .od-complaint p { margin: 4px 0 0; }
        .od-add-btn {
          margin-top: 8px;
          padding: 10px;
          font-size: 0.85rem;
          background: transparent;
          border: 1px dashed var(--border-color);
          border-radius: var(--radius-md);
          color: var(--text-muted);
          cursor: pointer;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .od-add-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
          background: rgba(59,130,246,0.05);
        }
        .od-edit-btn {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          font-size: 0.8rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--primary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .od-edit-btn:hover { background: rgba(59,130,246,0.08); }
        .od-edit-btn.cancel { color: var(--text-muted); }

        /* Costs form */
        .od-costs-form { display: flex; flex-direction: column; gap: 12px; }
        .od-costs-field label { display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 4px; font-weight: 600; }
        .od-input-wrap {
          display: flex;
          align-items: center;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        .od-input-wrap span {
          padding: 0 8px;
          color: var(--text-muted);
          font-weight: 600;
        }
        .od-input-wrap input {
          flex: 1;
          border: none;
          background: transparent;
          padding: 10px 8px;
          font-size: 1rem;
          outline: none;
          color: var(--text-primary);
        }
        .od-input-wrap.small { max-width: 120px; }
        .od-input-wrap.small input { padding: 8px 6px; font-size: 0.9rem; }
        .od-costs-parts { margin-top: 4px; }
        .od-costs-parts-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .od-costs-parts-hdr label { font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; }
        .od-costs-parts-hdr button {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.8rem;
          color: var(--primary);
          background: none;
          border: none;
          cursor: pointer;
        }
        .od-part-row {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-bottom: 8px;
        }
        .od-part-row input[type="text"] {
          flex: 1;
          padding: 8px 10px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .od-rm-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
        }
        .od-rm-btn:hover { color: var(--danger); }
        .od-costs-total {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-top: 1px solid var(--border-color);
          font-size: 0.95rem;
        }
        .od-costs-total strong { color: var(--primary); font-size: 1.1rem; }
        .od-save-btn {
          width: 100%;
          padding: 12px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: opacity 0.2s;
        }
        .od-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Costs display */
        .od-cost-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }
        .od-cost-row.part { padding-left: 12px; font-size: 0.85rem; }
        .od-cost-val { font-weight: 600; color: var(--text-primary); }
        .od-cost-row.total {
          border-top: 2px solid var(--border-color);
          margin-top: 6px;
          padding-top: 8px;
          font-weight: 700;
          font-size: 1.05rem;
          color: var(--text-primary);
        }
        .od-cost-row.total span:last-child { color: var(--primary); font-size: 1.15rem; }
        .od-cost-row.advance { color: var(--success); font-size: 0.85rem; }
        .od-paid-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 10px;
          padding: 8px;
          background: rgba(16,185,129,0.1);
          color: var(--success);
          border-radius: var(--radius-md);
          font-weight: 700;
          font-size: 0.85rem;
        }

        /* Actions section */
        .od-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin: var(--spacing-lg) 0;
        }
        .od-send-choice {
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: var(--radius-lg);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .od-send-choice-title {
          text-align: center;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 4px 0;
        }
        .od-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 16px;
          border-radius: var(--radius-lg);
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .od-action-btn.primary {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
        }
        .od-action-btn.primary:disabled { opacity: 0.6; }
        .od-action-btn.outline {
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-primary);
        }
        .od-action-btn.outline:hover { background: var(--bg-secondary); }
        .od-action-btn.success {
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
        }
        .od-action-btn.secondary {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
        }
        .od-action-btn.finish {
          background: linear-gradient(135deg, #10b981, #047857);
          color: white;
        }
        .od-action-btn.danger-outline {
          background: transparent;
          border: 1px solid rgba(239,68,68,0.3);
          color: var(--danger, #ef4444);
          font-size: 0.85rem;
          padding: 10px;
        }
        .od-action-btn.danger-outline:hover { background: rgba(239,68,68,0.05); }

        /* ── EXISTING STYLES (kept) ── */
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

        /* ===== COSTS PANEL ===== */
        .costs-panel {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 16px;
        }
        .costs-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.06), rgba(59, 130, 246, 0.04));
        }
        .costs-panel-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: 1rem;
          color: var(--text-primary);
        }
        .costs-panel-title svg { color: #10b981; }
        .costs-edit-btn, .costs-cancel-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--primary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .costs-edit-btn:hover { background: rgba(59, 130, 246, 0.08); border-color: var(--primary); }
        .costs-cancel-btn { color: var(--text-muted); }
        .costs-cancel-btn:hover { background: rgba(239, 68, 68, 0.08); color: #ef4444; border-color: #ef4444; }

        .costs-edit-form { padding: 20px; }
        .costs-field { margin-bottom: 16px; }
        .costs-label {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .costs-input-wrap {
          display: flex;
          align-items: center;
          background: var(--bg-color);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          overflow: hidden;
          transition: border-color 0.15s;
        }
        .costs-input-wrap:focus-within { border-color: var(--primary); }
        .costs-input-wrap.small { flex: 0 0 130px; }
        .costs-currency {
          padding: 0 12px;
          font-weight: 700;
          color: var(--text-muted);
          font-size: 0.95rem;
        }
        .costs-input {
          flex: 1;
          border: none;
          background: transparent;
          padding: 10px 12px 10px 0;
          font-size: 1rem;
          color: var(--text-primary);
          outline: none;
          font-family: inherit;
        }
        .costs-parts-section { margin-bottom: 16px; }
        .costs-parts-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .costs-add-part-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          border-radius: 6px;
          font-size: 0.82rem;
          font-weight: 600;
          border: 1px dashed var(--primary);
          background: transparent;
          color: var(--primary);
          cursor: pointer;
          transition: background 0.15s;
        }
        .costs-add-part-btn:hover { background: rgba(59, 130, 246, 0.08); }
        .costs-part-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .costs-part-name {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 10px;
          background: var(--bg-color);
          color: var(--text-primary);
          font-size: 0.9rem;
          outline: none;
          font-family: inherit;
          transition: border-color 0.15s;
        }
        .costs-part-name:focus { border-color: var(--primary); }
        .costs-remove-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .costs-remove-btn:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; border-color: #ef4444; }
        .costs-calculated-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: rgba(16, 185, 129, 0.06);
          border-radius: 10px;
          margin-bottom: 16px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .costs-total-amount { color: #10b981; font-size: 1.1rem; font-weight: 800; }
        .costs-save-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #10b981, #059669);
          color: white;
          font-weight: 700;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .costs-save-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
        .costs-save-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .costs-save-btn .spinner { animation: spin 1s linear infinite; }

        .costs-display { padding: 20px; }
        .costs-display-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          font-size: 0.95rem;
          color: var(--text-primary);
        }
        .costs-display-row.total {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 2px solid var(--border-color);
          font-weight: 800;
          font-size: 1.1rem;
          color: #10b981;
        }
        .costs-display-label { color: var(--text-secondary); font-weight: 500; }
        .costs-display-value { font-weight: 700; }
        .costs-parts-list {
          padding: 12px;
          background: rgba(0,0,0,0.02);
          border-radius: 10px;
          margin: 8px 0;
        }
        .costs-display-part {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 0.88rem;
          color: var(--text-secondary);
        }
        .costs-empty {
          text-align: center;
          padding: 24px 16px;
          color: var(--text-muted);
        }
        .costs-empty p { margin: 8px 0 4px; font-weight: 600; font-size: 0.95rem; }
        .costs-empty span { font-size: 0.82rem; }

        /* ===== PDF ACTIONS ===== */
        .pdf-actions-card {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
        }
        .btn-send-pdf {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #25d366, #128c7e);
          color: white;
          font-weight: 700;
          font-size: 0.92rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-send-pdf:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); }
        .btn-send-pdf:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .btn-send-pdf .spinner { animation: spin 1s linear infinite; }
        .btn-download-pdf {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 14px 18px;
          border-radius: 14px;
          border: 1px solid var(--border-color);
          background: var(--card-bg);
          color: var(--text-secondary);
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-download-pdf:hover { border-color: var(--primary); color: var(--primary); }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
