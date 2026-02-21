import { whatsappBotService } from '../lib/api';

// ============================================================
// CORE: Envio directo de mensajes via WhatsApp Bot
// ============================================================

/**
 * Envia un mensaje de WhatsApp directamente desde el bot.
 * NO abre ventana ni requiere conversacion previa.
 * Si el bot no esta conectado, retorna error para que la UI lo muestre.
 *
 * @param {string} mechanicId - ID del mecanico (dueno de la sesion del bot)
 * @param {string} phone - Numero de telefono del destinatario
 * @param {string} message - Mensaje a enviar
 * @returns {Promise<{success: boolean, automated: boolean, error?: string}>}
 */
export const sendDirectMessage = async (mechanicId, phone, message, orderId = null) => {
    if (!phone) {
        return { success: false, automated: false, error: 'El cliente no tiene numero de telefono registrado' };
    }
    if (!message) {
        return { success: false, automated: false, error: 'El mensaje esta vacio' };
    }

    try {
        // Intento 1: enviar con la sesion del mecanico directamente
        if (mechanicId) {
            const status = await whatsappBotService.getSessionStatus(mechanicId);
            if (status.isConnected) {
                const result = await whatsappBotService.sendMessage(mechanicId, phone, message);
                if (result.success) {
                    return { success: true, automated: true };
                }
            }
        }

        // Intento 2: si hay orderId, usar sendForOrder (busca la sesion correcta automaticamente)
        if (orderId) {
            const result = await whatsappBotService.sendForOrder(orderId, phone, message);
            if (result.success) {
                return { success: true, automated: true };
            }
        }

        // Intento 3: buscar cualquier sesion activa del bot
        const sessions = await whatsappBotService.getBotSessions();
        const activeSessions = (Array.isArray(sessions) ? sessions : []).filter(s => s.isConnected);

        if (activeSessions.length > 0) {
            const result = await whatsappBotService.sendMessage(activeSessions[0].mechanicId, phone, message);
            if (result.success) {
                return { success: true, automated: true };
            }
        }

        return {
            success: false,
            automated: false,
            error: 'El bot de WhatsApp no esta activo. Conectalo desde la seccion WhatsApp antes de enviar notificaciones.'
        };
    } catch (err) {
        console.error('[WhatsApp] Error al enviar mensaje directo:', err);
        return {
            success: false,
            automated: false,
            error: 'Error de conexion con el bot de WhatsApp.'
        };
    }
};


// ============================================================
// LEGACY: funciones de wa.me (para compatibilidad, no recomendadas)
// ============================================================

/**
 * Genera un link de wa.me con mensaje pre-llenado (abrir en navegador)
 * SOLO usar como referencia o ultimo recurso manual.
 */
export const generateWhatsAppLink = (phone, message) => {
    let cleanPhone = phone.replace(/\D/g, '');

    if (cleanPhone.length === 10) {
        cleanPhone = '521' + cleanPhone;
    } else if (cleanPhone.startsWith('52') && !cleanPhone.startsWith('521') && cleanPhone.length === 12) {
        cleanPhone = '521' + cleanPhone.substring(2);
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
        cleanPhone = '521' + cleanPhone.substring(1);
    } else if (!cleanPhone.startsWith('521')) {
        cleanPhone = '521' + cleanPhone;
    }

    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
};

/**
 * Abre WhatsApp Web con mensaje pre-llenado (metodo manual legacy)
 */
export const sendViaWhatsApp = (phone, message) => {
    const link = generateWhatsAppLink(phone, message);
    window.open(link, '_blank');
};

/**
 * @deprecated Usar sendDirectMessage() en su lugar
 */
export const sendAutomatedMessage = async (phone, message) => {
    sendViaWhatsApp(phone, message);
    return { success: true, automated: false };
};


// ============================================================
// PLANTILLAS DE MENSAJES - Profesional y limpio
// ============================================================

const FOOTER = `*Motopartes* - Servicio Profesional`;

/**
 * Mensaje de bienvenida cuando se crea una orden (legacy)
 */
