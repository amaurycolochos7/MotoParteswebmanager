import { whatsappBotService } from '../lib/api';

// ============================================================
// CORE: Envío directo de mensajes via WhatsApp Bot
// ============================================================

/**
 * Envía un mensaje de WhatsApp directamente desde el bot.
 * NO abre ventana ni requiere conversación previa.
 * Si el bot no está conectado, retorna error para que la UI lo muestre.
 *
 * @param {string} mechanicId - ID del mecánico (dueño de la sesión del bot)
 * @param {string} phone - Número de teléfono del destinatario
 * @param {string} message - Mensaje a enviar
 * @returns {Promise<{success: boolean, automated: boolean, error?: string}>}
 */
export const sendDirectMessage = async (mechanicId, phone, message, orderId = null) => {
    if (!phone) {
        return { success: false, automated: false, error: 'El cliente no tiene número de teléfono registrado' };
    }
    if (!message) {
        return { success: false, automated: false, error: 'El mensaje está vacío' };
    }

    try {
        // Intento 1: enviar con la sesión del mecánico directamente
        if (mechanicId) {
            const status = await whatsappBotService.getSessionStatus(mechanicId);
            if (status.isConnected) {
                const result = await whatsappBotService.sendMessage(mechanicId, phone, message);
                if (result.success) {
                    return { success: true, automated: true };
                }
            }
        }

        // Intento 2: si hay orderId, usar sendForOrder (busca la sesión correcta automáticamente)
        if (orderId) {
            const result = await whatsappBotService.sendForOrder(orderId, phone, message);
            if (result.success) {
                return { success: true, automated: true };
            }
        }

        // Intento 3: buscar cualquier sesión activa del bot
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
            error: 'El bot de WhatsApp no está activo. Conéctalo desde la sección WhatsApp antes de enviar notificaciones.'
        };
    } catch (err) {
        console.error('[WhatsApp] Error al enviar mensaje directo:', err);
        return {
            success: false,
            automated: false,
            error: 'Error de conexión con el bot de WhatsApp.'
        };
    }
};


// ============================================================
// LEGACY: funciones de wa.me (para compatibilidad, no recomendadas)
// ============================================================

/**
 * Genera un link de wa.me con mensaje pre-llenado (abrir en navegador)
 * SOLO usar como referencia o último recurso manual.
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
 * Abre WhatsApp Web con mensaje pre-llenado (método manual legacy)
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
// PLANTILLAS DE MENSAJES — Diseño profesional con emojis y formato
// ============================================================

/**
 * Mensaje de bienvenida cuando se crea una orden
 */
export const getOrderLinkMessage = (clientName, motorcycle, link) => {
    return [
        `Hola *${clientName}* 👋`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🏍️ *ORDEN DE SERVICIO REGISTRADA*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Tu motocicleta *${motorcycle}* fue recibida exitosamente en nuestro taller.`,
        ``,
        link ? `📱 *Seguimiento en tiempo real:*` : null,
        link ? link : null,
        link ? `` : null,
        `Te avisaremos cada paso del proceso por este medio.`,
        ``,
        `_Gracias por confiar en *Motopartes*_ 🔧✨`,
    ].filter(line => line !== null).join('\n');
};

/**
 * Notificación de actualización en el servicio
 */
export const getUpdateNotificationMessage = (clientName, updateTitle, link) => {
    return [
        `Hola *${clientName}* 📢`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🔔 *ACTUALIZACIÓN DE SERVICIO*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Hay una novedad en tu servicio:`,
        `▸ _"${updateTitle}"_`,
        ``,
        link ? `👀 Revisa los detalles aquí:` : null,
        link ? link : null,
        link ? `` : null,
        `_Motopartes — Tu taller de confianza_ 🔧`,
    ].filter(line => line !== null).join('\n');
};

/**
 * Moto lista para recoger
 */
export const getReadyForPickupMessage = (clientName, motorcycle, orderNumber, totalAmount) => {
    return [
        `¡Hola *${clientName}*! 🎉`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `✅ *¡TU MOTO ESTÁ LISTA!*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `🏍️ *Moto:* ${motorcycle}`,
        `📋 *Orden:* ${orderNumber}`,
        ``,
        `💰 *Total a pagar:* $${totalAmount.toLocaleString('es-MX')}`,
        ``,
        `📍 *Horario de atención:*`,
        `   Lun – Vie: 9:00 AM – 6:00 PM`,
        `   Sábados: 9:00 AM – 2:00 PM`,
        ``,
        `¡Te esperamos! 🏁`,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧✨`,
    ].join('\n');
};

/**
 * Confirmación de entrega
 */
