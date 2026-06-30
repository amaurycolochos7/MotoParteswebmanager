import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Pre-load logo as base64 for embedding in PDF
let logoBase64 = null;

async function loadLogo() {
    if (logoBase64) return logoBase64;
    try {
        const response = await fetch('/logo-motopartes.png');
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                logoBase64 = reader.result;
                resolve(logoBase64);
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('Could not load logo for PDF:', e);
        return null;
    }
}

/**
 * Genera un PDF profesional con los detalles de la orden de servicio
 */
export async function generateOrderPDF(order, client, motorcycle) {
    const doc = new jsPDF({ compress: true, unit: 'mm', format: 'a4' });

    // Brand colors
    const BLACK = [25, 25, 25];
    const RED = [220, 38, 38];
    const GRAY = [100, 116, 139];
    const LIGHT_GRAY = [241, 245, 249];
    const WHITE = [255, 255, 255];

    const pageW = 210;
    const marginL = 18;
    const marginR = 18;
    const contentW = pageW - marginL - marginR;

    // ─── HEADER ───
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, pageW, 42, 'F');

    // Red accent line
    doc.setFillColor(...RED);
    doc.rect(0, 42, pageW, 2, 'F');

    // Logo
    const logo = await loadLogo();
    if (logo) {
        doc.addImage(logo, 'PNG', marginL, 5, 32, 32);
    }

    // Title text
    doc.setTextColor(...WHITE);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('MOTOPARTES CLUB', logo ? 56 : marginL, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text('Reparaciones y Modificaciones', logo ? 56 : marginL, 28);

    // Order number + date in header right side
    doc.setTextColor(...WHITE);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(order.order_number || 'S/N', pageW - marginR, 18, { align: 'right' });

    const orderDate = new Date(order.created_at).toLocaleDateString('es-MX', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text(orderDate, pageW - marginR, 24, { align: 'right' });

    // Status badge
    const statusName = typeof order.status === 'string' ? order.status : order.status?.name || 'Pendiente';
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const statusW = doc.getTextWidth(statusName.toUpperCase()) + 8;
    doc.setFillColor(...RED);
    doc.roundedRect(pageW - marginR - statusW, 28, statusW, 7, 1.5, 1.5, 'F');
    doc.setTextColor(...WHITE);
    doc.text(statusName.toUpperCase(), pageW - marginR - statusW / 2, 33, { align: 'center' });

    // ─── CLIENT & MOTORCYCLE INFO ───
    let y = 52;

    // Info box background
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(marginL, y, contentW, 28, 2, 2, 'F');

    // Client column
    doc.setTextColor(...RED);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', marginL + 6, y + 7);

    doc.setTextColor(...BLACK);
    doc.setFontSize(10);
    doc.text(client?.full_name || 'Sin nombre', marginL + 6, y + 14);

    doc.setTextColor(...GRAY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Tel: ${client?.phone || 'N/A'}`, marginL + 6, y + 20);

    // Motorcycle column
    const midX = marginL + contentW / 2 + 5;
    doc.setTextColor(...RED);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('MOTOCICLETA', midX, y + 7);

    doc.setTextColor(...BLACK);
    doc.setFontSize(10);
    doc.text(`${motorcycle?.brand || ''} ${motorcycle?.model || ''}`.trim() || 'N/A', midX, y + 14);

    doc.setTextColor(...GRAY);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${motorcycle?.year || ''} | Placas: ${motorcycle?.plates || 'N/A'}`, midX, y + 20);

    // Vertical divider
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(marginL + contentW / 2, y + 4, marginL + contentW / 2, y + 24);

    y += 35;

    // ELIHU: fecha prometida/estimada de entrega
    if (order.estimated_delivery_at) {
        doc.setTextColor(...RED);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('ENTREGA ESTIMADA', marginL, y);
        doc.setTextColor(...BLACK);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(new Date(order.estimated_delivery_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }), marginL + 40, y);
        y += 8;
    }

    // ─── CUSTOMER COMPLAINT ───
    if (order.customer_complaint) {
        doc.setTextColor(...RED);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('FALLA REPORTADA', marginL, y);
        y += 5;

        doc.setTextColor(...BLACK);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const complaintLines = doc.splitTextToSize(order.customer_complaint, contentW);
        doc.text(complaintLines, marginL, y);
        y += complaintLines.length * 4.5 + 4;
    }

    // ─── SERVICES TABLE ───
    const services = order.services || [];
    const laborTotal = parseFloat(order.labor_total) || 0;
    const partsTotal = parseFloat(order.parts_total) || 0;
    const totalAmount = parseFloat(order.total_amount) || 0;

    // Build combined table data
    const tableRows = [];

    // Add labor items from mechanic_notes
    if (order.mechanic_notes && order.mechanic_notes.includes('|')) {
        order.mechanic_notes.split(' | ').forEach(item => {
            const parts = item.split(': $');
            if (parts.length === 2) {
                tableRows.push(['Mano de Obra', parts[0], `$${parseFloat(parts[1]).toLocaleString('es-MX')}`]);
            } else {
                tableRows.push(['Mano de Obra', item, '']);
            }
        });
    } else if (laborTotal > 0) {
        tableRows.push(['Mano de Obra', order.mechanic_notes || 'Servicio general', `$${laborTotal.toLocaleString('es-MX')}`]);
    }

    // Add services
    services.forEach(s => {
        const price = parseFloat(s.price) || 0;
        tableRows.push(['Servicio', s.name, price > 0 ? `$${price.toLocaleString('es-MX')}` : '-']);
    });

    // Add parts
    const orderParts = order.parts || [];
    orderParts.forEach(p => {
        const price = parseFloat(p.price || p.cost) || 0;
        const qty = parseInt(p.quantity) || 1;
        tableRows.push(['Refaccion', p.name, `$${(price * qty).toLocaleString('es-MX')}`]);
    });

    if (tableRows.length > 0) {
        doc.setTextColor(...BLACK);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALLE DE SERVICIO', marginL, y);
        y += 2;

        autoTable(doc, {
            startY: y,
            head: [['Tipo', 'Descripcion', 'Costo']],
            body: tableRows,
            theme: 'plain',
            headStyles: {
                fillColor: BLACK,
                textColor: WHITE,
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 4,
            },
            bodyStyles: {
                fontSize: 8.5,
                textColor: BLACK,
                cellPadding: 3.5,
                lineColor: [230, 230, 230],
                lineWidth: 0.3,
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252],
            },
            columnStyles: {
                0: { cellWidth: 28, fontStyle: 'bold', textColor: GRAY, fontSize: 7.5 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
            },
            margin: { left: marginL, right: marginR },
        });

        y = doc.lastAutoTable.finalY + 6;
    } else {
        doc.setTextColor(...GRAY);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text('Sin servicios registrados', marginL, y);
        y += 8;
    }

    // ─── TOTALS BOX ───
    const totalsBoxX = pageW - marginR - 80;
    const totalsBoxW = 80;
    let totalsY = y;

    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(totalsBoxX, totalsY, totalsBoxW, laborTotal > 0 && partsTotal > 0 ? 38 : 26, 2, 2, 'F');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);

    let totalLineY = totalsY + 8;

    if (laborTotal > 0) {
        doc.text('Mano de obra:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(...BLACK);
        doc.text(`$${laborTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
        doc.setTextColor(...GRAY);
    }

    if (partsTotal > 0) {
        doc.text('Refacciones:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(...BLACK);
        doc.text(`$${partsTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
    }

    if (order.advance_payment > 0) {
        doc.setTextColor(...GRAY);
        doc.text('Anticipo:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(16, 185, 129);
        doc.text(`-$${parseFloat(order.advance_payment).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
    }

    // ELIHU: pagado + saldo pendiente (order._paid / _balance los inyecta OrderDetail).
    if (order._paid != null) {
        doc.setTextColor(...GRAY);
        doc.text('Pagado:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(16, 185, 129);
        doc.text(`$${(Number(order._paid) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
        doc.setTextColor(...GRAY);
        doc.text('Saldo:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(...RED);
        doc.text(`$${(Number(order._balance) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
    }

    // Total line separator
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.5);
    doc.line(totalsBoxX + 5, totalLineY - 2, totalsBoxX + totalsBoxW - 5, totalLineY - 2);

    // TOTAL
    totalLineY += 3;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('TOTAL:', totalsBoxX + 5, totalLineY);
    doc.setTextColor(...RED);
    doc.setFontSize(13);
    doc.text(`$${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });

    // Adjust totals box height
    const boxHeight = totalLineY - totalsY + 5;
    doc.setFillColor(...LIGHT_GRAY);
    // Redraw with correct height
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(totalsBoxX, totalsY, totalsBoxW, boxHeight, 2, 2, 'F');

    // Redraw totals content on top of the box
    totalLineY = totalsY + 8;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');

    if (laborTotal > 0) {
        doc.setTextColor(...GRAY);
        doc.text('Mano de obra:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(...BLACK);
        doc.text(`$${laborTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
    }

    if (partsTotal > 0) {
        doc.setTextColor(...GRAY);
        doc.text('Refacciones:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(...BLACK);
        doc.text(`$${partsTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
    }

    if (order.advance_payment > 0) {
        doc.setTextColor(...GRAY);
        doc.text('Anticipo:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(16, 185, 129);
        doc.text(`-$${parseFloat(order.advance_payment).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
    }

    if (order._paid != null) {
        doc.setTextColor(...GRAY);
        doc.text('Pagado:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(16, 185, 129);
        doc.text(`$${(Number(order._paid) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
        doc.setTextColor(...GRAY);
        doc.text('Saldo:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(...RED);
        doc.text(`$${(Number(order._balance) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
        totalLineY += 6;
    }

    doc.setDrawColor(...RED);
    doc.setLineWidth(0.5);
    doc.line(totalsBoxX + 5, totalLineY - 2, totalsBoxX + totalsBoxW - 5, totalLineY - 2);
    totalLineY += 3;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('TOTAL:', totalsBoxX + 5, totalLineY);
    doc.setTextColor(...RED);
    doc.setFontSize(13);
    doc.text(`$${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });

    y = Math.max(y, totalLineY) + 15;

    // ─── EVIDENCIAS DEL SERVICIO ───
    // Sólo evidencias (evidence_type) activas (no eliminadas vía soft delete).
    const evidences = (order.photos || []).filter(
        (p) => p && p.evidence_type && !p.deleted_at
    );
    const EV_LABELS = { pieza_danada: 'Pieza dañada', pieza_nueva: 'Pieza nueva', despues_trabajo: 'Después del trabajo' };
    if (evidences.length > 0) {
        doc.addPage();
        let ey = 20;
        doc.setTextColor(...BLACK);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('EVIDENCIAS DEL SERVICIO', marginL, ey);
        doc.setFillColor(...RED);
        doc.rect(marginL, ey + 3, contentW, 1, 'F');
        ey += 12;

        const colW = (contentW - 8) / 2;
        const imgH = 52;
        const cellH = imgH + 22;
        let col = 0;
        for (const ev of evidences) {
            if (ey + cellH > 280) { doc.addPage(); ey = 20; col = 0; }
            const x = marginL + col * (colW + 8);
            try {
                doc.addImage(ev.url, 'JPEG', x, ey, colW, imgH);
            } catch {
                doc.setFillColor(...LIGHT_GRAY);
                doc.rect(x, ey, colW, imgH, 'F');
            }
            let ty = ey + imgH + 5;
            doc.setTextColor(...RED);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text(EV_LABELS[ev.evidence_type] || 'Evidencia', x, ty);
            ty += 4;
            doc.setTextColor(...GRAY);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text(new Date(ev.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }), x, ty);
            if (ev.caption) {
                ty += 4;
                doc.setTextColor(...BLACK);
                const noteLines = doc.splitTextToSize(ev.caption, colW);
                doc.text(noteLines.slice(0, 2), x, ty);
            }
            col = col === 0 ? 1 : 0;
            if (col === 0) ey += cellH;
        }
    }

    // ─── FOOTER ───
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 6;

    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.setFont('helvetica', 'normal');
    doc.text('MotoPartes Club  |  Reparaciones y Modificaciones', pageW / 2, y, { align: 'center' });
    doc.text('Gracias por su preferencia', pageW / 2, y + 5, { align: 'center' });

    return doc;
}

/**
 * Descarga automaticamente el PDF de la orden
 */
export async function downloadOrderPDF(order, client, motorcycle) {
    const doc = await generateOrderPDF(order, client, motorcycle);
    const filename = `${order.order_number}_${(client?.full_name || 'cliente').replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
}

/**
 * Genera PDF de la orden como Blob para enviar por WhatsApp
 */
export async function generateOrderPDFBlob(order, client, motorcycle) {
    const doc = await generateOrderPDF(order, client, motorcycle);
    return doc.output('blob');
}

/**
 * ELIHU: Recibo / comprobante de pago (abono) con folio.
 * `receipt` viene de GET /api/order-payments/:id/receipt.
 */
export async function generatePaymentReceiptPDF(receipt) {
    const doc = new jsPDF({ compress: true, unit: 'mm', format: 'a5' });
    const BLACK = [25, 25, 25], RED = [220, 38, 38], GRAY = [100, 116, 139], WHITE = [255, 255, 255];
    const pageW = 148, marginL = 14, marginR = 14, contentW = pageW - marginL - marginR;
    const money = (n) => `$${(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

    // Header
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setFillColor(...RED);
    doc.rect(0, 26, pageW, 1.5, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(receipt.workshop || 'Taller', marginL, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Recibo de pago', marginL, 19);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(receipt.receipt_number || 'S/F', pageW - marginR, 12, { align: 'right' });
    if (receipt.cancelled) {
        doc.setTextColor(...RED);
        doc.text('CANCELADO', pageW - marginR, 19, { align: 'right' });
    }

    let y = 36;
    const line = (label, value, opts = {}) => {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRAY);
        doc.text(label, marginL, y);
        doc.setTextColor(...(opts.color || BLACK));
        doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
        doc.text(String(value ?? '—'), pageW - marginR, y, { align: 'right' });
        y += 6.5;
    };

    line('Fecha', new Date(receipt.payment_date).toLocaleString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    line('Cliente', receipt.client?.name || '—');
    line('Teléfono', receipt.client?.phone || '—');
    line('Motocicleta', receipt.motorcycle || '—');
    line('Orden', receipt.order_number || '—');
    line('Método de pago', ({ efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro' }[receipt.payment_method]) || receipt.payment_method);

    y += 2;
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.4);
    doc.line(marginL, y, pageW - marginR, y);
    y += 7;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Monto abonado', marginL, y);
    doc.setTextColor(...RED);
    doc.setFontSize(13);
    doc.text(money(receipt.amount), pageW - marginR, y, { align: 'right' });
    y += 9;

    line('Total de la orden', money(receipt.order_total));
    line('Total pagado acumulado', money(receipt.total_paid), { color: [21, 128, 61], bold: true });
    line('Saldo pendiente', money(receipt.balance), { color: (Number(receipt.balance) > 0 ? RED : [21, 128, 61]), bold: true });
    line('Estado de pago', receipt.payment_status, { bold: true });
    if (receipt.note) line('Notas', receipt.note);

    y += 4;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.setFont('helvetica', 'normal');
    doc.text('Gracias por su preferencia', pageW / 2, y, { align: 'center' });

    return doc;
}

export async function downloadPaymentReceiptPDF(receipt) {
    const doc = await generatePaymentReceiptPDF(receipt);
    doc.save(`recibo_${receipt.receipt_number || 'pago'}.pdf`);
}

export async function generatePaymentReceiptBlob(receipt) {
    const doc = await generatePaymentReceiptPDF(receipt);
    return doc.output('blob');
}