export const getOrderLinkMessage = (clientName, motorcycle, link) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*ORDEN DE SERVICIO REGISTRADA*`,
        ``,
        `Su motocicleta *${motorcycle}* ha sido recibida en nuestro taller.`,
        ``,
        link ? `Seguimiento en linea:` : null,
        link ? link : null,
        link ? `` : null,
        `Le mantendremos informado sobre el avance de su servicio.`,
        ``,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};

/**
 * Notificacion de actualizacion en el servicio
 */
export const getUpdateNotificationMessage = (clientName, updateTitle, link) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*ACTUALIZACION DE SERVICIO*`,
        ``,
        `Se registro una novedad en su servicio:`,
        `_"${updateTitle}"_`,
        ``,
        link ? `Consulte los detalles:` : null,
        link ? link : null,
        link ? `` : null,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};

/**
 * Moto lista para recoger
 */
export const getReadyForPickupMessage = (clientName, motorcycle, orderNumber, totalAmount) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - LISTA PARA ENTREGAR*`,
        ``,
        `Moto: *${motorcycle}*`,
        `Total: *$${totalAmount.toLocaleString('es-MX')}*`,
        ``,
        `Horario de atencion:`,
        `Lun - Vie: 9:00 AM - 6:00 PM`,
        `Sabados: 9:00 AM - 2:00 PM`,
        ``,
        `Le esperamos para la entrega.`,
        ``,
        FOOTER,
    ].join('\n');
};

/**
 * Confirmacion de entrega
 */
export const getDeliveryNotificationMessage = (clientName, motorcycle, orderNumber) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - ENTREGADA*`,
        ``,
        `Su motocicleta *${motorcycle}* ha sido entregada satisfactoriamente.`,
        ``,
        `Agradecemos su confianza. Estamos a sus ordenes para cualquier necesidad futura.`,
        ``,
        FOOTER,
    ].join('\n');
};

/**
 * Mensaje generico de cambio de estado - despacha al template correcto
 */
export const getStatusChangeMessage = (statusName, data) => {
    const { clientName, motorcycle, orderNumber, trackingLink, totalAmount, services } = data;

    switch (statusName) {
        case 'Registrada':
            return getOrderCreatedMessage(clientName, motorcycle, orderNumber, trackingLink);

        case 'En Revision':
            return getInReviewMessage(clientName, motorcycle, orderNumber, trackingLink);

        case 'En Reparacion':
            return getInRepairMessage(clientName, motorcycle, orderNumber, trackingLink);

        case 'En Proceso':
            return getInProgressMessage(clientName, motorcycle, orderNumber, trackingLink);

        case 'Esperando Refacciones':
            return getAwaitingPartsMessage(clientName, motorcycle, orderNumber, trackingLink);

        case 'Lista para Entregar':
            return getReadyForPickupMessage(clientName, motorcycle, orderNumber, totalAmount || 0);

        case 'Entregada':
            return getDeliveryNotificationMessage(clientName, motorcycle, orderNumber);

        case 'Cancelada':
            return getCancelledMessage(clientName, motorcycle, orderNumber);

        default:
            return getGenericStatusMessage(clientName, motorcycle, orderNumber, statusName, trackingLink);
    }
};

/**
 * Orden recien creada / registrada
 */
export const getOrderCreatedMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - REGISTRADA*`,
        ``,
        `Su motocicleta *${motorcycle}* ha sido recibida en nuestro taller.`,
        ``,
        `Le informaremos cada avance de su servicio por este medio.`,
        ``,
        trackingLink ? `Seguimiento en linea:` : null,
        trackingLink ? trackingLink : null,
        trackingLink ? `` : null,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};

/**
 * Moto en revision
 */
export const getInReviewMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - EN REVISION*`,
        ``,
        `Su motocicleta *${motorcycle}* se encuentra en revision por nuestro equipo tecnico.`,
        ``,
        `Estamos evaluando los trabajos necesarios. Le mantendremos informado.`,
        ``,
        trackingLink ? `Seguimiento: ${trackingLink}` : null,
        ``,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};

