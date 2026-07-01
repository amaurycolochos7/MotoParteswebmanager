import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Phone,
    MessageCircle,
    ChevronDown,
    Camera,
    Plus,
    X,
    Trash2,
    Loader2,
    Save,
    Download,
    FileText,
    AlertTriangle,
    Clock,
    Wrench,
    DollarSign,
    Bike,
    User,
    Send,
    Edit2,
    Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ordersService } from '../../lib/api';
import {
    getStatusChangeMessage,
    getEvidenceMessage,
    sendDirectMessage,
    sendEvidence,
} from '../../utils/whatsappHelper';
import { downloadOrderPDF } from '../../utils/pdfGenerator';
import { getOrderPhotos, saveOrderPhotos } from '../../services/photoStorageService';
import Toast from '../../components/ui/Toast';
import OrderPhotosDownload from '../../components/ui/OrderPhotosDownload';
import OrderPaymentsSection from '../../components/orders/OrderPaymentsSection';
import './OrderDetail.css';

/* =========================================================================
   Helpers
   ========================================================================= */

const fmtMXN = (n) =>
    `$${(parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

// Duración legible: "2d 4h", "3h 25min", "12min".
function formatDuration(ms) {
    if (ms == null || ms < 0 || Number.isNaN(ms)) return '—';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}min`;
    return `${mins}min`;
}

function durationBetween(fromISO, toISO) {
    if (!fromISO) return '—';
    const from = new Date(fromISO).getTime();
    const to = toISO ? new Date(toISO).getTime() : Date.now();
    return formatDuration(to - from);
}

const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
    });

const resizeImage = (base64, maxWidth = 1200) =>
    new Promise((resolve) => {
        const img = new window.Image();
        img.src = base64;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => resolve(base64);
    });

// Los 5 estados canónicos que el mecánico maneja en esta pantalla.
const CANON = [
    { key: 'Registrada', label: 'Registrada' },
    { key: 'En Reparación', label: 'En reparación' },
    { key: 'Lista para Entregar', label: 'Lista' },
    { key: 'Entregada', label: 'Entregada' },
    { key: 'Cancelada', label: 'Cancelada' },
];

// Colapsa cualquier nombre de estado de la BD a uno de los 5 canónicos.
function statusToCanonical(name = '') {
    const n = (name || '').toLowerCase();
    if (n.includes('cancel') || n.includes('rechaz')) return 'Cancelada';
    if (n.includes('lista') || n.includes('entregar') || n.includes('recoger')) return 'Lista para Entregar';
    if (n.includes('entregada')) return 'Entregada';
    if (n.includes('repar') || n.includes('proceso') || n.includes('revis') || n.includes('autoriz') || n.includes('refacc') || n.includes('diagn')) return 'En Reparación';
    return 'Registrada';
}

// Resuelve el objeto de estado real de la BD para un canónico dado.
function resolveDbStatus(statuses, canonKey) {
    const direct = statuses.find((s) => s.name.toLowerCase() === canonKey.toLowerCase());
    if (direct) return direct;
    if (canonKey === 'En Reparación') {
        const priority = [/en reparaci/i, /en proceso/i, /proceso/i, /revis/i, /diagn/i, /refacc/i, /autoriz/i];
        for (const re of priority) {
            const m = statuses.find((s) => re.test(s.name));
            if (m) return m;
        }
    }
    return statuses.find((s) => statusToCanonical(s.name) === canonKey) || null;
}

/* ---- Accordion ------------------------------------------------------- */
function Accordion({ icon, title, summary, open, onToggle, children, tone = 'default', trailing = null }) {
    return (
        <div className={`od-acc od-acc--${tone}${open ? ' is-open' : ''}`}>
            <button type="button" className="od-acc__head" onClick={onToggle} aria-expanded={open}>
                {icon && <span className="od-acc__icon">{icon}</span>}
                <span className="od-acc__titles">
                    <span className="od-acc__title">{title}</span>
                    {summary && <span className="od-acc__summary">{summary}</span>}
                </span>
                {trailing}
                <ChevronDown size={18} className="od-acc__chev" />
            </button>
            <div className="od-acc__panel">
                <div className="od-acc__inner">{children}</div>
            </div>
        </div>
    );
}

/* =========================================================================
   OrderDetail
   ========================================================================= */

