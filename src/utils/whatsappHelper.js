/**
 * Generate WhatsApp link with pre-filled message
 * @param {string} phone - Phone number (will be cleaned and formatted with country code)
 * @param {string} message - Message to send
 * @returns {string} - WhatsApp API URL
 */
export const generateWhatsAppLink = (phone, message) => {
    // Remove all non-digits
    let cleanPhone = phone.replace(/\D/g, '');

    // Mexican mobile numbers: 521 + 10 digits (13 total)
    if (cleanPhone.length === 10) {
        // Standard 10-digit Mexican mobile → add 521
        cleanPhone = '521' + cleanPhone;
    }
    // If already has 521 at start and correct length, keep it
    else if (cleanPhone.startsWith('521') && cleanPhone.length === 13) {
        // Already correct format
        cleanPhone = cleanPhone;
    }
    // If has 52 but missing the 1, add it
    else if (cleanPhone.startsWith('52') && !cleanPhone.startsWith('521') && cleanPhone.length === 12) {
        // Has 52 but missing 1 → insert 1 after 52
        cleanPhone = '521' + cleanPhone.substring(2);
    }
    // If starts with 1 and has 11 digits, it might be a mistake
    else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
        // Remove the 1 and add 521
        cleanPhone = '521' + cleanPhone.substring(1);
    }
    // Default: if doesn't start with 521, add it
    else if (!cleanPhone.startsWith('521')) {
        cleanPhone = '521' + cleanPhone;
    }

    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
};

/**
 * Open WhatsApp with pre-filled message
 * @param {string} phone - Phone number
 * @param {string} message - Pre-filled message
 */
export const sendViaWhatsApp = (phone, message) => {
    const link = generateWhatsAppLink(phone, message);
    window.open(link, '_blank');
};

/**
 * Send WhatsApp message - Opens WhatsApp Web with pre-filled message
 * @param {string} phone - Phone number
 * @param {string} message - Message to send
 * @returns {Promise<{success: boolean, automated: boolean}>}
 */
export const sendAutomatedMessage = async (phone, message) => {
    // Open WhatsApp Web with the message
    sendViaWhatsApp(phone, message);
    return { success: true, automated: false };
};

/**
 * Get formatted message for order link
 * @param {string} clientName - Client's name
 * @param {string} motorcycle - Motorcycle description
 * @param {string} link - Client portal link
 * @returns {string} - Formatted message
 */
export const getOrderLinkMessage = (clientName, motorcycle, link) => {
    return `Hola ${clientName} 👋

✅ *Tu orden de servicio en Motopartes está registrada*

🏍️ *Motocicleta:* ${motorcycle}

📱 *Seguimiento en tiempo real:*
${link}

Cualquier novedad te avisaremos por este medio.

¡Gracias por confiar en nosotros!`;
};

/**
 * Get formatted message for service update notification
 * @param {string} clientName - Client's name
 * @param {string} updateTitle - Title of the update
 * @param {string} link - Client portal link
 * @returns {string} - Formatted message
 */
export const getUpdateNotificationMessage = (clientName, updateTitle, link) => {
    return `Hola ${clientName},

Detectamos una novedad en tu servicio: "${updateTitle}"

Revísala y autorízala aquí:
${link}`;
};

/**
 * Get formatted message when order is ready for pickup
 * @param {string} clientName - Client's name
 * @param {string} motorcycle - Motorcycle description
 * @param {string} orderNumber - Order number
 * @param {number} totalAmount - Total amount to pay
 * @returns {string} - Formatted message
 */
export const getReadyForPickupMessage = (clientName, motorcycle, orderNumber, totalAmount) => {
    return `¡Hola ${clientName}! 🎉

✅ *¡Tu ${motorcycle} está lista!*

📋 *Orden:* ${orderNumber}

Tu motocicleta ya fue reparada y puedes pasar a retirarla cuando gustes.

💰 *Total a pagar:* $${totalAmount.toLocaleString('es-MX')}

📍 *Horario de atención:*
Lunes a Viernes: 9:00 AM - 6:00 PM
Sábados: 9:00 AM - 2:00 PM

¡Te esperamos en Motopartes!

Gracias por tu confianza 🏍️✨`;
};

/**
 * Get formatted message for delivery confirmation (when order is delivered)
 * @param {string} clientName - Client's name
 * @param {string} motorcycle - Motorcycle description
 * @param {string} orderNumber - Order number
 * @returns {string} - Formatted message
 */
export const getDeliveryNotificationMessage = (clientName, motorcycle, orderNumber) => {
    return `¡Gracias ${clientName}! 🙏

✅ *Orden ${orderNumber} entregada*

🏍️ *${motorcycle}*

Tu motocicleta ha sido entregada exitosamente.

Fue un placer atenderte.

📍 *Estamos para servirte cuando lo necesites*

Motopartes - Tu taller de confianza ✨`;
};

/**
 * Get formatted message for quotation
 * @param {string} clientName - Client's name
 * @param {string} motorcycle - Motorcycle description
 * @param {string} quotationNumber - Quotation number
 * @param {Array} services - List of services
 * @param {number} totalAmount - Total amount
 * @param {string} expiresAt - Expiration date
 * @returns {string} - Formatted message
 */
export const getQuotationMessage = (clientName, motorcycle, quotationNumber, services, totalAmount, expiresAt) => {
    const servicesList = services.map(s => `  • ${s.name} - $${s.price.toLocaleString('es-MX')}`).join('\n');
    const expirationDate = new Date(expiresAt).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return `Hola ${clientName} 👋

📋 *Cotización ${quotationNumber}*

🏍️ *Motocicleta:* ${motorcycle}

*Servicios cotizados:*
${servicesList}

💰 *TOTAL: $${totalAmount.toLocaleString('es-MX')}*

⏰ *Válida hasta:* ${expirationDate}

Para proceder con el servicio, confirma esta cotización.

¡Estamos listos para atender tu moto!

_Motopartes - Tu taller de confianza_ 🔧✨`;
};



