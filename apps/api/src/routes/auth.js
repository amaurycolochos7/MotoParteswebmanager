import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';

export default async function authRoutes(fastify) {
    // POST /api/auth/login
    fastify.post('/login', async (request, reply) => {
        const { email, password } = request.body;

        if (!email || !password) {
            return reply.status(400).send({ error: 'Email y contraseña requeridos' });
        }

        const user = await prisma.profile.findUnique({ where: { email } });

        if (!user || !user.is_active) {
            return reply.status(401).send({ error: 'Credenciales inválidas' });
        }

        // Check password - support both plain text (legacy) and bcrypt
        let validPassword = false;
        if (user.password_hash) {
            if (user.password_hash.startsWith('$2')) {
                validPassword = await bcrypt.compare(password, user.password_hash);
            } else {
                // Legacy plain text comparison
                validPassword = user.password_hash === password;
                // Upgrade to bcrypt if plain text matches
                if (validPassword) {
                    const hashed = await bcrypt.hash(password, 10);
                    await prisma.profile.update({
                        where: { id: user.id },
                        data: { password_hash: hashed }
                    });
                }
            }
        }

        if (!validPassword) {
            return reply.status(401).send({ error: 'Credenciales inválidas' });
        }

        const token = generateToken(user);
        const { password_hash, ...userData } = user;

        return { user: userData, token };
    });

    // GET /api/auth/profile/:id
    fastify.get('/profile/:id', { preHandler: [authenticate] }, async (request, reply) => {
        const user = await prisma.profile.findUnique({
            where: { id: request.params.id }
        });

        if (!user) {
            return reply.status(404).send({ error: 'Usuario no encontrado' });
        }

        const { password_hash, ...userData } = user;
        return userData;
    });

    // GET /api/auth/users
    fastify.get('/users', { preHandler: [authenticate] }, async (request) => {
        const users = await prisma.profile.findMany({
            orderBy: { created_at: 'desc' }
        });
        return users.map(({ password_hash, ...u }) => u);
    });

    // POST /api/auth/users
    fastify.post('/users', { preHandler: [authenticate] }, async (request, reply) => {
        const data = request.body;

        // Check if email already exists
        const existing = await prisma.profile.findUnique({ where: { email: data.email } });
        if (existing) {
            return reply.status(409).send({ error: 'El email ya está registrado' });
        }

        const password_hash = await bcrypt.hash(data.password || 'motopartes123', 10);

        const user = await prisma.profile.create({
            data: {
                email: data.email,
                password_hash,
                full_name: data.full_name,
                phone: data.phone || null,
                role: data.role || 'mechanic',
                commission_percentage: data.commission_percentage || 10,
                is_master_mechanic: data.is_master_mechanic || false,
                requires_approval: data.requires_approval || false,
                can_create_services: data.can_create_services || false,
                can_create_appointments: data.can_create_appointments !== false,
                can_send_messages: data.can_send_messages !== false,
                can_create_clients: data.can_create_clients !== false,
                can_edit_clients: data.can_edit_clients || false,
                can_delete_orders: data.can_delete_orders || false,
            }
        });

        const { password_hash: _, ...userData } = user;
        return userData;
    });

    // PUT /api/auth/users/:id
    fastify.put('/users/:id', { preHandler: [authenticate] }, async (request) => {
        const { id } = request.params;
        const updates = { ...request.body };

        // Hash password if provided
        if (updates.password) {
            updates.password_hash = await bcrypt.hash(updates.password, 10);
            delete updates.password;
        }
        delete updates.id;
        delete updates.created_at;

        const user = await prisma.profile.update({
            where: { id },
            data: updates
        });

        const { password_hash, ...userData } = user;
        return userData;
    });

    // DELETE /api/auth/users/:id
    fastify.delete('/users/:id', { preHandler: [authenticate] }, async (request) => {
        const { id } = request.params;

        // Soft delete by deactivating
        await prisma.profile.update({
            where: { id },
            data: { is_active: false }
        });

        return { success: true };
    });

    // DELETE /api/auth/users/:id/permanent
    fastify.delete('/users/:id/permanent', { preHandler: [authenticate] }, async (request) => {
        const { id } = request.params;

        // Cascade delete related data
        await prisma.mechanicEarning.deleteMany({ where: { mechanic_id: id } });
        await prisma.orderRequest.deleteMany({ where: { OR: [{ requested_by: id }, { requested_to: id }] } });
        await prisma.paymentRequest.deleteMany({ where: { OR: [{ master_id: id }, { auxiliary_id: id }] } });
        await prisma.whatsappSession.deleteMany({ where: { mechanic_id: id } });

        // Unassign orders
        await prisma.order.updateMany({
            where: { mechanic_id: id },
            data: { mechanic_id: null }
        });

        await prisma.profile.delete({ where: { id } });

        return { success: true };
    });

    // TEMPORARY: Emergency Password Reset
    fastify.get('/reset-emergency', async (request, reply) => {
        const { key } = request.query;
        if (key !== 'motopartes-rescue-2026') {
            return reply.status(403).send({ error: 'Forbidden' });
        }

        const email = 'admin_maestro_motopartes@gmail.com';
        try {
            // Update to plaintext 'admin123'
            const user = await prisma.profile.update({
                where: { email },
                data: { password_hash: 'admin123' }
            });
            return { success: true, message: `Password reset for ${email}`, user };
        } catch (err) {
            return reply.status(500).send({ error: err.message });
        }
    });
}
