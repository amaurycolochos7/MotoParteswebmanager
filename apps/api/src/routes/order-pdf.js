import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

/**
 * Generates a professional PDF for an order (server-side)
 */
function generatePDF(order, client, motorcycle) {
    const doc = new jsPDF({ compress: true, unit: 'mm', format: 'a4' });

    const BLACK = [25, 25, 25];
    const RED = [220, 38, 38];
    const GRAY = [100, 116, 139];
    const LIGHT_GRAY = [248, 250, 252];
    const WHITE = [255, 255, 255];
    const pageW = 210;
    const marginL = 18;
    const marginR = 18;
    const contentW = pageW - marginL - marginR;

    // Header
    doc.setFillColor(...BLACK);
    doc.rect(0, 0, pageW, 42, 'F');
    doc.setFillColor(...RED);
    doc.rect(0, 42, pageW, 2, 'F');

    doc.setTextColor(...WHITE);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('MOTOPARTES CLUB', marginL, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text('Reparaciones y Modificaciones', marginL, 28);

    // Order number + date
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
    const statusName = order.status?.name || 'Pendiente';
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const statusW = doc.getTextWidth(statusName.toUpperCase()) + 8;
    doc.setFillColor(...RED);
    doc.roundedRect(pageW - marginR - statusW, 28, statusW, 7, 1.5, 1.5, 'F');
    doc.setTextColor(...WHITE);
    doc.text(statusName.toUpperCase(), pageW - marginR - statusW / 2, 33, { align: 'center' });

    // Client & Motorcycle info
    let y = 52;
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(marginL, y, contentW, 28, 2, 2, 'F');

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

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(marginL + contentW / 2, y + 4, marginL + contentW / 2, y + 24);

    y += 35;

    // Customer complaint
    if (order.customer_complaint) {
        doc.setTextColor(...RED);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('FALLA REPORTADA', marginL, y);
        y += 5;
        doc.setTextColor(...BLACK);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(order.customer_complaint, contentW);
        doc.text(lines, marginL, y);
        y += lines.length * 4.5 + 4;
    }

    // Build table data
    const laborTotal = parseFloat(order.labor_total) || 0;
    const partsTotal = parseFloat(order.parts_total) || 0;
    const totalAmount = parseFloat(order.total_amount) || 0;

    const tableRows = [];

    // Labor items
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

    // Services
    (order.services || []).forEach(s => {
        const price = parseFloat(s.price) || 0;
        tableRows.push(['Servicio', s.name, price > 0 ? `$${price.toLocaleString('es-MX')}` : '-']);
    });

    // Parts
    (order.order_parts || []).forEach(p => {
        const price = parseFloat(p.unit_price || p.price) || 0;
        const qty = parseInt(p.quantity) || 1;
        tableRows.push(['Refaccion', p.part_name || p.name, `$${(price * qty).toLocaleString('es-MX')}`]);
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
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 28, fontStyle: 'bold', textColor: GRAY, fontSize: 7.5 },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
            },
            margin: { left: marginL, right: marginR },
        });

        y = doc.lastAutoTable.finalY + 6;
    }

    // Totals
    const totalsBoxX = pageW - marginR - 80;
    const totalsBoxW = 80;
    let totalLineY = y + 8;

    if (laborTotal > 0) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
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

    if (parseFloat(order.advance_payment) > 0) {
        doc.setTextColor(...GRAY);
        doc.text('Anticipo:', totalsBoxX + 5, totalLineY);
        doc.setTextColor(16, 185, 129);
        doc.text(`-$${parseFloat(order.advance_payment).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsBoxX + totalsBoxW - 5, totalLineY, { align: 'right' });
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

    // Footer
    const footerY = Math.max(totalLineY + 20, y + 40);
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(marginL, footerY, pageW - marginR, footerY);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.setFont('helvetica', 'normal');
    doc.text('MotoPartes Club  |  Reparaciones y Modificaciones', pageW / 2, footerY + 6, { align: 'center' });
    doc.text('Gracias por su preferencia', pageW / 2, footerY + 11, { align: 'center' });

    return doc;
}

export default async function orderPdfRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // POST /api/order-pdf/:id/send
    // Generates a PDF server-side and sends it via WhatsApp to the client
    fastify.post('/:id/send', async (request, reply) => {
        const { id } = request.params;

        try {
            // Fetch order with all related data
            const order = await prisma.service_order.findUnique({
                where: { id },
                include: {
                    status: true,
                    services: true,
                    order_parts: true,
                    mechanic: true,
                },
            });

            if (!order) {
                return reply.code(404).send({ error: 'Orden no encontrada' });
            }

            // Get client and motorcycle
            const client = await prisma.client.findUnique({ where: { id: order.client_id } });
            const motorcycle = await prisma.motorcycle.findUnique({ where: { id: order.motorcycle_id } });

            if (!client?.phone) {
                return reply.code(400).send({ error: 'El cliente no tiene numero de telefono' });
            }

            // Generate PDF
            const doc = generatePDF(order, client, motorcycle);
            const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
            const pdfBase64 = pdfBuffer.toString('base64');
            const filename = `${order.order_number}_resumen.pdf`;

            // Build WhatsApp caption
            const motoInfo = motorcycle ? `${motorcycle.brand} ${motorcycle.model}` : 'N/A';
            const totalAmt = parseFloat(order.total_amount) || 0;
            const caption = `*RESUMEN DE SERVICIO*\n${order.order_number}\nMoto: ${motoInfo}\nTotal: $${totalAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n\n-- MotoPartes Club`;

            // Find which mechanic session to use
            const mechanicId = order.approved_by || order.mechanic_id;

            // Send via WhatsApp bot
            const botResponse = await fetch(`${BOT_URL}/api/send-document`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': BOT_KEY,
                },
                body: JSON.stringify({
                    mechanicId,
                    phone: client.phone,
                    message: caption,
                    base64: pdfBase64,
                    filename,
                    mimetype: 'application/pdf',
                }),
            });

            const botResult = await botResponse.json();

            if (!botResponse.ok) {
                // If bot is unavailable, still return the PDF base64 for fallback
                return reply.code(200).send({
                    success: false,
                    fallback: true,
                    pdfBase64,
                    filename,
                    error: botResult.error || 'WhatsApp no disponible',
                });
            }

            return reply.send({
                success: true,
                automated: true,
                messageId: botResult.messageId,
            });

        } catch (error) {
            fastify.log.error('Error in send-pdf:', error);
            return reply.code(500).send({
                error: 'Error al generar/enviar PDF',
                details: error.message,
            });
        }
    });

    // GET /api/order-pdf/:id/download
    // Returns the PDF as a downloadable file
    fastify.get('/:id/download', async (request, reply) => {
        const { id } = request.params;

        try {
            const order = await prisma.service_order.findUnique({
                where: { id },
                include: {
                    status: true,
                    services: true,
                    order_parts: true,
                },
            });

            if (!order) {
                return reply.code(404).send({ error: 'Orden no encontrada' });
            }

            const client = await prisma.client.findUnique({ where: { id: order.client_id } });
            const motorcycle = await prisma.motorcycle.findUnique({ where: { id: order.motorcycle_id } });

            const doc = generatePDF(order, client, motorcycle);
            const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
            const filename = `${order.order_number}_resumen.pdf`;

            reply
                .header('Content-Type', 'application/pdf')
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send(pdfBuffer);

        } catch (error) {
            fastify.log.error('Error generating PDF:', error);
            return reply.code(500).send({ error: 'Error al generar PDF', details: error.message });
        }
    });
}