/**
 * Moto en reparacion
 */
export const getInRepairMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - EN REPARACION*`,
        ``,
        `Su motocicleta *${motorcycle}* se encuentra en reparacion.`,
        ``,
        `Nuestro equipo esta trabajando para dejarla en optimas condiciones.`,
        ``,
        trackingLink ? `Seguimiento: ${trackingLink}` : null,
        ``,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};

/**
 * Moto en proceso
 */
export const getInProgressMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - EN PROCESO*`,
        ``,
        `Su motocicleta *${motorcycle}* continua en proceso de servicio.`,
        ``,
        `Le notificaremos cuando haya novedades.`,
        ``,
        trackingLink ? `Seguimiento: ${trackingLink}` : null,
        ``,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};

/**
 * Esperando refacciones
 */
export const getAwaitingPartsMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - ESPERANDO REFACCIONES*`,
        ``,
        `Le informamos que el servicio de su motocicleta *${motorcycle}* requiere refacciones que ya fueron solicitadas.`,
        ``,
        `En cuanto esten disponibles, continuaremos con la reparacion.`,
        ``,
        trackingLink ? `Seguimiento: ${trackingLink}` : null,
        ``,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};

/**
 * Orden cancelada
 */
export const getCancelledMessage = (clientName, motorcycle, orderNumber) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - CANCELADA*`,
        ``,
        `La orden de servicio de su motocicleta *${motorcycle}* ha sido cancelada.`,
        ``,
        `Si tiene alguna duda, estamos a sus ordenes.`,
        ``,
        FOOTER,
    ].join('\n');
};

/**
 * Estado generico (para estados no mapeados)
 */
export const getGenericStatusMessage = (clientName, motorcycle, orderNumber, statusName, trackingLink) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*${orderNumber} - ${statusName.toUpperCase()}*`,
        ``,
        `Su motocicleta *${motorcycle}* cambio a estado: *${statusName}*.`,
        ``,
        trackingLink ? `Seguimiento: ${trackingLink}` : null,
        ``,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};

/**
 * Cotizacion con desglose de servicios
 */
export const getQuotationMessage = (clientName, motorcycle, quotationNumber, services, totalAmount, expiresAt) => {
    const servicesList = services
        .map(s => `  - ${s.name} - *$${s.price.toLocaleString('es-MX')}*`)
        .join('\n');

    const expirationDate = new Date(expiresAt).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*COTIZACION ${quotationNumber}*`,
        ``,
        `Moto: *${motorcycle}*`,
        ``,
        `Servicios cotizados:`,
        servicesList,
        ``,
        `*TOTAL: $${totalAmount.toLocaleString('es-MX')}*`,
        ``,
        `Vigencia: ${expirationDate}`,
        ``,
        `Para proceder, confirme esta cotizacion.`,
        ``,
        FOOTER,
    ].join('\n');
};

/**
 * Orden de servicio con link de PDF
 */
