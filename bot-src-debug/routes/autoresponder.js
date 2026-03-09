import { Router } from 'express';

export default function autoresponderRouter(sessionManager, prisma) {
    const router = Router();

    // Listar todos los flujos
    router.get('/flows', async (req, res) => {
        try {
            const { session_id } = req.query;
            const where = {};
            if (session_id) {
                where.OR = [{ session_id }, { session_id: null }];
            }
            const flows = await prisma.flowStep.findMany({
                where,
                orderBy: [{ state: 'asc' }, { priority: 'desc' }],
            });
            res.json(flows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Crear nuevo flujo
    router.post('/flows', async (req, res) => {
        try {
            const { session_id, state, keywords, response, next_state, delay_ms, priority } = req.body;
            const flow = await prisma.flowStep.create({
                data: {
                    session_id: session_id || null,
                    state: state || 'idle',
                    keywords: keywords || [],
                    response: response || '',
                    next_state: next_state || 'idle',
                    delay_ms: delay_ms || 20000,
                    priority: priority || 0,
                },
            });
            sessionManager.autoResponder.invalidateFlowCache();
            res.json(flow);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Editar flujo
    router.put('/flows/:id', async (req, res) => {
        try {
            const { state, keywords, response, next_state, delay_ms, priority, is_active } = req.body;
            const data = {};
            if (state !== undefined) data.state = state;
            if (keywords !== undefined) data.keywords = keywords;
            if (response !== undefined) data.response = response;
            if (next_state !== undefined) data.next_state = next_state;
            if (delay_ms !== undefined) data.delay_ms = delay_ms;
            if (priority !== undefined) data.priority = priority;
            if (is_active !== undefined) data.is_active = is_active;

            const flow = await prisma.flowStep.update({
                where: { id: req.params.id },
                data,
            });
            sessionManager.autoResponder.invalidateFlowCache();
            res.json(flow);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Eliminar flujo
    router.delete('/flows/:id', async (req, res) => {
        try {
            await prisma.flowStep.delete({ where: { id: req.params.id } });
            sessionManager.autoResponder.invalidateFlowCache();
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- Conversaciones y Mensajes ---

    // Listar conversaciones
    router.get('/conversations', async (req, res) => {
        try {
            const { session_id } = req.query;
            const where = session_id ? { session_id } : {};
            const conversations = await prisma.conversation.findMany({
                where,
                orderBy: { last_message_at: 'desc' },
                take: 50,
                include: {
                    _count: { select: { messages: true } },
                },
            });
            res.json(conversations);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Mensajes de una conversación
    router.get('/conversations/:id/messages', async (req, res) => {
        try {
            const messages = await prisma.message.findMany({
                where: { conversation_id: req.params.id },
                orderBy: { timestamp: 'asc' },
                take: 200,
            });
            res.json(messages);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
