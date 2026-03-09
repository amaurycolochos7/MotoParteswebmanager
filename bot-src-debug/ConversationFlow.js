/**
 * ConversationFlow — Máquina de estados para conversaciones
 * 
 * Evalúa el mensaje del cliente contra los flujos configurados en DB (FlowStep)
 * y determina la respuesta + siguiente estado.
 * 
 * Para estados de recolección de datos (dirección, nombre, cambio),
 * acepta cualquier texto y lo guarda en order_data.
 */

class ConversationFlow {
    constructor(prisma) {
        this.prisma = prisma;
        this._flowCache = null;
        this._cacheTime = 0;
    }

    /**
     * Evalúa un mensaje entrante y retorna la respuesta apropiada.
     * @param {string} sessionId - ID de la sesión
     * @param {string} currentState - Estado actual de la conversación
     * @param {string} messageBody - Texto del mensaje del cliente
     * @param {object} orderData - Datos parciales del pedido acumulados
     * @returns {{ response: string, nextState: string, delayMs: number, orderUpdate: object|null } | null}
     */
    async evaluate(sessionId, currentState, messageBody, orderData = {}) {
        const normalized = this._normalize(messageBody);

        // Estados de captura de datos — aceptan cualquier texto
        const captureResult = this._handleDataCapture(currentState, messageBody, orderData);
        if (captureResult) return captureResult;

        // Buscar flujos configurados en DB
        const steps = await this._getFlowSteps(sessionId);

        // Filtrar por estado actual + evaluar keywords
        // Prioridad: session-specific > global, mayor priority primero
        const applicableSteps = steps
            .filter(s => s.state === currentState || s.state === '*')
            .sort((a, b) => {
                if (a.session_id && !b.session_id) return -1;
                if (!a.session_id && b.session_id) return 1;
                return b.priority - a.priority;
            });

        for (const step of applicableSteps) {
            const matches = step.keywords.some(kw =>
                normalized.includes(this._normalize(kw))
            );
            if (matches) {
                return {
                    response: this._interpolate(step.response, orderData),
                    nextState: step.next_state,
                    delayMs: step.delay_ms,
                    orderUpdate: null,
                };
            }
        }

        // Fallback genérico si no hay match
        return this._getFallback(currentState);
    }

    /**
     * Maneja estados donde el bot está capturando datos del pedido.
     * En estos estados, CUALQUIER texto del cliente se interpreta como dato.
     */
    _handleDataCapture(currentState, messageBody, orderData) {
        switch (currentState) {
            case 'ask_address':
                return {
                    response: 'Perfecto, a nombre de quien sera el pedido?',
                    nextState: 'ask_name',
                    delayMs: 20000,
                    orderUpdate: { address: messageBody.trim(), delivery: 'envio' },
                };

            case 'ask_name':
                return {
                    response: 'Va a necesitar cambio? Si es asi, de cuanto?',
                    nextState: 'ask_change',
                    delayMs: 20000,
                    orderUpdate: { name: messageBody.trim() },
                };

            case 'ask_change':
                return {
                    response: null, // Se genera dinámicamente con el resumen
                    nextState: 'order_summary',
                    delayMs: 20000,
                    orderUpdate: { change: messageBody.trim() },
                    generateSummary: true,
                };

            case 'order_summary': {
                const confirmed = this._normalize(messageBody);
                if (['si', 'sí', 'confirmo', 'correcto', 'ok', 'dale', 'va'].some(w => confirmed.includes(w))) {
                    return {
                        response: null, // Se genera dinámicamente con confirmación
                        nextState: 'order_confirmed',
                        delayMs: 20000,
                        orderUpdate: { confirmed: true },
                        confirmOrder: true,
                    };
                } else {
                    return {
                        response: 'Entendido, quieres modificar algo del pedido? Dime que cambiar o escribe "cancelar" para empezar de nuevo.',
                        nextState: 'order_summary',
                        delayMs: 20000,
                        orderUpdate: null,
                    };
                }
            }

            default:
                return null;
        }
    }

    _getFallback(currentState) {
        if (currentState === 'idle') {
            return {
                response: 'Hola, en que le podemos ayudar?',
                nextState: 'greeting',
                delayMs: 20000,
                orderUpdate: null,
            };
        }
        // Si está en medio de un flujo y no entendemos, pedir clarificación
        return {
            response: 'Disculpa, no entendi bien. Puedes repetirlo?',
            nextState: currentState,
            delayMs: 20000,
            orderUpdate: null,
        };
    }

    _normalize(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    _interpolate(template, orderData) {
        return template
            .replace(/\{product\}/g, orderData.product || '')
            .replace(/\{price\}/g, orderData.price || '')
            .replace(/\{name\}/g, orderData.name || '')
            .replace(/\{address\}/g, orderData.address || '')
            .replace(/\{orderId\}/g, orderData.orderId || '');
    }

    /**
     * Cache de FlowSteps — se refresca cada 60 segundos
     */
    async _getFlowSteps(sessionId) {
        const now = Date.now();
        if (this._flowCache && now - this._cacheTime < 60000) {
            return this._flowCache;
        }

        this._flowCache = await this.prisma.flowStep.findMany({
            where: {
                is_active: true,
                OR: [{ session_id: sessionId }, { session_id: null }],
            },
        });
        this._cacheTime = now;
        return this._flowCache;
    }

    /** Invalida el cache cuando se editan flujos desde el admin */
    invalidateCache() {
        this._flowCache = null;
        this._cacheTime = 0;
    }
}

export default ConversationFlow;