export const getDeliveryNotificationMessage = (clientName, motorcycle, orderNumber) => {
    return [
        `¡Hola *${clientName}*! 🙏`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `✅ *ORDEN ${orderNumber} — ENTREGADA*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `🏍️ Tu *${motorcycle}* fue entregada exitosamente.`,
        ``,
        `Fue un placer atenderte. Estamos para servirte cuando lo necesites.`,
        ``,
        `⭐ _Tu satisfacción es nuestra mejor recomendación._`,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧✨`,
    ].join('\n');
};

/**
 * Mensaje genérico de cambio de estado — despacha al template correcto
 * @param {string} statusName - Nombre del nuevo estado
 * @param {object} data - { clientName, motorcycle, orderNumber, trackingLink, totalAmount, services }
 */
export const getStatusChangeMessage = (statusName, data) => {
    const { clientName, motorcycle, orderNumber, trackingLink, totalAmount, services } = data;

    switch (statusName) {
        case 'Registrada':
            return getOrderCreatedMessage(clientName, motorcycle, orderNumber, trackingLink);

        case 'En Revisión':
            return getInReviewMessage(clientName, motorcycle, orderNumber, trackingLink);

        case 'En Reparación':
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
 * Orden recién creada / registrada
 */
export const getOrderCreatedMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Hola *${clientName}* 👋`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🏍️ *ORDEN ${orderNumber} — REGISTRADA*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Tu motocicleta *${motorcycle}* fue recibida exitosamente en nuestro taller.`,
        ``,
        `Te estaremos informando por este medio cada novedad sobre tu servicio.`,
        ``,
        trackingLink ? `📱 *Sigue el proceso en tiempo real:*` : null,
        trackingLink ? trackingLink : null,
        trackingLink ? `` : null,
        `_Gracias por confiar en *Motopartes*_ 🔧✨`,
    ].filter(line => line !== null).join('\n');
};

/**
 * Moto en revisión
 */
