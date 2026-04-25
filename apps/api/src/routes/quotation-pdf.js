import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { assertWithinLimit, incrementUsageAsync, PlanLimitError } from '../lib/billing.js';
import PDFDocument from 'pdfkit';

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
// WHATSAPP_API_KEY must match the bot's API_KEY / WHATSAPP_API_KEY env.
// Fallback exists to avoid tumbling the API when env is unset; set it in Dokploy
// to rotate the shared secret.
const BOT_KEY_FALLBACK = 'motopartes-whatsapp-key';
const BOT_KEY = process.env.WHATSAPP_API_KEY || BOT_KEY_FALLBACK;
if (BOT_KEY === BOT_KEY_FALLBACK) {
    console.warn('[QUOTE-PDF-SEND] ⚠️ WHATSAPP_API_KEY env var is not set — using the legacy default. Set it in Dokploy to rotate.');
}

// Pretty-print the quotation status (stored lowercase in DB).
function prettyStatus(status) {
    const map = {
        pendiente: 'Pendiente',
        aceptada: 'Aceptada',
        rechazada: 'Rechazada',
        expirada: 'Expirada',
        convertida: 'Convertida',
    };
    return map[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pendiente');
}

/**
 * Generates a professional PDF Buffer for a quotation using PDFKit.
 *
 * `workspace` is optional — when provided, its branding (name, colors,
 * tagline, pdf_footer) is used. When absent, the defaults match the
 * flagship MotoPartes look so legacy callers keep working.
 */
function generatePDF(quotation, client, motorcycle, workspace) {
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

            // Workspace-aware branding with safe fallbacks.
            const branding = workspace?.branding || {};
            const RED = branding.primary_color || '#DC2626';
            const BLACK = branding.secondary_color || '#191919';
            const GRAY = '#64748B';
            const LIGHT_BG = '#F8FAFC';
            const wsName = (workspace?.name || 'MotoPartes').toUpperCase();
            const wsTagline = branding.tagline || 'Sistema de gestión de taller';
            const wsFooter = branding.pdf_footer || `-- ${workspace?.name || 'MotoPartes'}`;

            // ─── HEADER BAR ───
            doc.rect(0, 0, pageW, 80).fill(BLACK);
            doc.rect(0, 80, pageW, 4).fill(RED);

            // Title — fixed "COTIZACIÓN" label so the document is unambiguous
            doc.fontSize(24).fillColor('white').font('Helvetica-Bold');
            doc.text(wsName, marginL, 22, { width: contentW / 2 });
            doc.fontSize(10).fillColor('#B0B0B0').font('Helvetica');
            doc.text('COTIZACIÓN · ' + wsTagline, marginL, 50);

            // Quotation number (right side)
            doc.fontSize(14).fillColor('white').font('Helvetica-Bold');
            doc.text(quotation.quotation_number || 'S/N', marginL, 22, { width: contentW, align: 'right' });

            const quoteDate = new Date(quotation.created_at).toLocaleDateString('es-MX', {
                day: '2-digit', month: 'long', year: 'numeric'
            });
            doc.fontSize(9).fillColor('#B0B0B0').font('Helvetica');
            doc.text(quoteDate, marginL, 40, { width: contentW, align: 'right' });

            // Status badge — uses the quotation's own status (Pendiente/Aceptada/etc.)
            const statusName = prettyStatus(quotation.status);
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

            // ─── FALLA / MOTIVO ───
            if (quotation.customer_complaint) {
                doc.fontSize(7).fillColor(RED).font('Helvetica-Bold');
                doc.text('FALLA / MOTIVO', marginL, y);
                y += 12;
                doc.fontSize(9).fillColor(BLACK).font('Helvetica');
                doc.text(quotation.customer_complaint, marginL, y, { width: contentW });
                y += doc.heightOfString(quotation.customer_complaint, { width: contentW }) + 12;
            }

            // ─── BUILD TABLE DATA ───
            const laborTotal = parseFloat(quotation.labor_total) || 0;
            const partsTotal = parseFloat(quotation.parts_total) || 0;
            const totalAmount = parseFloat(quotation.total_amount) || 0;

            const tableRows = [];

            // Labor items — one row per QuotationLabor
            (quotation.labor || []).forEach(l => {
                const price = parseFloat(l.price) || 0;
                tableRows.push({
                    type: 'Mano de Obra',
                    desc: l.name,
                    cost: `$${price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
                });
            });

            // Parts — one row per QuotationPart, multiplied by qty
            (quotation.parts || []).forEach(p => {
                const price = parseFloat(p.price) || 0;
                const qty = parseInt(p.quantity) || 1;
                const subtotal = price * qty;
                const desc = qty > 1 ? `${p.name} (x${qty})` : p.name;
                tableRows.push({
                    type: 'Refaccion',
                    desc,
                    cost: `$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
                });
            });

            // ─── TABLE ───
            if (tableRows.length > 0) {
                doc.fontSize(10).fillColor(BLACK).font('Helvetica-Bold');
                doc.text('DETALLE DE LA COTIZACIÓN', marginL, y);
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
                doc.text('Sin items cotizados', marginL, y);
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

            tY += 30;

            // ─── VIGENCIA ───
            // The totals box ends at y + 4 + 60 = y + 64. The valid_until line
            // sits underneath it on the left margin so it isn't covered.
            let postY = y + 4 + 60 + 10;
            if (quotation.valid_until) {
                const validDate = new Date(quotation.valid_until).toLocaleDateString('es-MX', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                });
                doc.fontSize(10).fillColor(BLACK).font('Helvetica-Bold');
                doc.text(`Vigente hasta: ${validDate}`, marginL, postY);
                postY += 18;
            }

            // ─── LEGAL NOTE ───
            doc.fontSize(8).fillColor(GRAY).font('Helvetica-Oblique');
            doc.text(
                'Esta cotización es estimada. Los precios pueden variar al momento de la reparación.',
                marginL,
                postY,
                { width: contentW }
            );

            // ─── FOOTER ───
            const footerY = Math.max(postY + 30, 720);
            doc.moveTo(marginL, footerY).lineTo(marginL + contentW, footerY).strokeColor('#E0E0E0').lineWidth(0.3).stroke();
            doc.fontSize(8).fillColor(GRAY).font('Helvetica');
            doc.text(wsFooter, marginL, footerY + 8, { width: contentW, align: 'center' });
            doc.text('Gracias por su preferencia', marginL, footerY + 20, { width: contentW, align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

export default async function quotationPdfRoutes(fastify) {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', resolveWorkspace);

    // POST /api/quotation-pdf/:id/send
    fastify.post('/:id/send', async (request, reply) => {
        const { id } = request.params;

        // Gate against the plan's whatsapp_messages monthly limit (Free = 100).
        // Owner explicitly opted not to track quotations separately yet.
        try {
            await assertWithinLimit(request.workspace.id, 'whatsapp_messages');
        } catch (err) {
            if (err instanceof PlanLimitError) {
                return reply.status(402).send({
                    error: err.message,
                    code: 'PLAN_LIMIT',
                    feature: err.feature,
                    limit: err.limit,
                    used: err.used,
                });
            }
            throw err;
        }

        try {
            const quotation = await prisma.quotation.findUnique({
                where: { id },
                include: { labor: true, parts: true },
            });

            if (!quotation) return reply.code(404).send({ error: 'Cotización no encontrada' });

            const client = await prisma.client.findUnique({ where: { id: quotation.client_id } });
            const motorcycle = quotation.motorcycle_id
                ? await prisma.motorcycle.findUnique({ where: { id: quotation.motorcycle_id } })
                : null;

            if (!client?.phone) return reply.code(400).send({ error: 'El cliente no tiene telefono' });

            // Generate PDF with the caller's workspace branding
            const pdfBuffer = await generatePDF(quotation, client, motorcycle, request.workspace);
            const pdfBase64 = pdfBuffer.toString('base64');
            const filename = `${quotation.quotation_number}.pdf`;

            // WhatsApp caption signed with the workspace's name
            const motoInfo = motorcycle ? `${motorcycle.brand} ${motorcycle.model}` : 'N/A';
            const totalAmt = parseFloat(quotation.total_amount) || 0;
            const wsName = request.workspace?.name || 'MotoPartes';
            const validStr = quotation.valid_until
                ? new Date(quotation.valid_until).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '-';
            const caption = `*COTIZACIÓN ${quotation.quotation_number}*\nMoto: ${motoInfo}\nTotal estimado: $${totalAmt.toLocaleString('es-MX', { minimumFractionDigits: 2 })}\nVigente hasta: ${validStr}\n\n-- ${wsName}`;

            // Quotation has no `approved_by` — use created_by, fallback to caller.
            const mechanicId = quotation.created_by || request.user.id;

            // Send via WhatsApp bot.
            // The bot mounts messagesRouter at "/" (see apps/whatsapp-bot/src/index.js),
            // so the endpoint is /send-document — NOT /api/send-document.
            let botResult;
            fastify.log.info(`[QUOTE-PDF-SEND] Sending to bot at ${BOT_URL}/send-document for mechanicId=${mechanicId}, phone=${client.phone}`);
            try {
                const botResponse = await fetch(`${BOT_URL}/send-document`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': BOT_KEY },
                    body: JSON.stringify({ mechanicId, phone: client.phone, message: caption, base64: pdfBase64, filename, mimetype: 'application/pdf' }),
                    signal: AbortSignal.timeout(30000),
                });

                const botText = await botResponse.text();
                fastify.log.info(`[QUOTE-PDF-SEND] Bot response: ${botResponse.status} ${botText.substring(0, 200)}`);

                try { botResult = JSON.parse(botText); } catch { botResult = { error: botText }; }

                if (!botResponse.ok) {
                    return reply.send({ success: false, fallback: true, error: botResult.error || 'WhatsApp no disponible', botStatus: botResponse.status });
                }
            } catch (botError) {
                // Bot is unreachable (fetch failed, network error, timeout etc.)
                fastify.log.error(`[QUOTE-PDF-SEND] Bot fetch error: ${botError.message} | BOT_URL=${BOT_URL}`);
                return reply.send({ success: false, fallback: true, error: `WhatsApp bot error: ${botError.message}` });
            }

            // Bump the WhatsApp usage counter only on a successful send.
            incrementUsageAsync(request.workspace.id, 'whatsapp_messages', 1);
            return reply.send({ success: true, automated: true, messageId: botResult.messageId });
        } catch (error) {
            fastify.log.error(`Error in send-quotation-pdf: ${error.message}\n${error.stack}`);
            return reply.code(500).send({ error: 'Error al generar/enviar PDF', details: error.message });
        }
    });

    // GET /api/quotation-pdf/:id/download
    fastify.get('/:id/download', async (request, reply) => {
        const { id } = request.params;

        try {
            const quotation = await prisma.quotation.findUnique({
                where: { id },
                include: { labor: true, parts: true },
            });
            if (!quotation) return reply.code(404).send({ error: 'Cotización no encontrada' });

            const client = await prisma.client.findUnique({ where: { id: quotation.client_id } });
            const motorcycle = quotation.motorcycle_id
                ? await prisma.motorcycle.findUnique({ where: { id: quotation.motorcycle_id } })
                : null;

            const pdfBuffer = await generatePDF(quotation, client, motorcycle, request.workspace);
            const filename = `${quotation.quotation_number}.pdf`;

            reply.header('Content-Type', 'application/pdf')
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send(pdfBuffer);
        } catch (error) {
            fastify.log.error(`Error generating quotation PDF: ${error.message}\n${error.stack}`);
            return reply.code(500).send({ error: 'Error al generar PDF', details: error.message });
        }
    });
}
