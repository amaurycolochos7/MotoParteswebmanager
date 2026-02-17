import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Genera un PDF con los detalles de la orden de servicio
 * @param {Object} order - Orden de servicio
 * @param {Object} client - Información del cliente
 * @param {Object} motorcycle - Información de la moto
 * @returns {jsPDF} - Documento PDF
 */
export function generateOrderPDF(order, client, motorcycle) {
    // Configuración optimizada para reducir tamaño
    const doc = new jsPDF({
        compress: true,  // Habilitar compresión
        unit: 'mm',
        format: 'a4'
    });

    // Colores del tema
    const primaryColor = [59, 130, 246]; // #3b82f6
    const darkColor = [15, 23, 42]; // #0f172a
    const grayColor = [100, 116, 139]; // #64748b

    // Logo y título
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 50, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('🏍️ MOTOPARTES', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Tu taller de confianza', 105, 30, { align: 'center' });

    // Información de la orden
    doc.setTextColor(...darkColor);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('ORDEN DE SERVICIO', 20, 60);

    doc.setFont('helvetica', 'normal');
    const orderDate = new Date(order.created_at).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text(order.order_number, 20, 70);

    doc.setFontSize(10);
    doc.setTextColor(...grayColor);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${orderDate}`, 20, 78);

    // Estado (badge en la esquina superior derecha)
    const statusText = order.status.toUpperCase();
    const statusWidth = doc.getTextWidth(statusText) + 10;
    doc.setFillColor(255, 215, 0); // Dorado
    doc.roundedRect(210 - statusWidth - 20, 58, statusWidth, 10, 2, 2, 'F');
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(statusText, 210 - statusWidth / 2 - 20, 65, { align: 'center' });

    // Información del cliente
    doc.setTextColor(...darkColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', 20, 95);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text(client.full_name, 20, 103);
    doc.text(`Tel: ${client.phone}`, 20, 110);
    if (client.email) {
        doc.text(`Email: ${client.email}`, 20, 117);
    }

    // Información de la moto
    doc.setTextColor(...darkColor);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('MOTOCICLETA', 110, 95);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text(`${motorcycle.brand} ${motorcycle.model}`, 110, 103);
    doc.text(`Año: ${motorcycle.year}`, 110, 110);
    doc.text(`Placas: ${motorcycle.plates || 'N/A'}`, 110, 117);

    // Línea separadora
    doc.setDrawColor(...grayColor);
    doc.setLineWidth(0.5);
    doc.line(20, 125, 190, 125);

    // Tabla de servicios
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text('SERVICIOS', 20, 135);

    const servicesData = order.services.map((service, idx) => [
        idx + 1,
        service.name,
        `$${service.price.toLocaleString('es-MX')}`
    ]);

    autoTable(doc, {
        startY: 140,
        head: [['#', 'Descripción', 'Precio']],
        body: servicesData,
        theme: 'striped',
        headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 10
        },
        bodyStyles: {
            fontSize: 9,
            textColor: darkColor
        },
        columnStyles: {
            0: { cellWidth: 15, halign: 'center' },
            1: { cellWidth: 120 },
            2: { cellWidth: 35, halign: 'right' }
        },
        margin: { left: 20, right: 20 }
    });

    // Totales
    let finalY = doc.lastAutoTable.finalY + 10;

    const servicesTotal = order.services.reduce((sum, svc) => sum + (svc.price || 0), 0);

    // Caja de totales
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(110, finalY, 80, 40, 2, 2, 'F');

    doc.setFontSize(10);
    doc.setTextColor(...grayColor);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', 115, finalY + 8);
    doc.text(`$${servicesTotal.toLocaleString('es-MX')}`, 185, finalY + 8, { align: 'right' });

    if (order.advance_payment > 0) {
        doc.text('Anticipo:', 115, finalY + 16);
        doc.setTextColor(16, 185, 129); // Verde
        doc.text(`-$${order.advance_payment.toLocaleString('es-MX')}`, 185, finalY + 16, { align: 'right' });
    }

    // Total/Saldo
    const balance = servicesTotal - (order.advance_payment || 0);
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(115, finalY + 22, 185, finalY + 22);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text('SALDO:', 115, finalY + 30);
    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.text(`$${balance.toLocaleString('es-MX')}`, 185, finalY + 30, { align: 'right' });

    // Footer
    finalY += 60;
    doc.setFontSize(8);
    doc.setTextColor(...grayColor);
    doc.setFont('helvetica', 'italic');
    doc.text('Gracias por confiar en Motopartes', 105, finalY, { align: 'center' });
    doc.text('Para más información, visita tu portal personalizado', 105, finalY + 5, { align: 'center' });

    // Código QR o link (opcional)
    if (order.client_link) {
        doc.setFontSize(7);
        doc.text(order.client_link, 105, finalY + 15, { align: 'center', maxWidth: 170 });
    }

    return doc;
}

/**
 * Descarga automáticamente el PDF de la orden
 * @param {Object} order - Orden de servicio
 * @param {Object} client - Cliente
 * @param {Object} motorcycle - Moto
 */
export function downloadOrderPDF(order, client, motorcycle) {
    const doc = generateOrderPDF(order, client, motorcycle);
    const filename = `${order.order_number}_${client.full_name.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
}

/**
 * Genera PDF de la orden como Blob para enviar por WhatsApp
 * @param {Object} order - Orden de servicio
 * @param {Object} client - Cliente
 * @param {Object} motorcycle - Moto
 * @returns {Promise<Blob>} - PDF como Blob
 */
export async function generateOrderPDFBlob(order, client, motorcycle) {
    const doc = generateOrderPDF(order, client, motorcycle);
    return doc.output('blob');
}
