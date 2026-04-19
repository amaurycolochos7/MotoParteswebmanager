import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth.js';
import { authenticate } from '../middleware/auth.js';

export default async function authRoutes(fastify) {
    // POST /api/auth/register — public self-signup.
    //
    // Until Phase 3 (multi-tenancy) ships, there is no per-workspace data
    // isolation. Letting a self-registered user log in would expose the
    // existing workshop's data, so every new account is created with
    // is_active=false and signup_source='self'. The /login handler above
    // gives these users a distinct "pending activation" message.
    //
    // When Phase 3 lands, the activation flow will: create a Workspace,
    // assign a Membership(role=owner) to this Profile, flip is_active=true,
    // and email the user their activation confirmation.
    fastify.post('/register', async (request, reply) => {
        try {
            const { email, password, full_name, workshop_name, phone, business_type } = request.body || {};

            if (!email || !password || !full_name || !workshop_name) {
                return reply.status(400).send({ error: 'Correo, contraseña, nombre y nombre del taller son obligatorios.' });
            }
            if (String(password).length < 8) {
                return reply.status(400).send({ error: 'La contraseña debe tener al menos 8 caracteres.' });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
                return reply.status(400).send({ error: 'Correo inválido.' });
            }

            const normalizedEmail = String(email).trim().toLowerCase();
            const existing = await prisma.profile.findUnique({ where: { email: normalizedEmail } });
            if (existing) {
                return reply.status(409).send({ error: 'Ya existe una cuenta con ese correo.' });
            }

            const password_hash = await bcrypt.hash(password, 10);

            const user = await prisma.profile.create({
                data: {
                    email: normalizedEmail,
                    password_hash,
                    full_name: String(full_name).trim(),
                    phone: phone ? String(phone).trim() : null,
                    role: 'admin', // will own their own workspace once Phase 3 activates them
                    is_active: false, // blocked until multi-tenancy is in place
                    workshop_name: String(workshop_name).trim(),
                    business_type: business_type || 'motorcycle',
                    signup_source: 'self',
                },
            });

            console.log(`[REGISTER] New self-signup — email=${user.email} workshop=${user.workshop_name}`);
            return reply.send({
                success: true,
                message: '¡Gracias por registrarte! Revisaremos tu taller y activaremos tu cuenta pronto. Te avisaremos por correo.',
            });
        } catch (error) {
            console.error('[REGISTER_ERROR]', error);
            return reply.status(500).send({ error: 'No pudimos completar el registro. Intenta de nuevo más tarde.' });
        }
    });

    // POST /api/auth/login
    fastify.post('/login', async (request, reply) => {
        try {
            const { email, password } = request.body;

            console.log(`[LOGIN_DEBUG] Attempting login for: ${email}`); // Log attempt

            if (!email || !password) {
                return reply.status(400).send({ error: 'Email y contraseña requeridos' });
            }

            const user = await prisma.profile.findUnique({ where: { email } });

            if (!user) {
                console.log(`[LOGIN_DEBUG] User not found: ${email}`);
                return reply.status(401).send({ error: 'Credenciales inválidas' });
            }

            if (!user.is_active) {
                console.log(`[LOGIN_DEBUG] User inactive: ${email} source=${user.signup_source}`);
                // Self-registered users that have not been activated yet get a
                // distinct message so they know to expect an activation step,
                // separate from users that an admin has deactivated.
                if (user.signup_source === 'self') {
                    return reply.status(401).send({ error: 'Tu cuenta está pendiente de activación. Te contactaremos por correo cuando tu taller esté listo.' });
                }
                return reply.status(401).send({ error: 'Tu cuenta ha sido desactivada por el administrador.' });
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
                console.log(`[LOGIN_DEBUG] Invalid password for: ${email}`);
                return reply.status(401).send({ error: 'Credenciales inválidas' });
            }

            const token = generateToken(user);
            const { password_hash, ...userData } = user;

            console.log(`[LOGIN_DEBUG] Login success for: ${email}`);
            return { user: userData, token };
        } catch (error) {
            console.error('[LOGIN_CRITICAL_ERROR]', error);
            return reply.status(500).send({ error: 'Error interno del servidor', details: error.message });
        }
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
}

