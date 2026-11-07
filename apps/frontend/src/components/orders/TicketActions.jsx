import { useCallback, useEffect, useRef, useState } from 'react';
import { Printer, MessageCircle, Eye, X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { printService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import './TicketActions.css';

/* =========================================================================
   Ticket de la orden: imprimir en la impresora del taller y/o enviar por
   WhatsApp. Contrato de la API: docs/IMPRESION-CONTRATO.md

   - useTicketActions : lógica compartida (imprimir / WhatsApp + avisos)
   - TicketPaper      : el ticket en texto, con letra de máquina de escribir
   - TicketPreviewModal
   - TicketPrintModal : "¿Cómo quieres entregar la nota?" (al entregar la orden)
   - TicketButtons    : fila de botones para la zona de acciones de la orden
   ========================================================================= */

function useTicketActions(order, client) {
    const toast = useToast();
    const orderId = order?.id;
    const [printing, setPrinting] = useState(false);
    const [sending, setSending] = useState(false);
    // Candados síncronos: evitan el doble clic aunque el estado aún no se pinte.
    const lock = useRef({ print: false, whatsapp: false });

    const print = useCallback(async () => {
        if (!orderId || lock.current.print) return false;
        lock.current.print = true;
        setPrinting(true);
        try {
            const { data, error } = await printService.printOrderTicket(orderId);
            if (error) {
                toast.error(error.message || 'No se pudo enviar el ticket a imprimir');
                return false;
            }
            if (data?.agent_connected === false) {
                toast.warning('Ticket en cola. Se imprimirá cuando la laptop del taller se conecte.', 6000);
            } else {
                toast.success('Ticket enviado a imprimir');
            }
            return true;
        } finally {
            lock.current.print = false;
            setPrinting(false);
        }
    }, [orderId, toast]);

    const sendWhatsApp = useCallback(async () => {
        if (!orderId || lock.current.whatsapp) return false;
        if (!client?.phone) {
            toast.error('Este cliente no tiene número de teléfono');
            return false;
        }
        lock.current.whatsapp = true;
        setSending(true);
        try {
            const { data: result, error } = await printService.sendTicketWhatsApp(orderId);
            if (error) {
                toast.error(error.message || 'Error al enviar el ticket');
                return false;
            }
            if (result?.success && result?.automated) {
                toast.success('Ticket enviado por WhatsApp');
                return true;
            }
            // Mismos mensajes que "Enviar resumen" en el detalle de la orden.
            if (result?.fallback && (!result.botStatus || result.botStatus === 503)) {
                toast.warning('WhatsApp no disponible. Conecta el bot primero.');
            } else if (result?.fallback) {
                toast.error(`No se pudo enviar el ticket: ${result.error || 'error del bot'}`);
            } else {
                toast.error(result?.error || 'Error al enviar el ticket');
            }
            return false;
        } finally {
            lock.current.whatsapp = false;
            setSending(false);
        }
    }, [orderId, client?.phone, toast]);

    return { print, sendWhatsApp, printing, sending };
}

/* ---- Ticket en texto ---- */
export function TicketPaper({ text, cols = 48 }) {
    return (
        <pre className="tk-paper" style={{ '--cols': cols }} aria-label="Vista previa del ticket">
            {text}
        </pre>
    );
}

/* ---- Vista previa del ticket real de la orden ---- */
function TicketPreviewBody({ orderId }) {
    const [state, setState] = useState({ loading: true, text: '', cols: 48, error: null });

    useEffect(() => {
        let cancelled = false;
        printService.preview(orderId).then(({ data, error }) => {
            if (cancelled) return;
            if (error || !data) {
                setState({ loading: false, text: '', cols: 48, error: error?.message || 'No se pudo cargar la vista previa' });
            } else {
                setState({ loading: false, text: data.text || '', cols: data.cols || 48, error: null });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [orderId]);

    if (state.loading) {
        return (
            <p className="tk-muted">
                <Loader2 size={14} className="tk-spin" /> Cargando ticket…
            </p>
        );
    }
    if (state.error) return <p className="tk-error">{state.error}</p>;
    return <TicketPaper text={state.text} cols={state.cols} />;
}

export function TicketPreviewModal({ open, orderId, orderNumber, onClose }) {
    if (!open || !orderId) return null;
    return (
        <div className="tk-overlay" onClick={onClose}>
            <div className="tk-modal" role="dialog" aria-modal="true" aria-label="Ticket" onClick={(e) => e.stopPropagation()}>
                <div className="tk-modal__head">
                    <h3>Ticket {orderNumber || ''}</h3>
                    <button type="button" onClick={onClose} aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>
                <div className="tk-modal__body">
                    <TicketPreviewBody orderId={orderId} />
                </div>
                <div className="tk-modal__foot">
                    <button type="button" className="od-action-btn secondary" onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---- Estado de la impresora (para el modal de entrega) ---- */
function PrinterStatus({ agent }) {
    if (agent === undefined) {
        return (
            <p className="tk-status tk-status--idle">
                <Loader2 size={14} className="tk-spin" /> Revisando la impresora…
            </p>
        );
    }
    if (agent?.connected) {
        return (
            <p className="tk-status tk-status--ok">
                <CheckCircle2 size={14} /> Impresora conectada
            </p>
        );
    }
    return (
        <p className="tk-status tk-status--warn">
            <AlertTriangle size={14} />
            <span>
                {agent
                    ? 'La laptop del taller está desconectada; se imprimirá cuando se conecte.'
                    : 'Aún no hay una laptop conectada a la impresora (se configura en Impresión). El ticket quedará en cola.'}
            </span>
        </p>
    );
}

/* ---- Modal "¿Cómo quieres entregar la nota?" ---- */
function TicketPrintModalInner({ order, client, onClose }) {
    const { print, sendWhatsApp, printing, sending } = useTicketActions(order, client);
    const [agent, setAgent] = useState(undefined); // undefined = revisando, null = sin laptop
    const [done, setDone] = useState({ print: false, whatsapp: false });
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        let cancelled = false;
        printService.getSettings().then(({ data }) => {
            if (!cancelled) setAgent(data?.agent ?? null);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const busy = printing || sending;
    const hasPhone = Boolean(client?.phone);
    const anyDone = done.print || done.whatsapp;

    const handlePrint = async () => {
        const ok = await print();
        if (ok) setDone((d) => ({ ...d, print: true }));
    };
    const handleWhatsApp = async () => {
        const ok = await sendWhatsApp();
        if (ok) setDone((d) => ({ ...d, whatsapp: true }));
    };
    const handleBoth = async () => {
        const [okPrint, okWa] = await Promise.all([print(), sendWhatsApp()]);
        setDone((d) => ({ print: d.print || okPrint, whatsapp: d.whatsapp || okWa }));
    };

    return (
        <div className="tk-overlay" onClick={busy ? undefined : onClose}>
            <div
                className="tk-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Entregar la nota"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="tk-modal__head">
                    <div>
                        <h3>¿Cómo quieres entregar la nota?</h3>
                        <p className="tk-sub">
                            {order.order_number}
                            {client?.full_name ? ` · ${client.full_name}` : ''}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>

                <div className="tk-modal__body">
                    <PrinterStatus agent={agent} />

                    <div className="tk-choices">
                        <button type="button" className="tk-choice tk-choice--print" onClick={handlePrint} disabled={busy}>
                            <span className="tk-choice__icon">
                                {printing ? <Loader2 size={22} className="tk-spin" /> : <Printer size={22} />}
                            </span>
                            <span className="tk-choice__text">
                                <strong>Imprimir ticket</strong>
                                <small>Sale en la impresora del taller</small>
                            </span>
                            {done.print && <CheckCircle2 size={20} className="tk-choice__done" aria-label="Listo" />}
                        </button>

                        <button
                            type="button"
                            className="tk-choice tk-choice--wa"
                            onClick={handleWhatsApp}
                            disabled={busy || !hasPhone}
                        >
                            <span className="tk-choice__icon">
                                {sending ? <Loader2 size={22} className="tk-spin" /> : <MessageCircle size={22} />}
                            </span>
                            <span className="tk-choice__text">
                                <strong>Enviar por WhatsApp</strong>
                                <small>{hasPhone ? 'Le llega al cliente en PDF' : 'El cliente no tiene teléfono registrado'}</small>
                            </span>
                            {done.whatsapp && <CheckCircle2 size={20} className="tk-choice__done" aria-label="Listo" />}
                        </button>

                        <button
                            type="button"
                            className="tk-choice tk-choice--both"
                            onClick={handleBoth}
                            disabled={busy || !hasPhone}
                        >
                            <span className="tk-choice__icon">
                                <Printer size={18} />
                                <MessageCircle size={18} />
                            </span>
                            <span className="tk-choice__text">
                                <strong>Las dos</strong>
                                <small>{hasPhone ? 'Imprimir y enviar por WhatsApp' : 'Necesita el teléfono del cliente'}</small>
                            </span>
                        </button>
                    </div>

                    <button
                        type="button"
                        className="tk-link"
                        onClick={() => setShowPreview((v) => !v)}
                        aria-expanded={showPreview}
                    >
                        <Eye size={14} /> {showPreview ? 'Ocultar ticket' : 'Ver ticket'}
                    </button>
                    {showPreview && <TicketPreviewBody orderId={order.id} />}
                </div>

                <div className="tk-modal__foot">
                    <button
                        type="button"
                        className={`od-action-btn ${anyDone ? 'primary' : 'secondary'}`}
                        onClick={onClose}
                        disabled={busy}
                    >
                        {anyDone ? 'Listo' : 'Ahora no'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export function TicketPrintModal({ open, order, client, onClose }) {
    // Se monta solo cuando está abierto: el estado interno se reinicia cada vez.
    if (!open || !order?.id) return null;
    return <TicketPrintModalInner order={order} client={client} onClose={onClose} />;
}

/* ---- Fila de botones para la zona de acciones ---- */
export function TicketButtons({ order, client }) {
    const { print, sendWhatsApp, printing, sending } = useTicketActions(order, client);
    const [showPreview, setShowPreview] = useState(false);

    if (!order?.id) return null;

    return (
        <div className="tk-buttons">
            <div className="tk-buttons__row">
                <button type="button" className="od-action-btn primary tk-btn" onClick={print} disabled={printing}>
                    {printing ? <Loader2 size={16} className="tk-spin" /> : <Printer size={16} />}
                    Imprimir ticket
                </button>
                <button type="button" className="od-action-btn wa tk-btn" onClick={sendWhatsApp} disabled={sending}>
                    {sending ? <Loader2 size={16} className="tk-spin" /> : <MessageCircle size={16} />}
                    Ticket por WhatsApp
                </button>
            </div>
            <button type="button" className="od-action-btn outline sm block" onClick={() => setShowPreview(true)}>
                <Eye size={14} /> Ver ticket
            </button>
            <TicketPreviewModal
                open={showPreview}
                orderId={order.id}
                orderNumber={order.order_number}
                onClose={() => setShowPreview(false)}
            />
        </div>
    );
}
