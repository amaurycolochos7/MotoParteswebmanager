import prisma, { workspaceContext } from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { generateToken, authenticate } from '../middleware/auth.js';
import { resolveWorkspace } from '../middleware/workspace.js';
import { loadActor, normalizeRole, isAdminRole } from '../lib/permissions.js';
import { auxCommissionCap, validateAuxRate, editableFieldsFor, pickFields, ADMIN_EDITABLE } from '../lib/team-rules.js';
import { seedDefaultsForWorkspace } from '../../prisma/seed-automation-defaults.js';

// Run a callback WITHOUT any workspace scoping — used for queries that span
// tenants (creating workspaces, listing memberships, authenticating).
function unscoped(fn) {
    return workspaceContext.run({ workspaceId: null }, fn);
}

const DEFAULT_STATUSES = [
    { name: 'Recibida',       color: '#94a3b8', display_order: 10, is_terminal: false },
    { name: 'Diagnóstico',    color: '#3b82f6', display_order: 20, is_terminal: false },
    { name: 'Cotización',     color: '#f59e0b', display_order: 30, is_terminal: false },
    { name: 'En proceso',     color: '#8b5cf6', display_order: 40, is_terminal: false },
    { name: 'Lista',          color: '#10b981', display_order: 50, is_terminal: false },
    { name: 'Entregada',      color: '#22c55e', display_order: 60, is_terminal: true  },
    { name: 'Cancelada',      color: '#ef4444', display_order: 70, is_terminal: true  },
];

const DEFAULT_SERVICES = [
    { name: 'Cambio de aceite',          base_price: 350,  category: 'mantenimiento' },
    { name: 'Afinación mayor',           base_price: 1200, category: 'mantenimiento' },
    { name: 'Afinación menor',           base_price: 600,  category: 'mantenimiento' },
    { name: 'Ajuste de frenos',          base_price: 400,  category: 'frenos' },
    { name: 'Cambio de balatas',         base_price: 550,  category: 'frenos' },
    { name: 'Cambio de cadena',          base_price: 800,  category: 'transmisión' },
    { name: 'Cambio de llantas',         base_price: 300,  category: 'llantas' },
    { name: 'Balanceo',                  base_price: 250,  category: 'llantas' },
    { name: 'Diagnóstico eléctrico',     base_price: 450,  category: 'eléctrico' },
    { name: 'Lavado y engrase',          base_price: 200,  category: 'limpieza' },
    { name: 'Revisión general',          base_price: 500,  category: 'revisión' },
];

function slugify(name) {
    return String(name)
        .toLowerCase()
        .trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40) || 'taller';
}

function folioPrefixFromName(name) {
    const cleaned = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleaned.length >= 2) return cleaned.slice(0, 2);
    return 'TM';
}

// Ensure a unique slug by appending -2, -3 if needed.
async function pickUniqueSlug(baseSlug) {
    return unscoped(async () => {
        let candidate = baseSlug;
        let i = 1;
        // Cap at 50 attempts to avoid pathological loops.
        while (i < 50) {
            const hit = await prisma.workspace.findUnique({ where: { slug: candidate } });
            if (!hit) return candidate;
            i += 1;
            candidate = `${baseSlug}-${i}`;
        }
        return `${baseSlug}-${Date.now()}`;
    });
}

async function buildLoginResponse(user) {
    const memberships = await unscoped(() =>
        prisma.membership.findMany({
            where: { profile_id: user.id },
            include: {
                workspace: {
                    select: {
                        id: true,
                        slug: true,
                        name: true,
                        folio_prefix: true,
                        branding: true,
                        is_flagship: true,
                        onboarding_completed: true,
                        subscription_status: true,
                        plan: { select: { code: true, name: true, features: true } },
                    },
                },
            },
            orderBy: { joined_at: 'asc' },
        })
    );

    // Flatten for the JWT (keep it small): just the ids + roles.
    const jwtMemberships = memberships.map((m) => ({
        workspace_id: m.workspace_id,
        role: m.role,
    }));
    const defaultWorkspaceId = jwtMemberships.length === 1 ? jwtMemberships[0].workspace_id : null;

    const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        memberships: jwtMemberships,
        workspace_id: defaultWorkspaceId,
    });

    const { password_hash, ...userData } = user;
    return {
        user: userData,
        memberships: memberships.map((m) => ({
            workspace: m.workspace,
            role: m.role,
            permissions: m.permissions,
        })),
        token,
    };
}