export default function OrderDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, canDeleteOrders, isMasterMechanic, isAdmin, activeWorkspace } = useAuth();
    const { orders, clients, statuses, updateOrderStatus, updateOrder, deleteOrder, refreshOrders } = useData();

    // ¿Puede tocar dinero (precios, abonos)? El auxiliar NO.
    const canManageMoney =
        (typeof isMasterMechanic === 'function' && isMasterMechanic()) ||
        (typeof isAdmin === 'function' && isAdmin());

    const [orderFinance, setOrderFinance] = useState(null);
    const [savingDelivery, setSavingDelivery] = useState(false);

    const [fetchedOrder, setFetchedOrder] = useState(null);
    const [loadingOrder, setLoadingOrder] = useState(false);

    const [toast, setToast] = useState(null);
    const [changingStatus, setChangingStatus] = useState(false);

    // Accordions: todos cerrados por defecto para bajar la carga cognitiva.
    // Permitimos varios abiertos a la vez (el mecánico suele comparar costos y
    // evidencias sin cerrar uno para abrir otro).
    const [open, setOpen] = useState({
        moto: true, // la moto es lo primero: arranca abierta
        cliente: false,
        evidencias: false,
        costos: false,
        pagos: false,
        historial: false,
    });
    const toggle = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

    // Cancelación
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [cancellationReason, setCancellationReason] = useState('');

    // Envío de resumen
    const [showSendChoice, setShowSendChoice] = useState(false);
    const [sendingPDF, setSendingPDF] = useState(false);

    // Costos
    const [editingCosts, setEditingCosts] = useState(false);
    const [costsLabor, setCostsLabor] = useState([]);
    const [costsParts, setCostsParts] = useState([]);
    const [costsMarkAsPaid, setCostsMarkAsPaid] = useState(false);
    const [savingCosts, setSavingCosts] = useState(false);

    // Evidencias
    const [evidence, setEvidence] = useState([]);
    const [evFile, setEvFile] = useState(null);
    const [evNote, setEvNote] = useState('');
    const [sendingEv, setSendingEv] = useState(false);

    const pagosRef = useRef(null);

    const showToast = (message, type = 'success') => setToast({ message, type });

    // --- Cargar orden ---
    const contextOrder = useMemo(() => orders.find((o) => o.id === id), [orders, id]);

    useEffect(() => {
        const fetchOrder = async () => {
            if (!contextOrder && id && !fetchedOrder && !loadingOrder) {
                setLoadingOrder(true);
                try {
                    const dbOrder = await ordersService.getById(id);
                    if (dbOrder) setFetchedOrder(dbOrder);
                } catch (error) {
                    console.error('Error fetching order:', error);
                } finally {
                    setLoadingOrder(false);
                }
            }
        };
        fetchOrder();
    }, [contextOrder, id, fetchedOrder, loadingOrder]);

    const order = contextOrder || fetchedOrder;

    const client = useMemo(
        () => order?.client || (order?.client_id && clients.find((c) => c.id === order.client_id)),
        [order, clients]
    );
    const motorcycle = useMemo(() => order?.motorcycle, [order]);

    // Cargar evidencias (additionalPhotos) desde IndexedDB
    useEffect(() => {
        let alive = true;
        (async () => {
            if (order?.id) {
                const rec = await getOrderPhotos(order.id);
                if (alive) setEvidence(rec?.additionalPhotos || []);
            }
        })();
        return () => {
            alive = false;
        };
    }, [order?.id]);

    // --- Estados de carga / no encontrado ---
    if (loadingOrder) {
        return (
            <div className="order-detail">
                <div className="od-loading">
                    <Loader2 size={28} className="spinner" />
                    <p>Cargando orden…</p>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="order-detail">
                <div className="od-notfound">
                    <AlertTriangle size={40} />
                    <h2>Orden no encontrada</h2>
                    <button className="od-action-btn secondary" onClick={() => navigate(-1)}>
                        Volver
                    </button>
                </div>
            </div>
        );
    }

    /* ---- Datos derivados ---- */
    const statusName = typeof order.status === 'object' ? order.status?.name : order.status;
    const currentCanonical = statusToCanonical(statusName);
    const isTerminal = currentCanonical === 'Entregada' || currentCanonical === 'Cancelada';

    const motoTitle = `${motorcycle?.brand || ''} ${motorcycle?.model || ''}`.trim() || 'Moto';
    const motoSummary = [motorcycle?.brand && motorcycle?.model ? motoTitle : null, motorcycle?.year, motorcycle?.plates || 'Sin placas']
        .filter(Boolean)
        .join(' · ');

    // Tiempos (a partir del historial de estados)
    const history = Array.isArray(order.history) ? order.history : [];
    const repairEntry = history.find((h) => /repar|proceso|revis|diagn/i.test(h.new_status || ''));
    const readyEntry = history.find((h) => /lista|entregar/i.test(h.new_status || ''));
    const deliveredEntry = history.find((h) => /entregada/i.test(h.new_status || ''));
    const shopEnd = deliveredEntry?.created_at || null;
    const repairEnd = readyEntry?.created_at || deliveredEntry?.created_at || null;
    const timeInShop = durationBetween(order.created_at, shopEnd);
    const timeInRepair = repairEntry ? durationBetween(repairEntry.created_at, repairEnd) : '—';

    // Costos
    const laborTotal = parseFloat(order.labor_total) || 0;
    const partsList = order.parts || [];
    const partsTotal =
        parseFloat(order.parts_total) ||
        partsList.reduce((s, p) => s + (parseFloat(p.price) || 0) * (parseInt(p.quantity) || 1), 0);
    const orderTotal = parseFloat(order.total_amount) || laborTotal + partsTotal;
    const hasCosts = laborTotal > 0 || partsList.length > 0 || orderTotal > 0;
    const costsSummary = hasCosts
        ? `M.O. ${fmtMXN(laborTotal)} · Refacc. ${fmtMXN(partsTotal)} · Total ${fmtMXN(orderTotal)}`
        : 'Sin costos registrados';

    // Pagos
    const balance = Number(orderFinance?.balance || 0);
    const paymentStatus = orderFinance?.payment_status || null;
    const pagosSummary =
        orderFinance && (orderFinance.paid > 0 || orderTotal > 0)
            ? `${paymentStatus || 'Pendiente'} · Saldo ${fmtMXN(balance)}`
            : 'Sin abonos registrados';

    /* =====================================================================
       Handlers
       ===================================================================== */

    const handleStatusChange = async (canonKey) => {
        if (canonKey === 'Cancelada') {
            handleBeginCancellation();
            return;
        }
        const statusObj = resolveDbStatus(statuses, canonKey);
        if (!statusObj) {
            showToast('No se encontró ese estado en el catálogo del taller', 'error');
            return;
        }
        if (statusObj.name === statusName) return;

        // Entregar con saldo pendiente requiere autorización del maestro/dueño.
        let note = '';
        const isDelivered = /entregada/i.test(statusObj.name);
        if (isDelivered && balance > 0) {
            if (!canManageMoney) {
                showToast('Hay saldo pendiente. Solo el maestro puede autorizar la entrega.', 'error');
                return;
            }
            const reason = window.prompt(
                `Esta orden tiene un SALDO PENDIENTE de ${fmtMXN(balance)}.\nEscribe el motivo/autorización para entregar con saldo:`
            );
            if (!reason) return;
            note = `[ENTREGA CON SALDO ${fmtMXN(balance)}] ${reason}`;
        }

        setChangingStatus(true);
        try {
            await updateOrderStatus(order.id, statusObj.id, note);
            showToast(`Estado actualizado: ${statusObj.name}`, 'success');

            if (statusObj.name !== statusName && client?.phone) {
                try {
                    const servicesTotal = (order.services || []).reduce((sum, svc) => sum + (svc.price || 0), 0);
                    const message = getStatusChangeMessage(statusObj.name, {
                        clientName: client.full_name,
                        motorcycle: motoTitle,
                        orderNumber: order.order_number,
                        trackingLink: null,
                        totalAmount: order.total_amount || servicesTotal,
                        services: order.services,
                    });
                    const result = await sendDirectMessage(user.id, client.phone, message, order.id);
                    if (result.success && result.automated) {
                        showToast('Cliente notificado por WhatsApp', 'success');
                    }
                } catch (e) {
                    console.error('Error enviando notificación:', e);
                }
            }
            refreshOrders?.();
        } catch (e) {
            console.error('Error cambiando estado:', e);
            showToast('No se pudo cambiar el estado', 'error');
        } finally {
            setChangingStatus(false);
        }
    };

    // --- Costos ---
    const handleStartEditCosts = () => {
        const existingLabor = (order.services || [])
            .filter((s) => parseFloat(s.price) - parseFloat(s.cost || 0) > 0)
            .map((s) => ({ id: s.id, name: s.name, price: String(parseFloat(s.price) - parseFloat(s.cost || 0)) }));
        if (existingLabor.length === 0 && laborTotal > 0) {
            existingLabor.push({ id: `labor-${Date.now()}`, name: 'Mano de obra general', price: String(laborTotal) });
        }
        setCostsLabor(existingLabor.length > 0 ? existingLabor : [{ id: `labor-${Date.now()}`, name: '', price: '' }]);

        const existingParts = partsList.map((p) => ({
            id: p.id,
            name: p.name,
            price: String(parseFloat(p.price)),
            quantity: p.quantity || 1,
        }));
        setCostsParts(existingParts.length > 0 ? existingParts : [{ id: `new-${Date.now()}`, name: '', price: '', quantity: 1 }]);
        setCostsMarkAsPaid(order?.is_paid || false);
        setEditingCosts(true);
        setOpen((p) => ({ ...p, costos: true }));
    };

    const handleSaveCosts = async () => {
        setSavingCosts(true);
        try {
            const validParts = costsParts.filter((p) => p.name.trim() && parseFloat(p.price) > 0);
            const validLabor = costsLabor.filter((l) => parseFloat(l.price) > 0);
            const labor = validLabor.reduce((sum, l) => sum + (parseFloat(l.price) || 0), 0);
            const laborDescription = validLabor
                .filter((l) => l.name.trim())
                .map((l) => `${l.name}: ${fmtMXN(l.price)}`)
                .join(' | ');

            const result = await ordersService.updateCosts(order.id, {
                labor_total: labor,
                parts: validParts.map((p) => ({
                    name: p.name.trim(),
                    price: parseFloat(p.price) || 0,
                    quantity: parseInt(p.quantity) || 1,
                })),
                mark_as_paid: costsMarkAsPaid,
            });
            if (laborDescription) await updateOrder(order.id, { mechanic_notes: laborDescription });
            if (result.error) throw result.error;

            showToast('Costos guardados', 'success');
            setEditingCosts(false);
            refreshOrders?.();
        } catch (error) {
            console.error('Error saving costs:', error);
            showToast('Error al guardar costos', 'error');
        } finally {
            setSavingCosts(false);
        }
    };

    // --- Evidencias ---
    const handleEvidenceFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const base64 = await fileToBase64(file);
            const resized = await resizeImage(base64, 1200);
            setEvFile({ url: resized, name: file.name });
        } catch {
            showToast('No se pudo procesar la imagen', 'error');
        }
        e.target.value = '';
    };

    const handleSendEvidence = async () => {
        if (!evFile) {
            showToast('Adjunta una foto primero', 'warning');
            return;
        }
        setSendingEv(true);
        try {
            const item = { url: evFile.url, caption: evNote.trim(), created_at: new Date().toISOString() };
            const existing = (await getOrderPhotos(order.id)) || {};
            const additionalPhotos = [...(existing.additionalPhotos || []), item];
            await saveOrderPhotos(order.id, {
                ...existing,
                additionalPhotos,
                clientName: existing.clientName || client?.full_name,
                clientPhone: existing.clientPhone || client?.phone,
                motoInfo: existing.motoInfo || motoTitle,
            });
            setEvidence(additionalPhotos);

            if (client?.phone) {
                const caption = getEvidenceMessage(client.full_name, motoTitle, order.order_number, evNote);
                const res = await sendEvidence(user.id, client.phone, evFile.url, caption);
                if (res.success && res.automated) {
                    showToast('Evidencia enviada por WhatsApp', 'success');
                } else {
                    showToast(res.error || 'Evidencia guardada, pero no se pudo enviar por WhatsApp', 'warning');
                }
            } else {
                showToast('Evidencia guardada (el cliente no tiene teléfono)', 'info');
            }
            setEvFile(null);
            setEvNote('');
        } catch (error) {
            console.error('Error enviando evidencia:', error);
            showToast('Error al enviar evidencia', 'error');
        } finally {
            setSendingEv(false);
        }
    };

    // --- Enviar resumen ---
    const handleSendPDF = async () => {
        if (!client?.phone) {
            showToast('Este cliente no tiene número de teléfono', 'error');
            return;
        }
        setSendingPDF(true);
        setShowSendChoice(false);
        try {
            const token = localStorage.getItem('motopartes_token');
            const res = await fetch(`/api/order-pdf/${order.id}/send`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const result = await res.json();
            if (result.success && result.automated) showToast('PDF enviado por WhatsApp', 'success');
            else if (result.fallback) showToast('WhatsApp no disponible. Conecta el bot primero.', 'warning');
            else showToast(result.error || 'Error al enviar PDF', 'error');
        } catch (error) {
            console.error('Error sending PDF:', error);
            showToast('Error de conexión con el servidor', 'error');
        } finally {
            setSendingPDF(false);
        }
    };

    const handleSendText = async () => {
        if (!client?.phone) {
            showToast('Este cliente no tiene número de teléfono', 'error');
            return;
        }
        setSendingPDF(true);
        setShowSendChoice(false);
        try {
            const lines = [
                `Hola *${client.full_name}* 👋`,
                ``,
                `📋 *Resumen · ${order.order_number}*`,
                ``,
                `🏍️ Moto: *${motoTitle}*`,
            ];
            if ((order.services || []).length > 0) {
                lines.push('', '*Servicios:*');
                order.services.forEach((s) => lines.push(`  • ${s.name}`));
            }
            if (orderTotal > 0) {
                lines.push('', '━━━━━━━━━━');
                if (laborTotal > 0) lines.push(`Mano de obra: *${fmtMXN(laborTotal)}*`);
                if (partsTotal > 0) lines.push(`Refacciones: *${fmtMXN(partsTotal)}*`);
                lines.push(`*Total: ${fmtMXN(orderTotal)}*`);
                if (balance > 0) lines.push(`Saldo pendiente: *${fmtMXN(balance)}*`);
            }
            lines.push('', 'Gracias por su preferencia. 🙌', '', '*MotoPartes* · Taller V. Carranza');
            const message = lines.join('\n');
            const res = await sendDirectMessage(user.id, client.phone, message, order.id);
            if (res.success && res.automated) showToast('Resumen enviado por WhatsApp', 'success');
            else showToast(res.error || 'No se pudo enviar el resumen', 'warning');
        } catch (error) {
            console.error('Error sending text:', error);
            showToast('Error al enviar resumen', 'error');
        } finally {
            setSendingPDF(false);
        }
    };

    // --- Cancelación ---
    const handleBeginCancellation = () => {
        if (canDeleteOrders()) setShowDeleteConfirmModal(true);
        else setShowCancelModal(true);
    };

    const handleRequestCancellation = async () => {
        if (!cancellationReason.trim()) {
            showToast('Indica un motivo de cancelación', 'warning');
            return;
        }
        try {
            await updateOrder(order.id, {
                cancellation_reason: cancellationReason,
                cancellation_requested_at: new Date().toISOString(),
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
            showToast('Orden eliminada', 'success');
            navigate(-1);
        } catch (error) {
            console.error('Error deleting order:', error);
            showToast('Error al eliminar la orden', 'error');
        }
    };

    const handleApproveCancellation = () => setShowDeleteConfirmModal(true);
    const handleRejectCancellation = async () => {
        try {
            await updateOrder(order.id, { cancellation_reason: null, cancellation_requested_at: null });
            showToast('Solicitud de cancelación rechazada', 'success');
        } catch (error) {
            console.error('Error rejecting cancellation:', error);
            showToast('Error al rechazar la solicitud', 'error');
        }
    };

    const openPagos = () => {
        setOpen((p) => ({ ...p, pagos: true }));
        setTimeout(() => pagosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };

    const waHref = client?.phone
        ? `https://wa.me/${client.phone.replace(/\D/g, '').replace(/^0+/, '')}`
        : null;

    /* =====================================================================
       Render
       ===================================================================== */

    return (
        <div className="order-detail">
            {/* Header compacto sticky */}
            <header className="od-topbar">
                <button className="od-back" onClick={() => navigate(-1)} aria-label="Volver">
                    <ArrowLeft size={20} />
                </button>
                <div className="od-topbar__id">
                    <h1>{order.order_number}</h1>
                    <span>
                        {new Date(order.created_at).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </span>
                </div>
                <span className={`od-pill od-pill--${statusToCanonical(statusName).replace(/\s+/g, '-').toLowerCase()}`}>
                    {statusName}
                </span>
            </header>

            {/* Alerta de solicitud de cancelación (admin/maestro) */}
            {order.cancellation_requested_at && (canDeleteOrders() || user.role === 'admin') && (
                <div className="od-alert">
                    <AlertTriangle size={20} />
                    <div>
                        <strong>Solicitud de cancelación pendiente</strong>
                        <p>{order.cancellation_reason}</p>
                        <div className="od-alert__actions">
                            <button className="od-action-btn danger sm" onClick={handleApproveCancellation}>
                                Aprobar y eliminar
                            </button>
                            <button className="od-action-btn secondary sm" onClick={handleRejectCancellation}>
                                Rechazar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 1 · Datos de la moto (prioridad) */}
            <Accordion
                icon={<Bike size={16} />}
                title="Datos de la moto"
                summary={!open.moto ? motoSummary : null}
                open={open.moto}
                onToggle={() => toggle('moto')}
                tone="moto"
            >
                <div className="od-moto-hero">
                    <h2>{motoTitle}</h2>
                    <div className="od-kv">
                        <div><span>Año</span><strong>{motorcycle?.year || '—'}</strong></div>
                        <div><span>Placas</span><strong>{motorcycle?.plates || 'Sin placas'}</strong></div>
                        {motorcycle?.color && <div><span>Color</span><strong>{motorcycle.color}</strong></div>}
                        {motorcycle?.vin && <div><span>Serie</span><strong>{motorcycle.vin}</strong></div>}
                    </div>
                    {order.customer_complaint && (
                        <div className="od-complaint">
                            <span className="od-complaint__label">Falla reportada</span>
                            <p>{order.customer_complaint}</p>
                        </div>
                    )}
                </div>
            </Accordion>

            {/* 2 · Estado + Tiempo (siempre visible, sin colapsar) */}
            <section className="od-block">
                <div className="od-block__label">Estado de la orden</div>
                <div className="od-status-pills">
                    {CANON.map((s) => {
                        const active = currentCanonical === s.key;
                        return (
                            <button
                                key={s.key}
                                type="button"
                                className={`od-status-pill${active ? ' is-active' : ''} od-status-pill--${s.key.replace(/\s+/g, '-').toLowerCase()}`}
                                onClick={() => handleStatusChange(s.key)}
                                disabled={active || changingStatus}
                            >
                                {active && <Check size={13} />}
                                {s.label}
                            </button>
                        );
                    })}
                </div>

                <div className="od-time">
                    <div className="od-time__metric">
                        <Clock size={15} />
                        <div>
                            <span>Tiempo en taller</span>
                            <strong>{timeInShop}</strong>
                        </div>
                    </div>
                    <div className="od-time__metric">
                        <Wrench size={15} />
                        <div>
                            <span>Tiempo en reparación</span>
                            <strong>{timeInRepair}</strong>
                        </div>
                    </div>
                </div>

                <label className="od-eta">
                    <span>Entrega estimada</span>
                    <span className="od-eta__field">
                        <input
                            type="date"
                            defaultValue={order.estimated_delivery_at ? new Date(order.estimated_delivery_at).toISOString().slice(0, 10) : ''}
                            disabled={savingDelivery}
                            onChange={async (e) => {
                                const val = e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null;
                                setSavingDelivery(true);
                                try {
                                    await updateOrder(order.id, { estimated_delivery_at: val });
                                    showToast('Fecha de entrega actualizada', 'success');
                                } catch {
                                    showToast('No se pudo actualizar la fecha', 'error');
                                } finally {
                                    setSavingDelivery(false);
                                }
                            }}
                        />
                        {savingDelivery && <Loader2 size={14} className="spinner" />}
                    </span>
                </label>
            </section>

            {/* 3 · Cliente */}
            <Accordion
                icon={<User size={16} />}
                title="Cliente"
                summary={!open.cliente ? `${client?.full_name || 'Sin nombre'}${client?.phone ? ' · ' + client.phone : ''}` : null}
                open={open.cliente}
                onToggle={() => toggle('cliente')}
            >
                <div className="od-client">
                    <div className="od-client__info">
                        <strong>{client?.full_name || 'Sin nombre'}</strong>
                        <span>{client?.phone || 'Sin teléfono'}</span>
                    </div>
                    {client?.phone && (
                        <div className="od-client__actions">
                            <a className="od-contact-btn call" href={`tel:${client.phone}`}>
                                <Phone size={16} /> Llamar
                            </a>
                            <a className="od-contact-btn wa" href={waHref} target="_blank" rel="noreferrer">
                                <MessageCircle size={16} /> WhatsApp
                            </a>
                        </div>
                    )}
                </div>
            </Accordion>

            {/* 4 · Evidencias */}
            <Accordion
                icon={<Camera size={16} />}
                title="Evidencias"
                summary={!open.evidencias ? (evidence.length > 0 ? `${evidence.length} imagen${evidence.length > 1 ? 'es' : ''}` : 'Sin evidencias') : null}
                open={open.evidencias}
                onToggle={() => toggle('evidencias')}
            >
                <div className="od-evidence">
                    {evidence.length === 0 ? (
                        <p className="od-empty">Aún no hay evidencias registradas.</p>
                    ) : (
                        <div className="od-evidence__grid">
                            {evidence.map((ev, i) => (
                                <figure key={i} className="od-evidence__thumb">
                                    <img src={ev.url} alt={ev.caption || `Evidencia ${i + 1}`} />
                                    {ev.caption && <figcaption>{ev.caption}</figcaption>}
                                </figure>
                            ))}
                        </div>
                    )}

                    <div className="od-evidence__add">
                        {evFile ? (
                            <div className="od-evidence__preview">
                                <img src={evFile.url} alt="Nueva evidencia" />
                                <button className="od-evidence__remove" onClick={() => setEvFile(null)} aria-label="Quitar">
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <label className="od-evidence__pick">
                                <input type="file" accept="image/*" onChange={handleEvidenceFile} hidden />
                                <Camera size={18} />
                                <span>Agregar evidencia</span>
                            </label>
                        )}

                        <textarea
                            className="od-textarea"
                            placeholder="Explicación breve (ej. pastillas desgastadas)…"
                            value={evNote}
                            onChange={(e) => setEvNote(e.target.value)}
                            rows={2}
                        />

                        <button className="od-action-btn wa" onClick={handleSendEvidence} disabled={!evFile || sendingEv}>
                            {sendingEv ? <Loader2 size={16} className="spinner" /> : <Send size={16} />}
                            {sendingEv ? 'Enviando…' : 'Enviar por WhatsApp'}
                        </button>
                    </div>

                    <div className="od-evidence__entry">
                        <OrderPhotosDownload orderId={order.id} order={order} />
                    </div>
                </div>
            </Accordion>

            {/* 5 · Costos */}
            <Accordion
                icon={<DollarSign size={16} />}
                title="Costos"
                summary={!open.costos ? costsSummary : null}
                open={open.costos}
                onToggle={() => toggle('costos')}
                trailing={
                    canManageMoney && !editingCosts ? (
                        <span
                            className="od-acc__cta"
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditCosts();
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.stopPropagation();
                                    handleStartEditCosts();
                                }
                            }}
                        >
                            <Edit2 size={13} /> {hasCosts ? 'Editar' : 'Agregar'}
                        </span>
                    ) : null
                }
            >
                {editingCosts ? (
                    <div className="od-costs-form">
                        <div className="od-costs-group">
                            <div className="od-costs-group__hdr">
                                <label>Mano de obra</label>
                                <button onClick={() => setCostsLabor((p) => [...p, { id: `labor-${Date.now()}`, name: '', price: '' }])}>
                                    <Plus size={13} /> Agregar
                                </button>
                            </div>
                            {costsLabor.map((item, idx) => (
                                <div key={item.id || idx} className="od-cost-input-row">
                                    <input
                                        type="text"
                                        placeholder="Ej. Cambio de bujes"
                                        value={item.name}
                                        onChange={(e) => setCostsLabor((p) => p.map((l, i) => (i === idx ? { ...l, name: e.target.value } : l)))}
                                    />
                                    <div className="od-money">
                                        <span>$</span>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            min="0"
                                            value={item.price}
                                            onChange={(e) => setCostsLabor((p) => p.map((l, i) => (i === idx ? { ...l, price: e.target.value } : l)))}
                                        />
                                    </div>
                                    <button className="od-rm" onClick={() => setCostsLabor((p) => p.filter((_, i) => i !== idx))}>
                                        <X size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="od-costs-group">
                            <div className="od-costs-group__hdr">
                                <label>Refacciones</label>
                                <button onClick={() => setCostsParts((p) => [...p, { id: `new-${Date.now()}`, name: '', price: '', quantity: 1 }])}>
                                    <Plus size={13} /> Agregar
                                </button>
                            </div>
                            {costsParts.map((part, idx) => (
                                <div key={part.id || idx} className="od-cost-input-row">
                                    <input
                                        type="text"
                                        placeholder="Ej. Filtro de aceite"
                                        value={part.name}
                                        onChange={(e) => setCostsParts((p) => p.map((l, i) => (i === idx ? { ...l, name: e.target.value } : l)))}
                                    />
                                    <div className="od-money">
                                        <span>$</span>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            min="0"
                                            value={part.price}
                                            onChange={(e) => setCostsParts((p) => p.map((l, i) => (i === idx ? { ...l, price: e.target.value } : l)))}
                                        />
                                    </div>
                                    <button className="od-rm" onClick={() => setCostsParts((p) => p.filter((_, i) => i !== idx))}>
                                        <X size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="od-costs-total">
                            <span>Total estimado</span>
                            <strong>
                                {fmtMXN(
                                    costsLabor.reduce((s, l) => s + (parseFloat(l.price) || 0), 0) +
                                        costsParts.reduce((s, p) => s + (parseFloat(p.price) || 0) * (parseInt(p.quantity) || 1), 0)
                                )}
                            </strong>
                        </div>
                        <label className="od-check">
                            <input type="checkbox" checked={costsMarkAsPaid} onChange={(e) => setCostsMarkAsPaid(e.target.checked)} />
                            <span>Marcar como pagada (cobrada al cliente)</span>
                        </label>
                        <div className="od-costs-form__actions">
                            <button className="od-action-btn secondary" onClick={() => setEditingCosts(false)}>
                                Cancelar
                            </button>
                            <button className="od-action-btn success" onClick={handleSaveCosts} disabled={savingCosts}>
                                {savingCosts ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                ) : hasCosts ? (
                    <div className="od-costs-view">
                        {order.mechanic_notes && order.mechanic_notes.includes('|') ? (
                            order.mechanic_notes.split(' | ').map((item, idx) => (
                                <div key={`labor-${idx}`} className="od-cost-line">
                                    <span>{item.split(':')[0]}</span>
                                    <span className="od-cost-line__val">{item.split(':')[1]?.trim()}</span>
                                </div>
                            ))
                        ) : laborTotal > 0 ? (
                            <div className="od-cost-line">
                                <span>Mano de obra</span>
                                <span className="od-cost-line__val">{fmtMXN(laborTotal)}</span>
                            </div>
                        ) : null}
                        {partsList.map((p, idx) => (
                            <div key={p.id || idx} className="od-cost-line part">
                                <span>{p.name}</span>
                                <span>{fmtMXN(p.price)}</span>
                            </div>
                        ))}
                        <div className="od-cost-line total">
                            <span>Total</span>
                            <span>{fmtMXN(orderTotal)}</span>
                        </div>
                        {order.is_paid && (
                            <div className="od-paid">
                                <Check size={14} /> Pagado
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="od-empty">No se han registrado costos aún.</p>
                )}
            </Accordion>

            {/* 6 · Pagos / Abonos */}
            <div ref={pagosRef}>
                <Accordion
                    icon={<DollarSign size={16} />}
                    title="Pagos y abonos"
                    summary={!open.pagos ? pagosSummary : null}
                    open={open.pagos}
                    onToggle={() => toggle('pagos')}
                >
                    <OrderPaymentsSection
                        order={order}
                        client={client}
                        motorcycle={motorcycle}
                        workshopName={activeWorkspace?.name}
                        canManage={canManageMoney}
                        embedded
                        onFinance={setOrderFinance}
                        onChanged={() => {
                            refreshOrders?.();
                        }}
                    />
                </Accordion>
            </div>

            {/* 7 · Acciones principales */}
            <section className="od-actions">
                {canManageMoney && !isTerminal && (
                    <button className="od-action-btn success block" onClick={openPagos}>
                        <DollarSign size={18} /> Registrar pago
                    </button>
                )}

                {!showSendChoice ? (
                    <div className="od-actions__row">
                        <button className="od-action-btn primary" onClick={() => setShowSendChoice(true)} disabled={sendingPDF}>
                            {sendingPDF ? <Loader2 size={16} className="spinner" /> : <FileText size={16} />}
                            Enviar resumen
                        </button>
                        <button
                            className="od-action-btn outline"
                            onClick={async () =>
                                await downloadOrderPDF(
                                    { ...order, _paid: orderFinance?.paid ?? null, _balance: orderFinance?.balance ?? null },
                                    client,
                                    motorcycle
                                )
                            }
                        >
                            <Download size={16} /> PDF
                        </button>
                    </div>
                ) : (
                    <div className="od-send-choice">
                        <div className="od-send-choice__hdr">
                            <span>Enviar resumen como</span>
                            <button onClick={() => setShowSendChoice(false)} aria-label="Cerrar">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="od-actions__row">
                            <button className="od-action-btn primary" onClick={handleSendPDF} disabled={sendingPDF}>
                                <FileText size={16} /> PDF
                            </button>
                            <button className="od-action-btn wa" onClick={handleSendText} disabled={sendingPDF}>
                                <MessageCircle size={16} /> Texto
                            </button>
                        </div>
                    </div>
                )}

                {!isTerminal && (
                    <button className="od-cancel-link" onClick={handleBeginCancellation}>
                        <Trash2 size={13} /> Cancelar orden
                    </button>
                )}
            </section>

            {/* 8 · Historial */}
            {history.length > 0 && (
                <Accordion
                    icon={<Clock size={16} />}
                    title="Historial"
                    summary={!open.historial ? `${history.length} movimiento${history.length > 1 ? 's' : ''}` : null}
                    open={open.historial}
                    onToggle={() => toggle('historial')}
                >
                    <div className="od-timeline">
                        {history.map((entry, idx) => (
                            <div key={idx} className="od-timeline__item">
                                <span className="od-timeline__dot" />
                                <div>
                                    <div className="od-timeline__top">
                                        <strong>{entry.new_status}</strong>
                                        <span>
                                            {new Date(entry.created_at).toLocaleString('es-MX', {
                                                day: 'numeric',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </span>
                                    </div>
                                    {entry.notes && <p>{entry.notes}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </Accordion>
            )}

            {/* Modal: solicitar cancelación */}
            {showCancelModal && (
                <div className="od-modal-overlay" onClick={() => setShowCancelModal(false)}>
                    <div className="od-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="od-modal__head">
                            <h3>Solicitar cancelación</h3>
                            <button onClick={() => setShowCancelModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="od-modal__body">
                            <p className="od-modal__note">
                                No tienes permiso para eliminar órdenes. Se enviará una solicitud al administrador.
                            </p>
                            <textarea
                                className="od-textarea"
                                placeholder="Motivo de la cancelación…"
                                value={cancellationReason}
                                onChange={(e) => setCancellationReason(e.target.value)}
                                rows={3}
                                autoFocus
                            />
                        </div>
                        <div className="od-modal__foot">
                            <button className="od-action-btn secondary" onClick={() => setShowCancelModal(false)}>
                                Volver
                            </button>
                            <button className="od-action-btn danger" onClick={handleRequestCancellation} disabled={!cancellationReason.trim()}>
                                Enviar solicitud
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: eliminar */}
            {showDeleteConfirmModal && (
                <div className="od-modal-overlay" onClick={() => setShowDeleteConfirmModal(false)}>
                    <div className="od-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="od-modal__head">
                            <h3>Eliminar orden</h3>
                            <button onClick={() => setShowDeleteConfirmModal(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="od-modal__body">
                            <div className="od-modal__danger">
                                <AlertTriangle size={22} />
                                <div>
                                    <strong>Esta acción no se puede deshacer.</strong>
                                    <p>Se eliminarán servicios, historial y datos asociados a la orden.</p>
                                </div>
                            </div>
                        </div>
                        <div className="od-modal__foot">
                            <button className="od-action-btn secondary" onClick={() => setShowDeleteConfirmModal(false)}>
                                Cancelar
                            </button>
                            <button className="od-action-btn danger" onClick={handleDeleteOrder}>
                                <Trash2 size={16} /> Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
}
