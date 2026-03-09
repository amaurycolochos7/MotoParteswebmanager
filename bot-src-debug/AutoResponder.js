/**
 * AutoResponder — Motor de auto-respuesta con debounce de 20 segundos
 * 
 * Orquesta el flujo completo:
 * 1. Recibe mensajes entrantes desde WhatsAppSession
 * 2. Acumula mensajes rápidos (debounce 20s desde el último)
 * 3. Evalúa el flujo de conversación
 * 4. Envía respuesta con delay
 * 5. Genera y reenvía pedidos confirmados
 */

import ConversationFlow from './ConversationFlow.js';
import OrderForwarder from './OrderForwarder.js';

class AutoResponder {
    constructor(prisma) {
        this.prisma = prisma;
        this.conversationFlow = new ConversationFlow(prisma);
        this.orderForwarder = new OrderForwarder(prisma);
        this.pendingTimers = new Map();    // phone → timeout ID
        this.messageBuffer = new Map();    // phone → [messages]
    }

    /**
     * Maneja un mensaje entrante. Aplica debounce de 20s.
     * @param {WhatsAppSession} session - Sesión que recibió el mensaje
     * @param {string} sessionId - ID de la sesión en DB
     * @param {object} message - Mensaje de whatsapp-web.js
     */
    async handleIncomingMessage(session, sessionId, message) {
        // Ignorar mensajes propios, de grupos, status broadcasts
        if (message.fromMe) return;
        if (message.from === 'status@broadcast') return;
        if (message.isGroupMsg || message.from?.endsWith('@g.us')) return;

        const phone = message.from;
        const body = message.body?.trim();
        if (!body) return;

        // Verificar que auto_reply está activo para esta sesión
        const sessionConfig = await this.prisma.whatsappSession.findUnique({
            where: { id: sessionId },
            select: { auto_reply: true, admin_phone: true },
        });
        if (!sessionConfig?.auto_reply) return;

        console.log(`[AutoResponder] Message from ${phone}: "${body.substring(0, 50)}..."`);

        // Acumular mensajes en buffer (para debounce)
        if (!this.messageBuffer.has(phone)) {
            this.messageBuffer.set(phone, []);
        }
        this.messageBuffer.get(phone).push(body);

        // Cancelar timer anterior (debounce)
        if (this.pendingTimers.has(phone)) {
            clearTimeout(this.pendingTimers.get(phone));
        }

        // Nuevo timer: 20 segundos desde el ÚLTIMO mensaje
        const timer = setTimeout(async () => {
            try {
                await this._processBufferedMessages(session, sessionId, phone, message);
            } catch (err) {
                console.error(`[AutoResponder] Error processing message:`, err.message);
            }
        }, 20000);

        this.pendingTimers.set(phone, timer);
    }

    /**
     * Procesa todos los mensajes acumulados de un contacto.
     */
    async _processBufferedMessages(session, sessionId, phone, originalMessage) {
        const messages = this.messageBuffer.get(phone) || [];
        this.messageBuffer.delete(phone);
        this.pendingTimers.delete(phone);

        if (messages.length === 0) return;

        // Combinar todos los mensajes en uno
        const combinedBody = messages.join(' ');
        const contactName = originalMessage._data?.notifyName || originalMessage.author || null;

        // Obtener o crear conversación
        const conversation = await this._getOrCreateConversation(sessionId, phone, contactName);

        // Guardar mensajes entrantes en DB
        for (const msg of messages) {
            await this.prisma.message.create({
                data: {
                    conversation_id: conversation.id,
                    direction: 'in',
                    body: msg,
                    was_auto_reply: false,
                },
            });
        }

        // Evaluar flujo de conversación
        const orderData = conversation.order_data || {};
        const flowResult = await this.conversationFlow.evaluate(
            sessionId,
            conversation.current_state,
            combinedBody,
            orderData
        );

        if (!flowResult) return;

        // Actualizar order_data si hay datos nuevos
        let updatedOrderData = { ...orderData };
        if (flowResult.orderUpdate) {
            updatedOrderData = { ...updatedOrderData, ...flowResult.orderUpdate };
        }

        let responseText = flowResult.response;

        // Generar resumen de pedido si es necesario
        if (flowResult.generateSummary) {
            const orderId = await this.orderForwarder.generateOrderId();
            updatedOrderData.orderId = orderId;
            const summary = this.orderForwarder.formatOrderSummary(orderId, updatedOrderData);
            responseText = `${summary}\n\nTodo correcto? Confirme con *Si* para procesar su pedido`;
        }

        // Confirmar y reenviar pedido al admin
        if (flowResult.confirmOrder) {
            const sessionConfig = await this.prisma.whatsappSession.findUnique({
                where: { id: sessionId },
                select: { admin_phone: true },
            });

            const result = await this.orderForwarder.confirmAndForward(
                session,
                phone,
                updatedOrderData,
                sessionConfig?.admin_phone
            );

            // Guardar mensaje de confirmación
            await this.prisma.message.create({
                data: {
                    conversation_id: conversation.id,
                    direction: 'out',
                    body: `Pedido confirmado: ${result.orderId}`,
                    was_auto_reply: true,
                },
            });

            // Reset conversación para nuevo pedido
            await this.prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    current_state: 'idle',
                    order_data: {},
                    last_message_at: new Date(),
                },
            });

            return;
        }

        // Enviar respuesta al cliente
        if (responseText) {
            try {
                await session.sendMessage(phone, responseText);
                console.log(`[AutoResponder] Replied to ${phone}: "${responseText.substring(0, 60)}..."`);

                // Guardar respuesta en DB
                await this.prisma.message.create({
                    data: {
                        conversation_id: conversation.id,
                        direction: 'out',
                        body: responseText,
                        was_auto_reply: true,
                    },
                });
            } catch (err) {
                console.error(`[AutoResponder] Failed to send reply:`, err.message);
            }
        }

        // Actualizar estado de la conversación
        await this.prisma.conversation.update({
            where: { id: conversation.id },
            data: {
                current_state: flowResult.nextState,
                order_data: updatedOrderData,
                last_message_at: new Date(),
            },
        });
    }

    /**
     * Obtiene o crea la conversación con un contacto.
     */
    async _getOrCreateConversation(sessionId, phone, contactName) {
        const cleanPhone = phone.replace('@c.us', '');

        let conversation = await this.prisma.conversation.findUnique({
            where: {
                session_id_contact_phone: {
                    session_id: sessionId,
                    contact_phone: cleanPhone,
                },
            },
        });

        if (!conversation) {
            conversation = await this.prisma.conversation.create({
                data: {
                    session_id: sessionId,
                    contact_phone: cleanPhone,
                    contact_name: contactName,
                    current_state: 'idle',
                    order_data: {},
                },
            });
        } else if (contactName && contactName !== conversation.contact_name) {
            // Actualizar nombre si cambió
            await this.prisma.conversation.update({
                where: { id: conversation.id },
                data: { contact_name: contactName },
            });
            conversation.contact_name = contactName;
        }

        return conversation;
    }

    /** Invalidar cache de flujos cuando se editan desde admin */
    invalidateFlowCache() {
        this.conversationFlow.invalidateCache();
    }

    /** Limpiar todos los timers pendientes */
    destroy() {
        for (const timer of this.pendingTimers.values()) {
            clearTimeout(timer);
        }
        this.pendingTimers.clear();
        this.messageBuffer.clear();
    }
}

export default AutoResponder;
