import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import PDFDocument from 'pdfkit';

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

/**
 * Generates a professional PDF Buffer for an order using PDFKit
 */
function generatePDF(order, client, motorcycle) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const pageW = 595.28; // A4 width in points
            const marginL = 50;
            const marginR = 50;
            const contentW = pageW - marginL - marginR;

            // Colors
            const RED = '#DC2626';
            const BLACK = '#191919';
            const GRAY = '#64748B';
            const LIGHT_BG = '#F8FAFC';

            // ─── HEADER BAR ───
            doc.rect(0, 0, pageW, 80).fill(BLACK);
            doc.rect(0, 80, pageW, 4).fill(RED);

            // Title
            doc.fontSize(24).fillColor('white').font('Helvetica-Bold');
            doc.text('MOTOPARTES CLUB', marginL, 22, { width: contentW / 2 });
            doc.fontSize(10).fillColor('#B0B0B0').font('Helvetica');
            doc.text('Reparaciones y Modificaciones', marginL, 50);

            // Order number (right side)
            doc.fontSize(14).fillColor('white').font('Helvetica-Bold');
            doc.text(order.order_number || 'S/N', marginL, 22, { width: contentW, align: 'right' });

            const orderDate = new Date(order.created_at).toLocaleDateString('es-MX', {
                day: '2-digit', month: 'long', year: 'numeric'
            });
            doc.fontSize(9).fillColor('#B0B0B0').font('Helvetica');
            doc.text(orderDate, marginL, 40, { width: contentW, align: 'right' });

            // Status badge
            const statusName = order.status?.name || 'Pendiente';
            doc.fontSize(8).font('Helvetica-Bold');
            const badgeW = doc.widthOfString(statusName.toUpperCase()) + 14;
            const badgeX = pageW - marginR - badgeW;
            doc.roundedRect(badgeX, 54, badgeW, 16, 3).fill(RED);
            doc.fillColor('white').text(statusName.toUpperCase(), badgeX, 59, { width: badgeW, align: 'center' });

            // ─── CLIENT & MOTORCYCLE INFO ───
            let y = 100;

            doc.roundedRect(marginL, y, contentW, 60, 4).fill(LIGHT_BG);

            // Client column
            doc.fontSize(7).fillColor(RED).font('Helvetica-Bold');
            doc.text('CLIENTE', marginL + 12, y + 10);
            doc.fontSize(11).fillColor(BLACK).font('Helvetica-Bold');
            doc.text(client?.full_name || 'Sin nombre', marginL + 12, y + 22);
            doc.fontSize(9).fillColor(GRAY).font('Helvetica');
            doc.text(`Tel: ${client?.phone || 'N/A'}`, marginL + 12, y + 38);

            // Divider line
            const midX = marginL + contentW / 2;
            doc.moveTo(midX, y + 8).lineTo(midX, y + 52).strokeColor('#E0E0E0').lineWidth(0.5).stroke();

            // Motorcycle column
            doc.fontSize(7).fillColor(RED).font('Helvetica-Bold');
            doc.text('MOTOCICLETA', midX + 12, y + 10);
            doc.fontSize(11).fillColor(BLACK).font('Helvetica-Bold');
            doc.text(`${motorcycle?.brand || ''} ${motorcycle?.model || ''}`.trim() || 'N/A', midX + 12, y + 22);
            doc.fontSize(9).fillColor(GRAY).font('Helvetica');
            doc.text(`${motorcycle?.year || ''} | Placas: ${motorcycle?.plates || 'N/A'}`, midX + 12, y + 38);

            y += 75;

            // ─── CUSTOMER COMPLAINT ───
            if (order.customer_complaint) {
                doc.fontSize(7).fillColor(RED).font('Helvetica-Bold');
                doc.text('FALLA REPORTADA', marginL, y);
                y += 12;
                doc.fontSize(9).fillColor(BLACK).font('Helvetica');
                doc.text(order.customer_complaint, marginL, y, { width: contentW });
                y += doc.heightOfString(order.customer_complaint, { width: contentW }) + 12;
            }

            // ─── BUILD TABLE DATA ───
            const laborTotal = parseFloat(order.labor_total) || 0;
            const partsTotal = parseFloat(order.parts_total) || 0;
            const totalAmount = parseFloat(order.total_amount) || 0;

            const tableRows = [];

            // Labor items from mechanic_notes
            if (order.mechanic_notes && order.mechanic_notes.includes('|')) {
                order.mechanic_notes.split(' | ').forEach(item => {
                    const parts = item.split(': $');
                    if (parts.length === 2) {
                        tableRows.push({ type: 'Mano de Obra', desc: parts[0], cost: `$${parseFloat(parts[1]).toLocaleString('es-MX')}` });
                    } else {
                        tableRows.push({ type: 'Mano de Obra', desc: item, cost: '' });
                    }
                });
            } else if (laborTotal > 0) {
                tableRows.push({ type: 'Mano de Obra', desc: order.mechanic_notes || 'Servicio general', cost: `$${laborTotal.toLocaleString('es-MX')}` });
            }

            // Services
            (order.services || []).forEach(s => {
                const price = parseFloat(s.price) || 0;
                tableRows.push({ type: 'Servicio', desc: s.name, cost: price > 0 ? `$${price.toLocaleString('es-MX')}` : '-' });
            });

            // Parts
            (order.order_parts || []).forEach(p => {
                const price = parseFloat(p.unit_price || p.price) || 0;
                const qty = parseInt(p.quantity) || 1;
                tableRows.push({ type: 'Refaccion', desc: p.part_name || p.name, cost: `$${(price * qty).toLocaleString('es-MX')}` });
            });

            // ─── TABLE ───
            if (tableRows.length > 0) {
                doc.fontSize(10).fillColor(BLACK).font('Helvetica-Bold');
                doc.text('DETALLE DE SERVICIO', marginL, y);
                y += 16;

                // Table header
                doc.roundedRect(marginL, y, contentW, 22, 2).fill(BLACK);
                doc.fontSize(8).fillColor('white').font('Helvetica-Bold');
                doc.text('TIPO', marginL + 8, y + 7, { width: 70 });
                doc.text('DESCRIPCION', marginL + 80, y + 7, { width: contentW - 160 });
                doc.text('COSTO', marginL + contentW - 70, y + 7, { width: 62, align: 'right' });
                y += 22;

                // Table rows
                tableRows.forEach((row, idx) => {
                    const bgColor = idx % 2 === 0 ? '#FFFFFF' : LIGHT_BG;
                    doc.rect(marginL, y, contentW, 20).fill(bgColor);

                    doc.fontSize(7).fillColor(GRAY).font('Helvetica-Bold');
                    doc.text(row.type, marginL + 8, y + 6, { width: 70 });
                    doc.fontSize(8.5).fillColor(BLACK).font('Helvetica');
                    doc.text(row.desc, marginL + 80, y + 6, { width: contentW - 160 });
                    doc.fontSize(8.5).fillColor(BLACK).font('Helvetica-Bold');
                    doc.text(row.cost, marginL + contentW - 70, y + 6, { width: 62, align: 'right' });

                    y += 20;
                });

                // Bottom border
                doc.moveTo(marginL, y).lineTo(marginL + contentW, y).strokeColor('#E0E0E0').lineWidth(0.5).stroke();
                y += 8;
            } else {
                doc.fontSize(9).fillColor(GRAY).font('Helvetica-Oblique');
                doc.text('Sin servicios registrados', marginL, y);
                y += 16;
            }

            // ─── TOTALS BOX ───
            const totalsX = marginL + contentW - 180;
            const totalsW = 180;
            let tY = y + 4;

            doc.roundedRect(totalsX, tY, totalsW, 60, 3).fill(LIGHT_BG);

            tY += 10;
            if (laborTotal > 0) {
                doc.fontSize(9).fillColor(GRAY).font('Helvetica');
                doc.text('Mano de obra:', totalsX + 10, tY);
                doc.fillColor(BLACK).font('Helvetica-Bold');
                doc.text(`$${laborTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsX + 10, tY, { width: totalsW - 20, align: 'right' });
                tY += 14;
            }

            if (partsTotal > 0) {
                doc.fontSize(9).fillColor(GRAY).font('Helvetica');
                doc.text('Refacciones:', totalsX + 10, tY);
                doc.fillColor(BLACK).font('Helvetica-Bold');
                doc.text(`$${partsTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsX + 10, tY, { width: totalsW - 20, align: 'right' });
                tY += 14;
            }

            // Divider
            doc.moveTo(totalsX + 10, tY).lineTo(totalsX + totalsW - 10, tY).strokeColor(RED).lineWidth(1).stroke();
            tY += 8;

            doc.fontSize(12).fillColor(BLACK).font('Helvetica-Bold');
            doc.text('TOTAL:', totalsX + 10, tY);
            doc.fillColor(RED).fontSize(14);
            doc.text(`$${totalAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, totalsX + 10, tY, { width: totalsW - 20, align: 'right' });

            // ─── FOOTER ───
            const footerY = Math.max(tY + 40, 720);
            doc.moveTo(marginL, footerY).lineTo(marginL + contentW, footerY).strokeColor('#E0E0E0').lineWidth(0.3).stroke();
            doc.fontSize(8).fillColor(GRAY).font('Helvetica');
            doc.text('MotoPartes Club  |  Reparaciones y Modificaciones', marginL, footerY + 8, { width: contentW, align: 'center' });
            doc.text('Gracias por su preferencia', marginL, footerY + 20, { width: contentW, align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

export default async function orderPdfRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);

    // POST /api/order-pdf/:id/send
    fastify.post('/:id/send', async (request, reply) => {
        const { id } = request.params;

        try {
            const order = await prisma.service_order.findUnique({
                where: { id },
                include: { status: true, services: true, order_parts: true, mechanic: true },
            });

            if (!order) return reply.code(404).send({ error: 'Orden no encontrada' });

            const client = await prisma.client.findUnique({ where: { id: order.client_id } });
            const motorcycle = await prisma.motorcycle.findUnique({ where: { id: order.motorcycle_id } });

            if (!client?.phone) return reply.code(400).send({ error: 'El cliente no tiene telefono' });

            // Generate PDF
            const pdfBuffer = await generatePDF(order, client, motorcycle);
            const pdfBase64 = pdfBuffer.toString('base64');
            const filename = `${order.order_number}_resumen.pdf`;

            // WhatsApp caption
            const motoInfo = motorcycle ? `${motorcycle.brand} ${motorcycle.model}` : 'N/A';
            const totalAmt = parseFloat(order.total_amount) || 0;
            const caption = `*RESUMEN DE SERVICIO*\n${order.order_number}\nMoto: ${motoInfo}\nTotal: $${totalAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\n\n-- MotoPartes Club`;

            const mechanicId = order.approved_by || order.mechanic_id;

            // Send via WhatsApp bot
            const botResponse = await fetch(`${BOT_URL}/api/send-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
                body: JSON.stringify({ mechanicId, phone: client.phone, message: caption, base64: pdfBase64, filename, mimetype: 'application/pdf' }),
            });

            const botResult = await botResponse.json();

            if (!botResponse.ok) {
                return reply.send({ success: false, fallback: true, error: botResult.error || 'WhatsApp no disponible' });
            }

            return reply.send({ success: true, automated: true, messageId: botResult.messageId });
        } catch (error) {
            fastify.log.error(`Error in send-pdf: ${error.message}\n${error.stack}`);
            return reply.code(500).send({ error: 'Error al generar/enviar PDF', details: error.message });
        }
    });

    // GET /api/order-pdf/:id/download
    fastify.get('/:id/download', async (request, reply) => {
        const { id } = request.params;

        try {
            const order = await prisma.service_order.findUnique({
                where: { id },
                include: { status: true, services: true, order_parts: true },
            });
            if (!order) return reply.code(404).send({ error: 'Orden no encontrada' });

            const client = await prisma.client.findUnique({ where: { id: order.client_id } });
            const motorcycle = await prisma.motorcycle.findUnique({ where: { id: order.motorcycle_id } });

            const pdfBuffer = await generatePDF(order, client, motorcycle);
            const filename = `${order.order_number}_resumen.pdf`;

            reply.header('Content-Type', 'application/pdf')
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send(pdfBuffer);
        } catch (error) {
            fastify.log.error(`Error generating PDF: ${error.message}\n${error.stack}`);
            return reply.code(500).send({ error: 'Error al generar PDF', details: error.message });
        }
    });
}