export const getInReviewMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Hola *${clientName}* 👋`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🔍 *ORDEN ${orderNumber} — EN REVISIÓN*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Tu motocicleta *${motorcycle}* se encuentra actualmente *en revisión* por nuestro equipo técnico.`,
        ``,
        `Estamos evaluando tu moto para determinar los trabajos necesarios. Te mantendremos informado.`,
        ``,
        trackingLink ? `📱 *Seguimiento:* ${trackingLink}` : null,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧`,
    ].filter(line => line !== null).join('\n');
};

/**
 * Moto en reparación
 */
export const getInRepairMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Hola *${clientName}* 🔧`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🛠️ *ORDEN ${orderNumber} — EN REPARACIÓN*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `¡Buenas noticias! Tu motocicleta *${motorcycle}* ya se encuentra *en reparación*.`,
        ``,
        `Nuestro equipo está trabajando para dejarte tu moto en las mejores condiciones.`,
        ``,
        trackingLink ? `📱 *Seguimiento:* ${trackingLink}` : null,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧`,
    ].filter(line => line !== null).join('\n');
};

/**
 * Moto en proceso
 */
export const getInProgressMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Hola *${clientName}* ⚙️`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `⚙️ *ORDEN ${orderNumber} — EN PROCESO*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Tu motocicleta *${motorcycle}* sigue *en proceso* de servicio.`,
        ``,
        `Estamos avanzando con los trabajos programados. Te avisaremos cuando haya novedades.`,
        ``,
        trackingLink ? `📱 *Seguimiento:* ${trackingLink}` : null,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧`,
    ].filter(line => line !== null).join('\n');
};

/**
 * Esperando refacciones
 */
export const getAwaitingPartsMessage = (clientName, motorcycle, orderNumber, trackingLink) => {
    return [
        `Hola *${clientName}* 📦`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📦 *ORDEN ${orderNumber} — ESPERANDO REFACCIONES*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Te informamos que para continuar con el servicio de tu motocicleta *${motorcycle}*, requerimos *refacciones* que ya fueron solicitadas.`,
        ``,
        `En cuanto las tengamos disponibles, continuaremos con la reparación de inmediato.`,
        ``,
        trackingLink ? `📱 *Seguimiento:* ${trackingLink}` : null,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧`,
    ].filter(line => line !== null).join('\n');
};

/**
 * Orden cancelada
 */
export const getCancelledMessage = (clientName, motorcycle, orderNumber) => {
    return [
        `Hola *${clientName}*`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `❌ *ORDEN ${orderNumber} — CANCELADA*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `La orden de servicio de tu motocicleta *${motorcycle}* ha sido *cancelada*.`,
        ``,
        `Si tienes alguna duda o requieres más información, no dudes en contactarnos.`,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧`,
    ].join('\n');
};

/**
 * Estado genérico (para estados no mapeados)
 */
export const getGenericStatusMessage = (clientName, motorcycle, orderNumber, statusName, trackingLink) => {
    return [
        `Hola *${clientName}* 📢`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🔔 *ORDEN ${orderNumber} — ${statusName.toUpperCase()}*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Tu motocicleta *${motorcycle}* ha cambiado a estado: *${statusName}*.`,
        ``,
        trackingLink ? `📱 *Seguimiento:* ${trackingLink}` : null,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧`,
    ].filter(line => line !== null).join('\n');
};

/**
 * Cotización con desglose de servicios
 */
export const getQuotationMessage = (clientName, motorcycle, quotationNumber, services, totalAmount, expiresAt) => {
    const servicesList = services
        .map(s => `   ▸ ${s.name} — *$${s.price.toLocaleString('es-MX')}*`)
        .join('\n');

    const expirationDate = new Date(expiresAt).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return [
        `Hola *${clientName}* 👋`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📋 *COTIZACIÓN ${quotationNumber}*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `🏍️ *Moto:* ${motorcycle}`,
        ``,
        `*Servicios cotizados:*`,
        servicesList,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💰 *TOTAL: $${totalAmount.toLocaleString('es-MX')}*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `⏰ *Válida hasta:* ${expirationDate}`,
        ``,
        `Para proceder, confirma esta cotización. ¡Estamos listos para atender tu moto!`,
        ``,
        `_Motopartes — Tu taller de confianza_ 🔧✨`,
    ].join('\n');
};

/**
 * Orden de servicio con link de PDF
 */
export const getServiceOrderMessage = (clientName, motorcycle, orderNumber, link, pdfUrl) => {
    return [
        `Hola *${clientName}* 👋`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📋 *ORDEN DE SERVICIO ${orderNumber}*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `🏍️ *Moto:* ${motorcycle}`,
        ``,
        pdfUrl ? `📄 *Descarga tu orden en PDF:*` : null,
        pdfUrl ? pdfUrl : null,
        pdfUrl ? `` : null,
        link ? `📱 *Seguimiento en tiempo real:*` : null,
        link ? link : null,
        link ? `` : null,
        `Te avisaremos cada paso del proceso.`,
        ``,
        `_Gracias por confiar en *Motopartes*_ 🔧✨`,
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
        servicesList = services.map(s => `   ▸ ${s.name}`).join('\n');
    } else {
        servicesList = '   ▸ Revisión General';
    }

    // Desglose mano de obra / refacciones
    let totalsSection = '';
    if (orderTotals && (orderTotals.laborTotal > 0 || orderTotals.partsTotal > 0)) {
        totalsSection = [
            ``,
            `*Desglose:*`,
            `   🔧 Mano de obra: *$${(orderTotals.laborTotal || 0).toLocaleString('es-MX')}*`,
            `   🔩 Refacciones: *$${(orderTotals.partsTotal || 0).toLocaleString('es-MX')}*`,
        ].join('\n');
    }

    // Anticipo
    let paymentSection = '';
    if (paymentInfo && paymentInfo.advancePayment > 0) {
        const methodLabel = getPaymentMethodLabel(paymentInfo.paymentMethod);
        const remaining = totalAmount - paymentInfo.advancePayment;

        paymentSection = [
            ``,
            `💳 *Anticipo recibido:* $${paymentInfo.advancePayment.toLocaleString('es-MX')} (${methodLabel})`,
            `📌 *Saldo pendiente:* $${Math.max(0, remaining).toLocaleString('es-MX')}`,
        ].join('\n');
    }

    // Link de seguimiento
    const linkSection = link ? `\n📱 *Seguimiento en tiempo real:*\n${link}` : '';

    // Contacto
    let contactSection = '¿Alguna duda? Quedamos atentos por este medio.';
    if (contactInfo && contactInfo.isSupervisor && contactInfo.mechanicPhone) {
        const name = contactInfo.mechanicName || 'nuestro equipo';
        const phone = formatPhoneForDisplay(contactInfo.mechanicPhone);
        contactSection = `¿Alguna duda? Comunícate con *${name}*:\n📞 ${phone}`;
    }

    return [
        `Hola *${clientName}* 👋`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📋 *ORDEN DE SERVICIO ${orderNumber}*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `🏍️ *Moto:* ${motorcycle}`,
        ``,
        `*Servicios:*`,
        servicesList,
        totalsSection,
        ``,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💰 *TOTAL: $${(totalAmount || 0).toLocaleString('es-MX')}*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        paymentSection,
        linkSection,
        ``,
        contactSection,
        ``,
        `_Gracias por confiar en *Motopartes*_ 🔧✨`,
    ].filter(line => line !== undefined).join('\n');
};


// ============================================================
// UTILIDADES
// ============================================================

/**
 * Formatear número de teléfono para mostrar en mensajes
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
 * Label legible para método de pago
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