/**
 * Get formatted message for service order with PDF link
 * @param {string} clientName - Client's name
 * @param {string} motorcycle - Motorcycle description (brand + model)
 * @param {string} orderNumber - Order number
 * @param {string} link - Client portal link
 * @param {string} pdfUrl - URL to download PDF
 * @returns {string} - Formatted message
 */
export const getServiceOrderMessage = (clientName, motorcycle, orderNumber, link, pdfUrl) => {
    return `Hola ${clientName} 👋

📋 *Orden de Servicio ${orderNumber}*

🏍️ *Motocicleta:* ${motorcycle}

📄 *Descarga tu orden de servicio en PDF:*
${pdfUrl}

📱 *Seguimiento en tiempo real:*
${link}

Cualquier novedad te avisaremos por este medio.

¡Gracias por confiar en nosotros!`;
};

/**
 * Send WhatsApp message with PDF via Storage URL
 * @param {string} phone - Phone number
 * @param {string} message - Message text (can be empty)
 * @param {Blob} pdfBlob - PDF file as Blob
 * @param {string} filename - PDF filename
 * @returns {Promise<{success: boolean, automated: boolean, pdfUrl?: string, error?: string}>}
 */
export const sendMessageWithPDF = async (phone, message, pdfBlob, filename) => {
    try {
        console.log('[WhatsApp] Iniciando proceso de envío con PDF...', { phone, filename });

        // Import storage service
        const { uploadPDFToStorage } = await import('../services/storageService');

        // Upload PDF to Supabase Storage
        console.log('[WhatsApp] Subiendo PDF a Supabase Storage...');
        const uploadResult = await uploadPDFToStorage(pdfBlob, filename);

        if (!uploadResult.success) {
            throw new Error('Error al subir PDF: ' + uploadResult.error);
        }

        console.log('[WhatsApp] PDF subido exitosamente. URL:', uploadResult.url);

        // Return success with PDF URL
        // The message with URL will be sent by the caller
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

/**
 * Get detailed order message with services breakdown including labor and parts
 * @param {string} clientName - Client's name
 * @param {string} motorcycle - Motorcycle description
 * @param {string} orderNumber - Order number
 * @param {Array} services - List of services
 * @param {number} totalAmount - Total amount
 * @param {string} link - Client portal link
 * @param {Object} paymentInfo - Optional payment info { advancePayment, paymentMethod }
 * @param {Object} orderTotals - Optional order totals { laborTotal, partsTotal }
 * @param {Object} contactInfo - Optional contact info { mechanicName, mechanicPhone, isSupervisor }
 * @returns {string} - Formatted message
 */
export const getDetailedOrderMessage = (clientName, motorcycle, orderNumber, services, totalAmount, link, paymentInfo = null, orderTotals = null, contactInfo = null) => {
    // Format services list - just names, no breakdown per service
    let servicesList = '';

    if (services && services.length > 0) {
        servicesList = services.map(s => `  - ${s.name}`).join('\n');
    } else {
        servicesList = '  - Revisión General';
    }

    // Format totals breakdown
    let totalsSection = '';
    if (orderTotals && (orderTotals.laborTotal > 0 || orderTotals.partsTotal > 0)) {
        totalsSection = `
*DESGLOSE:*
  Mano de Obra: $${(orderTotals.laborTotal || 0).toLocaleString('es-MX')}
  Refacciones: $${(orderTotals.partsTotal || 0).toLocaleString('es-MX')}
`;
    }

    // Link section only if it exists
    const linkSection = link
        ? `\n*Sigue el proceso de tu reparación aquí:*\n${link}\n`
        : '';

    // Advance payment section if exists
    let paymentSection = '';
    if (paymentInfo && paymentInfo.advancePayment > 0) {
        const methodLabel = getPaymentMethodLabel(paymentInfo.paymentMethod);
        const remaining = totalAmount - paymentInfo.advancePayment;

        paymentSection = `
*ANTICIPO RECIBIDO: $${paymentInfo.advancePayment.toLocaleString('es-MX')}*
  Método: ${methodLabel}

*SALDO PENDIENTE: $${Math.max(0, remaining).toLocaleString('es-MX')}*
`;
    }

    // Contact section - only show if auxiliary mechanic with supervisor
    // Master mechanic = no phone number shown
    // Auxiliary mechanic = show supervisor's phone number
    let contactSection = 'Cualquier duda quedamos atentos.';
    if (contactInfo && contactInfo.isSupervisor && contactInfo.mechanicPhone) {
        const contactName = contactInfo.mechanicName || 'nuestro equipo';
        const formattedPhone = formatPhoneForDisplay(contactInfo.mechanicPhone);
        contactSection = `Cualquier duda comunícate con ${contactName}:\n${formattedPhone}`;
    }

    return `Hola ${clientName}!

*Orden de Servicio ${orderNumber}*

*Motocicleta:* ${motorcycle}

*Servicios realizados:*
${servicesList}
${totalsSection}
*TOTAL: $${(totalAmount || 0).toLocaleString('es-MX')}*
${paymentSection}${linkSection}
${contactSection}

Gracias por confiar en Motopartes!`;
};

/**
 * Format phone number for display in message
 * @param {string} phone - Raw phone number
 * @returns {string} - Formatted phone for display
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

/**
 * Get human-readable label for payment method
 * @param {string} method - Payment method code
 * @returns {string} - Readable label
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