export const getServiceOrderMessage = (clientName, motorcycle, orderNumber, link, pdfUrl) => {
    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*ORDEN DE SERVICIO ${orderNumber}*`,
        ``,
        `Moto: *${motorcycle}*`,
        ``,
        pdfUrl ? `Descargue su orden en PDF:` : null,
        pdfUrl ? pdfUrl : null,
        pdfUrl ? `` : null,
        link ? `Seguimiento en linea:` : null,
        link ? link : null,
        link ? `` : null,
        `Le informaremos cada avance de su servicio.`,
        ``,
        FOOTER,
    ].filter(line => line !== null).join('\n');
};


// ============================================================
// MENSAJE DETALLADO DE ORDEN (con desglose completo)
// ============================================================

/**
 * Mensaje detallado con servicios, totales, anticipo, y contacto
 */
export const getDetailedOrderMessage = (
    clientName, motorcycle, orderNumber, services, totalAmount,
    link, paymentInfo = null, orderTotals = null, contactInfo = null
) => {
    // Servicios
    let servicesList = '';
    if (services && services.length > 0) {
        servicesList = services.map(s => `  - ${s.name}`).join('\n');
    } else {
        servicesList = '  - Revision General';
    }

    // Desglose mano de obra / refacciones
    let totalsSection = '';
    if (orderTotals && (orderTotals.laborTotal > 0 || orderTotals.partsTotal > 0)) {
        totalsSection = [
            ``,
            `Desglose:`,
            `  Mano de obra: *$${(orderTotals.laborTotal || 0).toLocaleString('es-MX')}*`,
            `  Refacciones: *$${(orderTotals.partsTotal || 0).toLocaleString('es-MX')}*`,
        ].join('\n');
    }

    // Anticipo
    let paymentSection = '';
    if (paymentInfo && paymentInfo.advancePayment > 0) {
        const methodLabel = getPaymentMethodLabel(paymentInfo.paymentMethod);
        const remaining = totalAmount - paymentInfo.advancePayment;

        paymentSection = [
            ``,
            `Anticipo recibido: *$${paymentInfo.advancePayment.toLocaleString('es-MX')}* (${methodLabel})`,
            `Saldo pendiente: *$${Math.max(0, remaining).toLocaleString('es-MX')}*`,
        ].join('\n');
    }

    // Link de seguimiento
    const linkSection = link ? `\nSeguimiento en linea:\n${link}` : '';

    // Contacto
    let contactSection = 'Cualquier duda, estamos a sus ordenes por este medio.';
    if (contactInfo && contactInfo.isSupervisor && contactInfo.mechanicPhone) {
        const name = contactInfo.mechanicName || 'nuestro equipo';
        const phone = formatPhoneForDisplay(contactInfo.mechanicPhone);
        contactSection = `Contacto directo: *${name}* - ${phone}`;
    }

    return [
        `Estimado/a *${clientName}*,`,
        ``,
        `*ORDEN DE SERVICIO ${orderNumber}*`,
        ``,
        `Moto: *${motorcycle}*`,
        ``,
        `Servicios:`,
        servicesList,
        totalsSection,
        ``,
        `*TOTAL: $${(totalAmount || 0).toLocaleString('es-MX')}*`,
        paymentSection,
        linkSection,
        ``,
        contactSection,
        ``,
        FOOTER,
    ].filter(line => line !== undefined).join('\n');
};


// ============================================================
// UTILIDADES
// ============================================================

/**
 * Formatear numero de telefono para mostrar en mensajes
 */
const formatPhoneForDisplay = (phone) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.startsWith('521') && digits.length === 13) {
        const local = digits.slice(3);
        return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
    }
    if (digits.startsWith('52') && digits.length === 12) {
        const local = digits.slice(2);
        return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
    }
    return phone;
};

export { formatPhoneForDisplay };

/**
 * Label legible para metodo de pago
 */
const getPaymentMethodLabel = (method) => {
    switch (method) {
        case 'cash':
        case 'efectivo':
            return 'Efectivo';
        case 'card':
        case 'tarjeta':
            return 'Tarjeta';
        case 'transfer':
        case 'transferencia':
            return 'Transferencia';
        default:
            return method || 'No especificado';
    }
};

export { getPaymentMethodLabel };


// ============================================================
// PDF: subir y enviar como media (sin cambios)
// ============================================================

/**
 * Sube un PDF a Storage y retorna la URL
 */
export const sendMessageWithPDF = async (phone, message, pdfBlob, filename) => {
    try {
        const { uploadPDFToStorage } = await import('../services/storageService');
        const uploadResult = await uploadPDFToStorage(pdfBlob, filename);

        if (!uploadResult.success) {
            throw new Error('Error al subir PDF: ' + uploadResult.error);
        }

        return {
            success: true,
            automated: true,
            pdfUrl: uploadResult.url
        };
    } catch (error) {
        console.error('[WhatsApp] Error uploading PDF:', error);
        return {
            success: false,
            automated: false,
            error: error.message
        };
    }
};
