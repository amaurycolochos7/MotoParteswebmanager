/**
 * OrderForwarder — Genera folios y reenvía pedidos confirmados al admin
 *
 * Cuando un pedido es confirmado:
 * 1. Genera folio secuencial (BR-F01, BR-F02...)
 * 2. Crea resumen formateado
 * 3. Envía confirmación al cliente
 * 4. Reenvía resumen al número admin configurado
 */

class OrderForwarder {
    constructor(prisma) {
        this.prisma = prisma;
    }

    /**
     * Genera el siguiente folio de orden.
     * Usa transacción atómica para evitar duplicados en concurrencia.
     */
    async generateOrderId() {
        const result = await this.prisma.orderCounter.upsert({
            where: { id: 'default' },
            update: { counter: { increment: 1 } },
            create: { id: 'default', prefix: 'BR-F', counter: 1 },
        });

        const num = String(result.counter).padStart(2, '0');
        return `${result.prefix}${num}`;
    }

    /**
     * Genera el resumen del pedido formateado para WhatsApp.
     */
    formatOrderSummary(orderId, orderData) {
        const lines = [
            `*RESUMEN DE PEDIDO ${orderId}*`,
            '',
        ];

        if (orderData.product) {
            const priceStr = orderData.price ? ` — $${orderData.price}` : '';
            const extrasStr = orderData.extras ? ` (${orderData.extras})` : '';
            lines.push(`1x ${orderData.product}${extrasStr}${priceStr}`);
        }

        if (orderData.delivery === 'envio' && orderData.address) {
            lines.push(`Envio a: ${orderData.address}`);
        } else if (orderData.pickup_location) {
            lines.push(`Recoger en: ${orderData.pickup_location}`);
        }

        if (orderData.name) {
            lines.push(`Nombre: ${orderData.name}`);
        }

        if (orderData.change && orderData.change.toLowerCase() !== 'no') {
            lines.push(`Cambio de: ${orderData.change}`);
        }

        if (orderData.price) {
            lines.push(`Total: $${orderData.price}`);
        }

        return lines.join('\n');
    }

    /**
     * Confirma el pedido: genera folio, envía al cliente, reenvía al admin.
     * @param {WhatsAppSession} session - Sesión activa
     * @param {string} clientPhone - Teléfono del cliente (con @c.us)
     * @param {object} orderData - Datos completos del pedido
     * @param {string} adminPhone - Número del admin para reenviar
     * @returns {{ orderId: string, summary: string }}
     */
    async confirmAndForward(session, clientPhone, orderData, adminPhone) {
        const orderId = await this.generateOrderId();
        const summary = this.formatOrderSummary(orderId, orderData);

        // 1. Enviar confirmación al cliente
        const clientMsg = `${summary}\n\nPedido confirmado, su folio es *${orderId}*. Tiempo estimado: 30-45 min. Gracias por su preferencia!`;
        await session.sendMessage(clientPhone, clientMsg);

        // 2. Reenviar al número admin si está configurado
        if (adminPhone) {
            const contactName = orderData.name || 'Cliente';
            const cleanPhone = clientPhone.replace('@c.us', '');
            const adminMsg = `*NUEVO PEDIDO*\n\nDe: ${contactName} (${cleanPhone})\n\n${summary}`;

            try {
                await session.sendMessage(adminPhone, adminMsg);
                console.log(`[OrderForwarder] Order ${orderId} forwarded to admin ${adminPhone}`);
            } catch (err) {
                console.error(`[OrderForwarder] Failed to forward to admin:`, err.message);
                // No lanzar error — el pedido ya se confirmó al cliente
            }
        } else {
            console.warn(`[OrderForwarder] No admin phone configured, order ${orderId} not forwarded`);
        }

        return { orderId, summary };
    }
}

export default OrderForwarder;