export default async function authRoutes(fastify) {
    // POST /api/auth/register — public self-signup. Creates an account, a
    // personal workspace, an owner-role membership, and a trial subscription.
    // Unlike the Phase 1 placeholder, the user is ACTIVATED immediately —
    // multi-tenant isolation guarantees they can't see anyone else's data.
    fastify.post('/register', {
        config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    }, async (request, reply) => {
        try {
            const { email, password, full_name, workshop_name, phone, business_type, referral_slug } = request.body || {};

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
            const trimmedWorkshop = String(workshop_name).trim();

            const existing = await unscoped(() =>
                prisma.profile.findUnique({ where: { email: normalizedEmail } })
            );
            if (existing) {
                return reply.status(409).send({ error: 'Ya existe una cuenta con ese correo.' });
            }

            const password_hash = await bcrypt.hash(password, 10);
            const baseSlug = slugify(trimmedWorkshop);
            const slug = await pickUniqueSlug(baseSlug);

            // Fase 6.2 — resolver referral_slug (prioridad) o legacy slug del workspace.
            // Crea una fila Referral en la misma transacción si hay referente válido.
            // Nunca bloqueamos el registro si el slug es inválido o inexistente.
            let resolvedReferrer = null; // { id, is_partner, name }
            let sanitizedReferralSlug = null;
            if (referral_slug && typeof referral_slug === 'string') {
                const normalized = referral_slug.trim().toLowerCase();
                if (/^[a-z0-9][a-z0-9-]{1,39}$/.test(normalized)) {
                    sanitizedReferralSlug = normalized;
                    // Buscar por referral_slug primero; si no, por slug de workspace.
                    resolvedReferrer = await unscoped(() =>
                        prisma.workspace.findFirst({
                            where: {
                                OR: [
                                    { referral_slug: normalized },
                                    { slug: normalized },
                                ],
                            },
                            select: { id: true, is_partner: true, name: true },
                        })
                    );
                    if (resolvedReferrer) {
                        console.log(`[REGISTER] Referral attribution: slug=${normalized} → workspace_id=${resolvedReferrer.id} partner=${resolvedReferrer.is_partner}`);
                    } else {
                        console.log(`[REGISTER] Referral slug "${normalized}" no existe — guardo solo el slug.`);
                    }
                }
            }
            const referralRate = resolvedReferrer?.is_partner ? 0.300 : 0.200;
            const referralLifetime = !!resolvedReferrer?.is_partner;
            const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

            // During the 7-day trial, the workspace runs on the Pro plan so
            // all Pro features (unlimited orders, 3 WA sessions, branding) are
            // unlocked. If no paid Stripe subscription is created by the time
            // trial_ends_at passes, the billing sweep downgrades to Free.
            const [proPlan, freePlan] = await unscoped(() =>
                Promise.all([
                    prisma.plan.findUnique({ where: { code: 'pro' } }),
                    prisma.plan.findUnique({ where: { code: 'free' } }),
                ])
            );
            const trialPlan = proPlan || freePlan;

            // Transaction: Profile + Workspace + Membership + Subscription all
            // or nothing. We stay unscoped so Prisma's auto-scope doesn't try
            // to filter these writes.
            const result = await unscoped(() =>
                prisma.$transaction(async (tx) => {
                    const newUser = await tx.profile.create({
                        data: {
                            email: normalizedEmail,
                            password_hash,
                            full_name: String(full_name).trim(),
                            phone: phone ? String(phone).trim() : null,
                            role: 'admin', // legacy global role; the Membership(owner) is what matters now
                            is_active: true,
                            workshop_name: trimmedWorkshop,
                            business_type: business_type || 'motorcycle',
                            signup_source: 'self',
                        },
                    });

                    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                    const workspace = await tx.workspace.create({
                        data: {
                            slug,
                            name: trimmedWorkshop,
                            business_type: business_type || 'motorcycle',
                            folio_prefix: folioPrefixFromName(trimmedWorkshop),
                            plan_id: trialPlan?.id || null,
                            trial_ends_at: trialEnd,
                            subscription_status: 'trialing',
                            is_active: true,
                            onboarding_completed: false,
                            branding: {
                                primary_color: '#ef4444',
                                secondary_color: '#1e293b',
                                tagline: '',
                            },
                            settings: sanitizedReferralSlug
                                ? {
                                      referral_source: {
                                          slug: sanitizedReferralSlug,
                                          referrer_workspace_id: resolvedReferrer?.id || null,
                                          captured_at: new Date().toISOString(),
                                      },
                                  }
                                : {},
                            // Cada nuevo workspace obtiene su propio referral_slug
                            // = slug (para que pueda referir a otros desde el día 1).
                            referral_slug: slug,
                            referred_by_workspace_id: resolvedReferrer?.id || null,
                            created_by: newUser.id,
                        },
                    });

                    // Si hay referente válido, crear la fila Referral.
                    if (resolvedReferrer) {
                        await tx.referral.create({
                            data: {
                                referrer_workspace_id: resolvedReferrer.id,
                                referred_workspace_id: workspace.id,
                                referral_slug: sanitizedReferralSlug,
                                commission_rate: referralRate,
                                is_lifetime: referralLifetime,
                                ends_at: referralLifetime ? null : new Date(Date.now() + TWELVE_MONTHS_MS),
                                status: 'active',
                            },
                        });
                    }

                    await tx.membership.create({
                        data: {
                            workspace_id: workspace.id,
                            profile_id: newUser.id,
                            role: 'owner',
                        },
                    });

                    if (trialPlan) {
                        await tx.subscription.create({
                            data: {
                                workspace_id: workspace.id,
                                plan_id: trialPlan.id,
                                status: 'trialing',
                                current_period_end: trialEnd,
                            },
                        });
                    }

                    // Seed default order statuses so the first order works.
                    await tx.orderStatus.createMany({
                        data: DEFAULT_STATUSES.map((s) => ({ ...s, workspace_id: workspace.id })),
                    });

                    // Seed the services catalog so the wizard can offer them.
                    await tx.service.createMany({
                        data: DEFAULT_SERVICES.map((s) => ({
                            ...s,
                            workspace_id: workspace.id,
                        })),
                    });

                    await tx.auditLog.create({
                        data: {
                            workspace_id: workspace.id,
                            profile_id: newUser.id,
                            event: 'workspace.created',
                            payload: {
                                via: 'self-signup',
                                slug,
                                workshop_name: trimmedWorkshop,
                                referral_slug: sanitizedReferralSlug,
                                referrer_workspace_id: resolvedReferrer?.id || null,
                                referral_rate: resolvedReferrer ? referralRate : null,
                                referral_lifetime: resolvedReferrer ? referralLifetime : null,
                            },
                        },
                    });

                    // Seed the 7 default automations + templates (disabled).
                    await seedDefaultsForWorkspace(tx, workspace.id);

                    return { newUser, workspace };
                })
            );

            console.log(`[REGISTER] New self-signup — email=${result.newUser.email} slug=${result.workspace.slug}`);

            // Auto-login: return a JWT so the frontend can go straight to the
            // onboarding wizard.
            const loginPayload = await buildLoginResponse(result.newUser);
            return reply.send({
                success: true,
                message: `¡Bienvenido a MotoPartes! Tu taller "${result.workspace.name}" está listo. Tienes 7 días gratis en el plan Pro.`,
                ...loginPayload,
            });
        } catch (error) {
            console.error('[REGISTER_ERROR]', error);
            return reply.status(500).send({ error: 'No pudimos completar el registro. Intenta de nuevo más tarde.' });
        }
    });

    // POST /api/auth/change-password — cambio de password del usuario autenticado.
    // Requiere pasar el current_password para validar. Rehashea con bcrypt cost 10.
    fastify.post('/change-password', { preHandler: [authenticate] }, async (request, reply) => {
        const { current_password, new_password } = request.body || {};
        if (!current_password || !new_password) {
            return reply.status(400).send({ error: 'current_password y new_password son requeridos.' });
        }
        if (String(new_password).length < 8) {
            return reply.status(400).send({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
        }
        const profile = await unscoped(() =>
            prisma.profile.findUnique({
                where: { id: request.user.id },
                select: { id: true, email: true, password_hash: true },
            })
        );
        if (!profile || !profile.password_hash) {
            return reply.status(400).send({ error: 'Perfil sin password configurado.' });
        }
        const ok = await bcrypt.compare(current_password, profile.password_hash);
        if (!ok) {
            return reply.status(401).send({ error: 'Contraseña actual incorrecta.' });
        }
        const newHash = await bcrypt.hash(new_password, 10);
        await unscoped(() =>
            prisma.profile.update({
                where: { id: profile.id },
                data: { password_hash: newHash },
            })
        );
        await unscoped(() =>
            prisma.auditLog.create({
                data: {
                    profile_id: profile.id,
                    event: 'password.changed',
                    payload: { ip: request.ip, ua: request.headers['user-agent'] || null },
                },
            })
        );
        return reply.send({ success: true, message: 'Contraseña actualizada.' });
    });

    // POST /api/auth/login — rate limit agresivo contra fuerza bruta
    fastify.post('/login', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { email, password } = request.body;

            console.log(`[LOGIN_DEBUG] Attempting login for: ${email}`);

            if (!email || !password) {
                return reply.status(400).send({ error: 'Email y contraseña requeridos' });
            }

            const normalizedEmail = String(email).trim().toLowerCase();
            const user = await unscoped(() =>
                prisma.profile.findUnique({ where: { email: normalizedEmail } })
            );

            if (!user) {
                console.log(`[LOGIN_DEBUG] User not found: ${email}`);
                return reply.status(401).send({ error: 'Credenciales inválidas' });
            }

            if (!user.is_active) {
                console.log(`[LOGIN_DEBUG] User inactive: ${email} source=${user.signup_source}`);
                if (user.signup_source === 'self') {
                    return reply.status(401).send({ error: 'Tu cuenta está pendiente de activación. Te contactaremos por correo cuando tu taller esté listo.' });
                }
                return reply.status(401).send({ error: 'Tu cuenta ha sido desactivada por el administrador.' });
            }

            // Password check with legacy plain-text upgrade path.
            let validPassword = false;
            if (user.password_hash) {
                if (user.password_hash.startsWith('$2')) {
                    validPassword = await bcrypt.compare(password, user.password_hash);
                } else {
                    validPassword = user.password_hash === password;
                    if (validPassword) {
                        const hashed = await bcrypt.hash(password, 10);
                        await unscoped(() =>
                            prisma.profile.update({
                                where: { id: user.id },
                                data: { password_hash: hashed },
                            })
                        );
                    }
                }
            }

            if (!validPassword) {
                console.log(`[LOGIN_DEBUG] Invalid password for: ${email}`);
                return reply.status(401).send({ error: 'Credenciales inválidas' });
            }

            console.log(`[LOGIN_DEBUG] Login success for: ${email}`);
            const payload = await buildLoginResponse(user);
            return payload;
        } catch (error) {
            console.error('[LOGIN_CRITICAL_ERROR]', error);
            return reply.status(500).send({ error: 'Error interno del servidor', details: error.message });
        }
    });

    // GET /api/auth/profile/:id
    // Returns the profile + the caller's memberships so the SPA can rebuild
    // its workspace context on a hard refresh. Without memberships the
    // workspaceRole stays null in AuthContext and ProtectedRoute('admin')
    // bounces the user even though they are owner of their workspace.
    fastify.get('/profile/:id', { preHandler: [authenticate] }, async (request, reply) => {
        const user = await unscoped(() =>
            prisma.profile.findUnique({ where: { id: request.params.id } })
        );
        if (!user) {
            return reply.status(404).send({ error: 'Usuario no encontrado' });
        }
        // V2: antes cualquier sesión podía leer el perfil de cualquier id (otros talleres incluidos).
        if (user.id !== request.user.id && request.user.is_super_admin !== true) {
            const mine = await unscoped(() => prisma.membership.findMany({
                where: { profile_id: request.user.id }, select: { workspace_id: true },
            }));
            const shared = mine.length > 0 && await unscoped(() => prisma.membership.findFirst({
                where: { profile_id: user.id, workspace_id: { in: mine.map((m) => m.workspace_id) } },
                select: { id: true },
            }));
            if (!shared) return reply.status(404).send({ error: 'Usuario no encontrado' });
        }
        const memberships = await unscoped(() =>
            prisma.membership.findMany({
                where: { profile_id: user.id },
                include: { workspace: true },
                orderBy: { joined_at: 'asc' },
            })
        );
        const { password_hash, super_2fa_secret, ...userData } = user;
        return { ...userData, memberships };
    });

    // GET /api/auth/users — list profiles with a membership in the caller's
    // workspace. Requires the caller to have an active workspace context.
    fastify.get('/users', { preHandler: [authenticate, resolveWorkspace] }, async (request) => {
        const actor = await loadActor(request);
        const privileged = isAdminRole(actor.role) || actor.role === 'maestro';
        const memberships = await unscoped(() =>
            prisma.membership.findMany({
                where: { workspace_id: request.workspace.id },
                include: { profile: true },
                orderBy: { joined_at: 'asc' },
            })
        );
        return memberships.map(({ profile, role, permissions, online_booking_visible }) => {
            const { password_hash, super_2fa_secret, super_2fa_enabled, super_admin_added_at, super_admin_added_by, ...safe } = profile;
            let rest = safe;
            if (!privileged && profile.id !== actor.id) {
                const { email, phone, commission_percentage, can_create_services, can_edit_clients, can_delete_orders, ...minimal } = safe;
                rest = minimal;
            }
            return {
                ...rest,
                workspace_role: role,
                workspace_permissions: permissions,
                // Aparece en la lista "quien te atiende" de la landing (citas en linea).
                online_booking_visible,
            };
        });
    });

    // PATCH /api/auth/users/:id/online-booking { visible: boolean }
    // Interruptor "Aparecer en citas en línea" (Membership del taller activo).
    // Solo dueño / admin del taller.
    fastify.patch('/users/:id/online-booking', { preHandler: [authenticate, resolveWorkspace] }, async (request, reply) => {
        const allowed = ['owner', 'admin'].includes(request.workspaceRole) || request.user?.role === 'admin';
        if (!allowed) {
            return reply.status(403).send({ error: 'Solo el dueño o el administrador puede cambiar esto.' });
        }
        const visible = request.body?.visible;
        if (typeof visible !== 'boolean') {
            return reply.status(400).send({ error: 'visible debe ser true o false.' });
        }
        const membership = await unscoped(() =>
            prisma.membership.findUnique({
                where: { workspace_id_profile_id: { workspace_id: request.workspace.id, profile_id: request.params.id } },
            })
        );
        if (!membership) return reply.status(404).send({ error: 'Usuario no encontrado en este taller.' });
        const updated = await unscoped(() =>
            prisma.membership.update({ where: { id: membership.id }, data: { online_booking_visible: visible } })
        );
        return { id: request.params.id, online_booking_visible: updated.online_booking_visible };
    });

    // POST /api/auth/users — admin creates a user INSIDE their workspace.
    // The new user gets a Membership(role=mechanic|auxiliary) in the caller's
    // workspace. If the email already exists (for another workspace), we
    // attach a new membership instead of rejecting.
    fastify.post('/users', { preHandler: [authenticate, resolveWorkspace] }, async (request, reply) => {
        const data = { ...(request.body || {}) };
        if (!data.email || !data.full_name) {
            return reply.status(400).send({ error: 'email y full_name son obligatorios.' });
        }

        // V2: solo owner/admin crean cualquier rol; un maestro solo crea auxiliares suyos (con tope de comisión).
        const actor = await loadActor(request);
        if (!actor.can_create_auxiliares) {
            return reply.status(403).send({ error: 'No tienes permiso para crear usuarios.' });
        }
        let targetRole = data.workspace_role || data.role || 'mechanic';
        if (actor.role === 'maestro') {
            const cap = auxCommissionCap(request.workspace.settings);
            const check = validateAuxRate(actor, data.commission_percentage ?? 10, cap);
            if (!check.ok) return reply.status(400).send({ error: check.error });
            data.role = 'mechanic';
            data.is_master_mechanic = false;
            data.requires_approval = true;
            data.supervised_by = actor.id;
            data.commission_percentage = check.rate;
            targetRole = 'mechanic';
        } else {
            const allowedMembershipRoles = actor.role === 'owner' ? ['owner', 'admin', 'mechanic', 'auxiliary'] : ['admin', 'mechanic', 'auxiliary'];
            if (targetRole === 'admin_mechanic') targetRole = 'mechanic';
            if (!allowedMembershipRoles.includes(targetRole)) targetRole = 'mechanic';
            if (!['mechanic', 'admin_mechanic', 'admin'].includes(data.role || 'mechanic')) data.role = 'mechanic';
        }
        const normalizedEmail = String(data.email).trim().toLowerCase();

        // Resolver supervised_by sólo si requires_approval=true.
        // Validar que el supuesto maestro exista como miembro del workspace activo.
        let resolvedSupervisedBy = null;
        if (data.requires_approval === true && data.supervised_by) {
            const supervisorMembership = await unscoped(() =>
                prisma.membership.findUnique({
                    where: {
                        workspace_id_profile_id: {
                            workspace_id: request.workspace.id,
                            profile_id: data.supervised_by,
                        },
                    },
                })
            );
            if (!supervisorMembership) {
                return reply.status(400).send({ error: 'El maestro asignado no existe en este taller.' });
            }
            resolvedSupervisedBy = data.supervised_by;
        }

        const result = await unscoped(() =>
            prisma.$transaction(async (tx) => {
                let profile = await tx.profile.findUnique({ where: { email: normalizedEmail } });
                if (!profile) {
                    const password_hash = await bcrypt.hash(data.password || 'motopartes123', 10);
                    profile = await tx.profile.create({
                        data: {
                            email: normalizedEmail,
                            password_hash,
                            full_name: data.full_name,
                            phone: data.phone || null,
                            role: data.role || 'mechanic',
                            commission_percentage: data.commission_percentage || 10,
                            is_master_mechanic: data.is_master_mechanic || false,
                            requires_approval: data.requires_approval || false,
                            supervised_by: resolvedSupervisedBy,
                            can_create_services: data.can_create_services || false,
                            can_create_appointments: data.can_create_appointments !== false,
                            can_send_messages: data.can_send_messages !== false,
                            can_create_clients: data.can_create_clients !== false,
                            can_edit_clients: data.can_edit_clients || false,
                            can_delete_orders: data.can_delete_orders || false,
                            signup_source: 'admin',
                        },
                    });
                }

                const membership = await tx.membership.upsert({
                    where: {
                        workspace_id_profile_id: {
                            workspace_id: request.workspace.id,
                            profile_id: profile.id,
                        },
                    },
                    update: { role: targetRole },
                    create: {
                        workspace_id: request.workspace.id,
                        profile_id: profile.id,
                        role: targetRole,
                        invited_by: request.user.id,
                    },
                });

                await tx.auditLog.create({
                    data: {
                        workspace_id: request.workspace.id,
                        profile_id: request.user.id,
                        event: 'user.added',
                        payload: { added_profile_id: profile.id, role: targetRole },
                    },
                });
                return { profile, membership };
            })
        );

        const { password_hash, ...userData } = result.profile;
        return { ...userData, workspace_role: result.membership.role };
    });

    // PUT /api/auth/users/:id — update profile fields (global) and/or the
    // caller-workspace Membership role. Only admins/owners can bump roles.
    fastify.put('/users/:id', { preHandler: [authenticate, resolveWorkspace] }, async (request, reply) => {
        const { id } = request.params;
        const body = { ...(request.body || {}) };

        // Membership must exist in the caller's workspace.
        const membership = await unscoped(() =>
            prisma.membership.findUnique({
                where: { workspace_id_profile_id: { workspace_id: request.workspace.id, profile_id: id } },
                include: { profile: true },
            })
        );
        if (!membership) {
            return reply.status(404).send({ error: 'Usuario no encontrado en este taller.' });
        }

        // V2: lista blanca de campos por rol (antes cualquier integrante podia reescribir cualquier campo del perfil).
        const actor = await loadActor(request);
        const target = { id, role: normalizeRole(membership.role, membership.profile), supervised_by: membership.profile.supervised_by || null };
        const allowedFields = editableFieldsFor(actor, target);
        if (!allowedFields) {
            return reply.status(403).send({ error: 'No tienes permiso para editar a este usuario.' });
        }
        const updates = pickFields(body, allowedFields);
        if (isAdminRole(actor.role)) {
            // Compatibilidad con la pantalla actual: rol global del perfil (solo valores conocidos).
            if (['mechanic', 'admin_mechanic', 'admin'].includes(body.role)) updates.role = body.role;
        }
        if ('commission_percentage' in updates) {
            const rate = Number(updates.commission_percentage);
            if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
                return reply.status(400).send({ error: 'La comisión debe ser un número entre 0 y 100.' });
            }
            if (target.role === 'auxiliar') {
                const check = validateAuxRate(actor, rate, auxCommissionCap(request.workspace.settings));
                if (!check.ok) return reply.status(400).send({ error: check.error });
            }
            updates.commission_percentage = rate;
        }
        let newRole = isAdminRole(actor.role) ? body.workspace_role : undefined;
        if (newRole !== undefined) {
            if (target.role === 'owner' && actor.role !== 'owner') {
                return reply.status(403).send({ error: 'No se puede cambiar el rol del dueño.' });
            }
            if (!['admin', 'mechanic', 'auxiliary'].includes(newRole) && !(newRole === 'owner' && actor.role === 'owner')) newRole = undefined;
        }

        if (updates.password) {
            updates.password_hash = await bcrypt.hash(updates.password, 10);
            delete updates.password;
        }

        // Reglas para supervised_by:
        //   - Si el form quita requires_approval (=> false), forzar supervised_by = null.
        //   - Si requires_approval = true y supervised_by viene en el body, validar
        //     que el maestro exista como miembro del workspace activo.
        //   - Si requires_approval no llega en el body, usamos el valor actual del perfil.
        if ('supervised_by' in updates || 'requires_approval' in updates) {
            const currentProfile = await unscoped(() =>
                prisma.profile.findUnique({
                    where: { id },
                    select: { requires_approval: true, supervised_by: true },
                })
            );
            const willRequireApproval = ('requires_approval' in updates)
                ? !!updates.requires_approval
                : !!currentProfile?.requires_approval;

            if (!willRequireApproval) {
                // Maestro/normal: nunca puede tener supervisor.
                updates.supervised_by = null;
            } else if ('supervised_by' in updates && updates.supervised_by) {
                const supervisorMembership = await unscoped(() =>
                    prisma.membership.findUnique({
                        where: {
                            workspace_id_profile_id: {
                                workspace_id: request.workspace.id,
                                profile_id: updates.supervised_by,
                            },
                        },
                    })
                );
                if (!supervisorMembership) {
                    return reply.status(400).send({ error: 'El maestro asignado no existe en este taller.' });
                }
            }
        }

        const result = await unscoped(() =>
            prisma.$transaction(async (tx) => {
                const updated = await tx.profile.update({ where: { id }, data: updates });
                let updatedMembership = membership;
                if (newRole && newRole !== membership.role) {
                    updatedMembership = await tx.membership.update({
                        where: { id: membership.id },
                        data: { role: newRole },
                    });
                }
                return { profile: updated, membership: updatedMembership };
            })
        );
        const { password_hash, ...userData } = result.profile;
        return { ...userData, workspace_role: result.membership.role };
    });

    // DELETE /api/auth/users/:id — remove the user's membership from the
    // caller's workspace. The Profile itself is NOT deleted (they may belong
    // to other workspaces). If this was their only membership, deactivate.
    fastify.delete('/users/:id', { preHandler: [authenticate, resolveWorkspace] }, async (request, reply) => {
        const { id } = request.params;

        // V2: solo owner/admin (o el maestro sobre sus auxiliares); nunca a uno mismo.
        const actorDel = await loadActor(request);
        const targetM = await unscoped(() => prisma.membership.findUnique({
            where: { workspace_id_profile_id: { workspace_id: request.workspace.id, profile_id: id } },
            include: { profile: true },
        }));
        if (!targetM) return reply.status(404).send({ error: 'Usuario no encontrado en este taller.' });
        if (id === actorDel.id) return reply.status(400).send({ error: 'No puedes eliminarte a ti mismo.' });
        const targetDel = { id, role: normalizeRole(targetM.role, targetM.profile), supervised_by: targetM.profile.supervised_by || null };
        const canDelete = isAdminRole(actorDel.role)
            ? !(targetDel.role === 'owner' && actorDel.role !== 'owner')
            : (actorDel.role === 'maestro' && targetDel.role === 'auxiliar' && targetDel.supervised_by === actorDel.id);
        if (!canDelete) return reply.status(403).send({ error: 'No tienes permiso para eliminar a este usuario.' });

        const result = await unscoped(() =>
            prisma.$transaction(async (tx) => {
                const membership = await tx.membership.findUnique({
                    where: { workspace_id_profile_id: { workspace_id: request.workspace.id, profile_id: id } },
                });
                if (!membership) {
                    return { notFound: true };
                }
                if (membership.role === 'owner') {
                    // Prevent removing the last owner of a workspace.
                    const ownerCount = await tx.membership.count({
                        where: { workspace_id: request.workspace.id, role: 'owner' },
                    });
                    if (ownerCount <= 1) {
                        return { lastOwner: true };
                    }
                }
                await tx.membership.delete({ where: { id: membership.id } });
                const remaining = await tx.membership.count({ where: { profile_id: id } });
                if (remaining === 0) {
                    await tx.profile.update({ where: { id }, data: { is_active: false } });
                }
                await tx.auditLog.create({
                    data: {
                        workspace_id: request.workspace.id,
                        profile_id: request.user.id,
                        event: 'user.removed',
                        payload: { removed_profile_id: id, deactivated: remaining === 0 },
                    },
                });
                return { success: true };
            })
        );

        if (result.notFound) return reply.status(404).send({ error: 'Usuario no encontrado en este taller.' });
        if (result.lastOwner) return reply.status(400).send({ error: 'No puedes eliminar al último propietario.' });
        return result;
    });

    // DELETE /api/auth/users/:id/permanent — hard delete.
    // Only owners of the workspace can nuke a profile. We also refuse if the
    // profile belongs to other workspaces, to avoid cross-tenant data loss.
    fastify.delete('/users/:id/permanent', { preHandler: [authenticate, resolveWorkspace] }, async (request, reply) => {
        if (request.workspaceRole !== 'owner') {
            return reply.status(403).send({ error: 'Sólo el propietario puede eliminar definitivamente.' });
        }
        const { id } = request.params;

        const result = await unscoped(() =>
            prisma.$transaction(async (tx) => {
                const memCount = await tx.membership.count({ where: { profile_id: id } });
                if (memCount > 1) {
                    return { multi: true };
                }
                const ownMembership = await tx.membership.findFirst({ where: { profile_id: id, workspace_id: request.workspace.id } });
                if (ownMembership?.role === 'owner') {
                    const owners = await tx.membership.count({ where: { workspace_id: request.workspace.id, role: 'owner' } });
                    if (owners <= 1) return { lastOwner: true };
                }
                await tx.workspace.updateMany({ where: { whatsapp_session_profile_id: id }, data: { whatsapp_session_profile_id: null } });
                await tx.profile.updateMany({ where: { supervised_by: id }, data: { supervised_by: null } });
                await tx.mechanicEarning.deleteMany({ where: { mechanic_id: id } });
                await tx.orderRequest.deleteMany({ where: { OR: [{ requested_by: id }, { requested_to: id }] } });
                await tx.paymentRequest.deleteMany({ where: { OR: [{ master_id: id }, { auxiliary_id: id }] } });
                await tx.whatsappSession.deleteMany({ where: { mechanic_id: id } });
                await tx.order.updateMany({ where: { mechanic_id: id }, data: { mechanic_id: null } });
                await tx.membership.deleteMany({ where: { profile_id: id } });
                await tx.profile.delete({ where: { id } });
                return { success: true };
            })
        );

        if (result.lastOwner) return reply.status(400).send({ error: 'No puedes eliminar al último propietario.' });
        if (result.multi) return reply.status(409).send({ error: 'Ese usuario pertenece a otros talleres; sólo puedes eliminar su membresía.' });
        return result;
    });
}
