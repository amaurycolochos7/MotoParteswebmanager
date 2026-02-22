import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Modo demo para desarrollo sin base de datos
const DEMO_MODE = false; // Conectado a Supabase real

const DEMO_USERS = [
    {
        id: 'demo-admin-001',
        email: 'admin@motopartes.com',
        password_hash: 'admin123',
        full_name: 'Administrador',
        phone: '5551234567',
        role: 'admin',
        commission_percentage: 0,
        is_active: true,
        is_master_mechanic: false,
        requires_approval: false,
        can_view_approved_orders: true
    },
    {
        id: 'demo-mech-001',
        email: 'maestro@motopartes.com',
        password_hash: 'mech123',
        full_name: 'Juan Maestro',
        phone: '5559876543',
        role: 'mechanic',
        commission_percentage: 15,
        is_active: true,
        is_master_mechanic: true,
        requires_approval: false,
        can_view_approved_orders: true
    },
    {
        id: 'demo-mech-002',
        email: 'auxiliar@motopartes.com',
        password_hash: 'aux123',
        full_name: 'Pedro Auxiliar',
        phone: '5551112222',
        role: 'mechanic',
        commission_percentage: 50,
        is_active: true,
        is_master_mechanic: false,
        requires_approval: true,
        can_view_approved_orders: true
    }
];

// Demo data for order requests
let DEMO_ORDER_REQUESTS = [];

// Demo data for mechanic earnings
let DEMO_EARNINGS = [];

// Demo data for payment requests (master → auxiliary)
let DEMO_PAYMENT_REQUESTS = [];


const DEMO_CLIENTS = [
    {
        id: 'demo-client-001',
        phone: '5551111111',
        full_name: 'Carlos García',
        email: 'carlos@example.com',
        notes: 'Cliente frecuente',
        motorcycles: [
            { id: 'demo-moto-001', brand: 'Honda', model: 'CBR 600', year: 2022, plates: 'ABC-123', color: 'Rojo' }
        ]
    },
    {
        id: 'demo-client-002',
        phone: '5552222222',
        full_name: 'María López',
        email: 'maria@example.com',
        notes: '',
        motorcycles: [
            { id: 'demo-moto-002', brand: 'Yamaha', model: 'R6', year: 2021, plates: 'XYZ-789', color: 'Azul' }
        ]
    }
];

const DEMO_SERVICES = [
    { id: 'svc-001', name: 'Servicio Completo', base_price: 500, category: 'mantenimiento', is_active: true },
    { id: 'svc-002', name: 'Cambio de Aceite', base_price: 250, category: 'mantenimiento', is_active: true },
    { id: 'svc-003', name: 'Afinación', base_price: 800, category: 'motor', is_active: true },
    { id: 'svc-004', name: 'Frenos', base_price: 400, category: 'frenos', is_active: true },
];

const DEMO_STATUSES = [
    { id: 'status-001', name: 'Registrada', color: '#06b6d4', display_order: 1, is_terminal: false },
    { id: 'status-002', name: 'En Revisión', color: '#f59e0b', display_order: 2, is_terminal: false },
    { id: 'status-003', name: 'En Reparación', color: '#8b5cf6', display_order: 3, is_terminal: false },
    { id: 'status-004', name: 'Lista para Entregar', color: '#22c55e', display_order: 4, is_terminal: false },
    { id: 'status-005', name: 'Entregada', color: '#10b981', display_order: 5, is_terminal: true },
];

let DEMO_ORDERS = [];

let supabase = null;

try {
    if (supabaseUrl && supabaseAnonKey) {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
} catch (error) {
    console.warn('Supabase not configured, using demo mode');
}

// =============================================
// AUTH SERVICE
// =============================================

export const authService = {
    async login(email, password) {
        if (DEMO_MODE || !supabase) {
            const user = DEMO_USERS.find(
                u => u.email === email.toLowerCase() && u.password_hash === password
            );
            if (!user) {
                throw new Error('Credenciales incorrectas');
            }
            return { ...user };
        }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('email', email.toLowerCase())
                .eq('password_hash', password)
                .eq('is_active', true)
                .single();

            if (error) {
                console.error('Login error:', error);
                throw new Error('Credenciales incorrectas o usuario inactivo');
            }

            if (!data) {
                throw new Error('Credenciales incorrectas');
            }

            return data;
        } catch (err) {
            console.error('Login catch error:', err);
            throw new Error(err.message || 'Error al iniciar sesión');
        }
    },

    async getProfile(id) {
        if (DEMO_MODE || !supabase) {
            return DEMO_USERS.find(u => u.id === id) || null;
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    async getAllUsers() {
        if (DEMO_MODE || !supabase) {
            return DEMO_USERS;
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async createUser(userData) {
        if (DEMO_MODE || !supabase) {
            const newUser = {
                id: `demo-user-${Date.now()}`,
                ...userData,
                is_active: true
            };
            DEMO_USERS.push(newUser);
            return newUser;
        }

        const { data, error } = await supabase
            .from('profiles')
            .insert({
                email: userData.email.toLowerCase(),
                password_hash: userData.password,
                full_name: userData.full_name,
                phone: userData.phone || null,
                role: userData.role,
                commission_percentage: userData.commission_percentage || 10,
                can_create_appointments: userData.can_create_appointments !== false,
                can_send_messages: userData.can_send_messages !== false,
                can_create_clients: userData.can_create_clients !== false,
                can_create_services: userData.can_create_services === true,
                can_edit_clients: userData.can_edit_clients === true,
                can_delete_orders: userData.can_delete_orders === true,
                is_master_mechanic: userData.is_master_mechanic === true,
                requires_approval: userData.requires_approval === true,
                can_view_approved_orders: userData.can_view_approved_orders !== false,
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async updateUser(id, updates) {
        if (DEMO_MODE || !supabase) {
            const index = DEMO_USERS.findIndex(u => u.id === id);
            if (index !== -1) {
                DEMO_USERS[index] = { ...DEMO_USERS[index], ...updates };
                return DEMO_USERS[index];
            }
            return null;
        }

        const { data, error } = await supabase
            .from('profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteUser(id) {
        return this.updateUser(id, { is_active: false });
    },

    async deleteUserPermanently(id) {
        if (DEMO_MODE || !supabase) {
            const index = DEMO_USERS.findIndex(u => u.id === id);
            if (index !== -1) {
                DEMO_USERS.splice(index, 1);
            }
            return true;
        }

        try {
            // 1. Desasociar clientes (esto es suave, no queremos borrar al cliente)
            await supabase
                .from('clients')
                .update({ created_by: null })
                .eq('created_by', id);

            // 2. Eliminar solicitudes de órdenes (tanto enviadas como recibidas)
            await supabase
                .from('order_requests')
                .delete()
                .or(`requested_by.eq.${id},requested_to.eq.${id}`);

            // 3. Eliminar ganancias (esto es crítico para desvincular órdenes)
            await supabase
                .from('mechanic_earnings')
                .delete()
                .or(`mechanic_id.eq.${id},supervisor_id.eq.${id}`);

            // 4. Eliminar solicitudes de pago
            await supabase
                .from('payment_requests')
                .delete()
                .or(`from_master_id.eq.${id},to_auxiliary_id.eq.${id}`);

            // 5. Obtener los IDs de todas las órdenes del mecánico para borrar sus detalles
            const { data: userOrders } = await supabase
                .from('orders')
                .select('id')
                .eq('mechanic_id', id);

            if (userOrders && userOrders.length > 0) {
                const orderIds = userOrders.map(o => o.id);

                // Eliminar dependencias de las órdenes
                await supabase.from('order_services').delete().in('order_id', orderIds);
                await supabase.from('order_updates').delete().in('order_id', orderIds);
                // Si existen estas tablas (basado en arquitectura estándar):
                try { await supabase.from('order_parts').delete().in('order_id', orderIds); } catch (e) { }
                try { await supabase.from('order_photos').delete().in('order_id', orderIds); } catch (e) { }

                // Eliminar las órdenes mismas
                await supabase.from('orders').delete().in('id', orderIds);
            }

            // 6. Finalmente, eliminar el perfil
            const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error in deep cascade delete:', error);
            throw error;
        }
    }
};

// =============================================
// CLIENTS SERVICE
// =============================================

export const clientsService = {
    async getAll() {
        if (DEMO_MODE || !supabase) {
            return DEMO_CLIENTS;
        }

        const { data, error } = await supabase
            .from('clients')
            .select(`*, motorcycles (*)`)
            .order('full_name');

        if (error) throw error;
        return data;
    },

    async getById(id) {
        if (DEMO_MODE || !supabase) {
            return DEMO_CLIENTS.find(c => c.id === id) || null;
        }

        const { data, error } = await supabase
            .from('clients')
            .select(`*, motorcycles (*)`)
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    async getByPhone(phone) {
        if (DEMO_MODE || !supabase) {
            const normalized = phone.replace(/\D/g, '');
            return DEMO_CLIENTS.find(c => c.phone.replace(/\D/g, '') === normalized) || null;
        }

        const normalizedPhone = phone.replace(/\D/g, '');
        const { data, error } = await supabase
            .from('clients')
            .select(`*, motorcycles (*)`)
            .eq('phone', normalizedPhone)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async create(clientData, createdBy) {
        if (DEMO_MODE || !supabase) {
            const newClient = {
                id: `demo-client-${Date.now()}`,
                ...clientData,
                phone: clientData.phone.replace(/\D/g, ''),
                motorcycles: [],
                created_by: createdBy
            };
            DEMO_CLIENTS.push(newClient);
            return newClient;
        }

        const { data, error } = await supabase
            .from('clients')
            .insert({
                phone: clientData.phone.replace(/\D/g, ''),
                full_name: clientData.full_name,
                email: clientData.email || null,
                notes: clientData.notes || null,
                created_by: createdBy
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async update(id, updates) {
        if (DEMO_MODE || !supabase) {
            const index = DEMO_CLIENTS.findIndex(c => c.id === id);
            if (index !== -1) {
                DEMO_CLIENTS[index] = { ...DEMO_CLIENTS[index], ...updates };
                return DEMO_CLIENTS[index];
            }
            return null;
        }

        const { data, error } = await supabase
            .from('clients')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async delete(id) {
        if (DEMO_MODE || !supabase) {
            const index = DEMO_CLIENTS.findIndex(c => c.id === id);
            if (index !== -1) {
                DEMO_CLIENTS.splice(index, 1);
            }
            return;
        }

        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};

// =============================================
// MOTORCYCLES SERVICE
// =============================================

export const motorcyclesService = {
    async getByClient(clientId) {
        if (DEMO_MODE || !supabase) {
            const client = DEMO_CLIENTS.find(c => c.id === clientId);
            return client?.motorcycles || [];
        }

        const { data, error } = await supabase
            .from('motorcycles')
            .select('*')
            .eq('client_id', clientId);

        if (error) throw error;
        return data;
    },

    async create(motoData) {
        if (DEMO_MODE || !supabase) {
            const newMoto = {
                id: `demo-moto-${Date.now()}`,
                ...motoData
            };
            const client = DEMO_CLIENTS.find(c => c.id === motoData.client_id);
            if (client) {
                client.motorcycles = client.motorcycles || [];
                client.motorcycles.push(newMoto);
            }
            return newMoto;
        }

        const { data, error } = await supabase
            .from('motorcycles')
            .insert(motoData)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async update(id, updates) {
        if (DEMO_MODE || !supabase) {
            for (const client of DEMO_CLIENTS) {
                const motoIndex = client.motorcycles?.findIndex(m => m.id === id);
                if (motoIndex !== undefined && motoIndex !== -1) {
                    client.motorcycles[motoIndex] = { ...client.motorcycles[motoIndex], ...updates };
                    return client.motorcycles[motoIndex];
                }
            }
            return null;
        }

        const { data, error } = await supabase
            .from('motorcycles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async delete(id) {
        if (DEMO_MODE || !supabase) {
            for (const client of DEMO_CLIENTS) {
                const motoIndex = client.motorcycles?.findIndex(m => m.id === id);
                if (motoIndex !== undefined && motoIndex !== -1) {
                    client.motorcycles.splice(motoIndex, 1);
                    return;
                }
            }
            return;
        }

        const { error } = await supabase
            .from('motorcycles')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};

// =============================================
// SERVICES CATALOG
// =============================================

export const servicesService = {
    async getAll() {
        if (DEMO_MODE || !supabase) {
            return DEMO_SERVICES.filter(s => s.is_active);
        }

        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('display_order');

        if (error) throw error;
        return data;
    },

    async create(serviceData) {
        if (DEMO_MODE || !supabase) {
            const newService = {
                id: `svc-${Date.now()}`,
                ...serviceData,
                is_active: true
            };
            DEMO_SERVICES.push(newService);
            return newService;
        }

        const { data, error } = await supabase
            .from('services')
            .insert(serviceData)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async update(id, updates) {
        if (DEMO_MODE || !supabase) {
            const index = DEMO_SERVICES.findIndex(s => s.id === id);
            if (index !== -1) {
                DEMO_SERVICES[index] = { ...DEMO_SERVICES[index], ...updates };
                return DEMO_SERVICES[index];
            }
            return null;
        }

        const { data, error } = await supabase
            .from('services')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async delete(id) {
        if (DEMO_MODE || !supabase) {
            const index = DEMO_SERVICES.findIndex(s => s.id === id);
            if (index !== -1) {
                DEMO_SERVICES.splice(index, 1);
            }
            return true;
        }

        const { error } = await supabase
            .from('services')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    },

    async getMechanicsPerformance(startDate, endDate) {
        if (DEMO_MODE || !supabase) return [];

        const { data, error } = await supabase.rpc('get_mechanics_performance', {
            start_date: startDate,
            end_date: endDate
        });

        if (error) {
            console.error('Error fetching mechanic performance:', error);
            return [];
        }
        return data;
    }
};

export const orderUpdatesService = {
    async getAll() {
        if (DEMO_MODE || !supabase) return [];
        const { data, error } = await supabase
            .from('order_updates')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Error fetching order updates (table might be missing):', error);
            return [];
        }
        return data || [];
    },

    async getByOrder(orderId) {
        if (DEMO_MODE || !supabase) return [];
        const { data, error } = await supabase
            .from('order_updates')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Error fetching updates for order:', error);
            return [];
        }
        return data || [];
    },

    async create(updateData) {
        if (DEMO_MODE || !supabase) {
            return { id: `update-${Date.now()}`, ...updateData, created_at: new Date().toISOString() };
        }
        const { data, error } = await supabase
            .from('order_updates')
            .insert(updateData)
            .select()
            .single();
        if (error) throw error;
        return data;
    }
};

// =============================================
// ORDERS SERVICE
// =============================================

export const ordersService = {
    async getAll() {
        if (DEMO_MODE || !supabase) {
            return DEMO_ORDERS;
        }

        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                client:clients(*),
                motorcycle:motorcycles(*),
                mechanic:profiles!orders_mechanic_id_fkey(id, full_name, phone, commission_percentage),
                supervisor:profiles!orders_approved_by_fkey(id, full_name, phone),
                status:order_statuses(*),
                services:order_services(*),
                parts:order_parts(*),
                photos:order_photos(*)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async getByMechanic(mechanicId) {
        if (DEMO_MODE || !supabase) {
            return DEMO_ORDERS.filter(o => o.mechanic_id === mechanicId);
        }

        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                client:clients(*),
                motorcycle:motorcycles(*),
                mechanic:profiles!orders_mechanic_id_fkey(id, full_name, phone),
                supervisor:profiles!orders_approved_by_fkey(id, full_name, phone),
                status:order_statuses(*),
                services:order_services(*),
                parts:order_parts(*),
                photos:order_photos(*)
            `)
            .eq('mechanic_id', mechanicId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async getById(id) {
        if (DEMO_MODE || !supabase) {
            return DEMO_ORDERS.find(o => o.id === id) || null;
        }

        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                client:clients(*),
                motorcycle:motorcycles(*),
                mechanic:profiles!orders_mechanic_id_fkey(id, full_name, phone),
                supervisor:profiles!orders_approved_by_fkey(id, full_name, phone),
                status:order_statuses(*),
                services:order_services(*),
                parts:order_parts(*),
                photos:order_photos(*),
                history:order_history(*)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    async getByToken(token) {
        if (DEMO_MODE || !supabase) {
            return DEMO_ORDERS.find(o => o.public_token === token) || null;
        }

        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                client:clients(full_name, phone),
                motorcycle:motorcycles(brand, model, year, plates),
                status:order_statuses(name, color),
                services:order_services(name, price),
                photos:order_photos(url, category, caption)
            `)
            .eq('public_token', token)
            .single();

        if (error) throw error;
        return data;
    },

    async getByClient(clientId) {
        if (DEMO_MODE || !supabase) {
            return DEMO_ORDERS.filter(o => o.client_id === clientId);
        }

        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                client:clients(*),
                motorcycle:motorcycles(*),
                mechanic:profiles!orders_mechanic_id_fkey(id, full_name),
                status:order_statuses(*),
                services:order_services(*),
                parts:order_parts(*)
            `)
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    async create(orderData) {
        // Logic moved inside blocks to handle Demo vs Real differently
        const currentYear = new Date().getFullYear();
        let orderNumber;
        let publicToken = Math.random().toString(36).substring(2, 18);

        // Calculate totals
        const services = orderData.services || [];
        // Labor/Parts breakdown from custom service if provided
        const laborTotal = orderData.custom_service_labor || 0;
        const partsTotal = orderData.custom_service_materials || 0;
        const totalAmount = services.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

        if (DEMO_MODE || !supabase) {
            orderNumber = `MP-${String(currentYear).slice(-2)}-${String(DEMO_ORDERS.length + 1).padStart(2, '0')}`;
            const client = DEMO_CLIENTS.find(c => c.id === orderData.client_id);
            const moto = client?.motorcycles?.find(m => m.id === orderData.motorcycle_id);
            const status = DEMO_STATUSES[0];

            const newOrder = {
                id: `order-${Date.now()}`,
                order_number: orderNumber,
                ...orderData,
                client: client,
                motorcycle: moto,
                status: status,
                services: services,
                photos: [],
                labor_total: laborTotal,
                parts_total: partsTotal,
                total_amount: totalAmount,
                is_paid: false,
                public_token: publicToken,
                client_link: `/orden/${publicToken}`,
                approved_by: orderData.approved_by || null,
                created_at: new Date().toISOString()
            };
            DEMO_ORDERS.push(newOrder);
            return newOrder;
        }

        // Real Supabase implementation
        const { data: firstStatus } = await supabase
            .from('order_statuses')
            .select('id')
            .order('display_order')
            .limit(1)
            .single();

        // Generate Order Number from DB
        const { data: lastOrders } = await supabase
            .from('orders')
            .select('order_number')
            .ilike('order_number', `MP-${String(currentYear).slice(-2)}-%`)
            .order('created_at', { ascending: false })
            .limit(1);

        let sequence = 1;
        if (lastOrders && lastOrders.length > 0) {
            const lastNum = lastOrders[0].order_number;
            const parts = lastNum.split('-');
            if (parts.length === 3) {
                sequence = parseInt(parts[2]) + 1;
            }
        }
        orderNumber = `MP-${String(currentYear).slice(-2)}-${String(sequence).padStart(2, '0')}`;

        // 1. Insert Order
        const { data: order, error } = await supabase
            .from('orders')
            .insert({
                order_number: orderNumber,
                client_id: orderData.client_id,
                motorcycle_id: orderData.motorcycle_id,
                mechanic_id: orderData.mechanic_id,
                status_id: firstStatus?.id,
                customer_complaint: orderData.customer_complaint,
                initial_diagnosis: orderData.initial_diagnosis,
                labor_total: laborTotal,
                parts_total: partsTotal,
                total_amount: totalAmount,
                advance_payment: orderData.advance_payment || 0,
                public_token: publicToken,
                client_link: `/orden/${publicToken}`,
                approved_by: orderData.approved_by || null
            })
            .select()
            .single();

        if (error) throw error;

        // 2. Insert Services
        if (services.length > 0) {
            const servicesToInsert = services.map(s => ({
                order_id: order.id,
                service_id: s.service_id,
                name: s.name,
                price: s.price,
                labor_cost: s.labor_cost || s.price || 0,
                materials_cost: s.materials_cost || 0
            }));

            const { error: servicesError } = await supabase
                .from('order_services')
                .insert(servicesToInsert);

            if (servicesError) {
                console.error('Error inserting services:', servicesError);
                // Don't throw, return order anyway
            }
        }

        return order;
    },

    async addService(orderId, serviceData) {
        if (DEMO_MODE || !supabase) {
            // Demo mode handling
            const order = DEMO_ORDERS.find(o => o.id === orderId);
            if (order) {
                const newService = {
                    id: `svc-${Date.now()}`,
                    order_id: orderId,
                    service_id: null,
                    name: serviceData.name,
                    price: serviceData.price,
                    labor_cost: serviceData.laborCost || 0,
                    materials_cost: serviceData.partsCost || 0
                };
                order.services = order.services || [];
                order.services.push(newService);
                order.labor_total = (order.labor_total || 0) + (serviceData.laborCost || 0);
                order.parts_total = (order.parts_total || 0) + (serviceData.partsCost || 0);
                order.total_amount = (order.total_amount || 0) + (serviceData.price || 0);
            }
            return order;
        }

        const laborCost = parseFloat(serviceData.laborCost) || 0;
        const partsCost = parseFloat(serviceData.partsCost) || 0;
        const totalPrice = laborCost + partsCost;

        console.log('[ADD SERVICE] Input:', {
            name: serviceData.name,
            laborCost,
            partsCost,
            totalPrice
        });

        // Insert service in order_services with breakdown
        // The database trigger will automatically update order totals
        const { data: newService, error: serviceError } = await supabase
            .from('order_services')
            .insert({
                order_id: orderId,
                service_id: null, // Custom service
                name: serviceData.name,
                price: totalPrice,
                labor_cost: laborCost,
                materials_cost: partsCost
            })
            .select()
            .single();

        if (serviceError) {
            console.error('[ADD SERVICE] Error:', serviceError);
            throw serviceError;
        }

        console.log('[ADD SERVICE] Service added:', newService);

        // Fetch the updated order to return (trigger should have updated totals)
        const { data: updatedOrder, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (fetchError) throw fetchError;

        console.log('[ADD SERVICE] Updated order totals:', {
            labor_total: updatedOrder.labor_total,
            parts_total: updatedOrder.parts_total,
            total_amount: updatedOrder.total_amount
        });

        return updatedOrder;
    },

    async updateStatus(orderId, statusId, changedBy, notes = '') {
        if (DEMO_MODE || !supabase) {
            const order = DEMO_ORDERS.find(o => o.id === orderId);
            if (order) {
                const newStatus = DEMO_STATUSES.find(s => s.id === statusId);
                order.status = newStatus;
            }
            return order;
        }

        const updates = {
            status_id: statusId,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async markAsPaid(orderId) {
        if (DEMO_MODE || !supabase) {
            const order = DEMO_ORDERS.find(o => o.id === orderId);
            if (order) {
                order.is_paid = true;
                order.paid_at = new Date().toISOString();
            }
            return order;
        }

        const { data, error } = await supabase
            .from('orders')
            .update({
                is_paid: true,
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async update(orderId, updates) {
        if (DEMO_MODE || !supabase) {
            const order = DEMO_ORDERS.find(o => o.id === orderId);
            if (order) {
                Object.assign(order, updates);
            }
            return order;
        }

        const { data, error } = await supabase
            .from('orders')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async delete(orderId) {
        if (DEMO_MODE || !supabase) {
            const index = DEMO_ORDERS.findIndex(o => o.id === orderId);
            if (index > -1) {
                DEMO_ORDERS.splice(index, 1);
            }
            return true;
        }

        try {
            console.log('Deleting order with cascade:', orderId);

            // 1. Delete mechanic_earnings (this is what was causing the FK constraint error)
            const { error: earningsError } = await supabase
                .from('mechanic_earnings')
                .delete()
                .eq('order_id', orderId);

            if (earningsError) {
                console.warn('Error deleting mechanic_earnings (may not exist):', earningsError);
            }

            // 2. Delete order_services
            const { error: servicesError } = await supabase
                .from('order_services')
                .delete()
                .eq('order_id', orderId);

            if (servicesError) {
                console.warn('Error deleting order_services:', servicesError);
            }

            // 3. Delete order_updates
            const { error: updatesError } = await supabase
                .from('order_updates')
                .delete()
                .eq('order_id', orderId);

            if (updatesError) {
                console.warn('Error deleting order_updates:', updatesError);
            }

            // 4. Delete order_photos
            const { error: photosError } = await supabase
                .from('order_photos')
                .delete()
                .eq('order_id', orderId);

            if (photosError) {
                console.warn('Error deleting order_photos:', photosError);
            }

            // 5. Delete order_parts (if exists)
            try {
                await supabase
                    .from('order_parts')
                    .delete()
                    .eq('order_id', orderId);
            } catch (e) {
                console.warn('order_parts table might not exist');
            }

            // 6. Delete order_history (if exists)
            try {
                await supabase
                    .from('order_history')
                    .delete()
                    .eq('order_id', orderId);
            } catch (e) {
                console.warn('order_history table might not exist');
            }

            // 7. Finally, delete the order itself
            const { error } = await supabase
                .from('orders')
                .delete()
                .eq('id', orderId);

            if (error) {
                console.error('Error deleting order:', error);
                throw error;
            }

            console.log('Order deleted successfully:', orderId);
            return true;
        } catch (error) {
            console.error('Error in cascading delete for order:', error);
            throw error;
        }
    }
};

// =============================================
// ORDER STATUSES SERVICE
// =============================================

export const statusesService = {
    async getAll() {
        if (DEMO_MODE || !supabase) {
            return DEMO_STATUSES;
        }

        const { data, error } = await supabase
            .from('order_statuses')
            .select('*')
            .order('display_order');

        if (error) throw error;
        return data;
    }
};

// =============================================
// PHOTOS SERVICE
// =============================================

export const photosService = {
    async upload(file, orderId, category, caption, uploadedBy) {
        if (DEMO_MODE || !supabase) {
            // En modo demo, convertir a base64
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const photo = {
                        id: `photo-${Date.now()}`,
                        order_id: orderId,
                        url: reader.result,
                        category,
                        caption,
                        uploaded_by: uploadedBy
                    };
                    const order = DEMO_ORDERS.find(o => o.id === orderId);
                    if (order) {
                        order.photos = order.photos || [];
                        order.photos.push(photo);
                    }
                    resolve(photo);
                };
                reader.readAsDataURL(file);
            });
        }

        const fileName = `${orderId}/${Date.now()}_${file.name}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('order-photos')
            .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('order-photos')
            .getPublicUrl(fileName);

        const { data, error } = await supabase
            .from('order_photos')
            .insert({
                order_id: orderId,
                url: urlData.publicUrl,
                category,
                caption,
                uploaded_by: uploadedBy
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async delete(photoId, filePath) {
        if (DEMO_MODE || !supabase) {
            for (const order of DEMO_ORDERS) {
                const index = order.photos?.findIndex(p => p.id === photoId);
                if (index !== undefined && index !== -1) {
                    order.photos.splice(index, 1);
                    return;
                }
            }
            return;
        }

        await supabase.storage
            .from('order-photos')
            .remove([filePath]);

        const { error } = await supabase
            .from('order_photos')
            .delete()
            .eq('id', photoId);

        if (error) throw error;
    }
};

// =============================================
// STATISTICS SERVICE (Para Admin)
// =============================================

export const statsService = {
    async getMechanicsPerformance(startDate = null, endDate = null) {
        if (DEMO_MODE || !supabase) {
            return DEMO_USERS
                .filter(u => u.role === 'mechanic' || u.role === 'admin_mechanic')
                .map(u => ({
                    id: u.id,
                    name: u.full_name,
                    commission_percentage: u.commission_percentage,
                    orders_count: DEMO_ORDERS.filter(o => o.mechanic_id === u.id && o.is_paid).length,
                    total_labor: DEMO_ORDERS
                        .filter(o => o.mechanic_id === u.id && o.is_paid)
                        .reduce((sum, o) => sum + (o.labor_total || 0), 0),
                    total_commission: DEMO_ORDERS
                        .filter(o => o.mechanic_id === u.id && o.is_paid)
                        .reduce((sum, o) => sum + ((o.labor_total || 0) * u.commission_percentage / 100), 0)
                }));
        }

        let query = supabase
            .from('orders')
            .select(`
                mechanic_id,
                labor_total,
                is_paid,
                created_at,
                mechanic:profiles!orders_mechanic_id_fkey(id, full_name, commission_percentage)
            `)
            .eq('is_paid', true);

        if (startDate) query = query.gte('created_at', startDate);
        if (endDate) query = query.lte('created_at', endDate);

        const { data, error } = await query;
        if (error) throw error;

        const grouped = {};
        data.forEach(order => {
            if (!order.mechanic) return;
            const id = order.mechanic.id;
            if (!grouped[id]) {
                grouped[id] = {
                    id,
                    name: order.mechanic.full_name,
                    commission_percentage: order.mechanic.commission_percentage,
                    orders_count: 0,
                    total_labor: 0,
                    total_commission: 0
                };
            }
            grouped[id].orders_count++;
            grouped[id].total_labor += parseFloat(order.labor_total) || 0;
            grouped[id].total_commission += (parseFloat(order.labor_total) || 0) * (order.mechanic.commission_percentage / 100);
        });

        return Object.values(grouped);
    },

    async getDashboardStats() {
        if (DEMO_MODE || !supabase) {
            const paidOrders = DEMO_ORDERS.filter(o => o.is_paid);
            return {
                todayOrders: DEMO_ORDERS.filter(o =>
                    new Date(o.created_at).toDateString() === new Date().toDateString()
                ).length,
                activeOrders: DEMO_ORDERS.filter(o => !o.is_paid).length,
                monthRevenue: paidOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
            };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);

        const { count: todayOrders } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', today.toISOString());

        const { count: activeOrders } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('is_paid', false);

        const { data: monthRevenue } = await supabase
            .from('orders')
            .select('total_amount')
            .eq('is_paid', true)
            .gte('paid_at', monthAgo.toISOString());

        const totalMonthRevenue = monthRevenue?.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0) || 0;

        return {
            todayOrders: todayOrders || 0,
            activeOrders: activeOrders || 0,
            monthRevenue: totalMonthRevenue
        };
    }
};

// =============================================
// WHATSAPP SESSION SERVICE
// =============================================

export const whatsappService = {
    async getSession() {
        if (DEMO_MODE || !supabase) {
            return { is_connected: false, phone_number: null };
        }

        const { data, error } = await supabase
            .from('whatsapp_sessions')
            .select('*')
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async updateSession(updates) {
        if (DEMO_MODE || !supabase) {
            return { ...updates };
        }

        const { data: existing } = await this.getSession();

        if (existing) {
            const { data, error } = await supabase
                .from('whatsapp_sessions')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } else {
            const { data, error } = await supabase
                .from('whatsapp_sessions')
                .insert(updates)
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    }
};

// =============================================
// ORDER REQUESTS SERVICE (for auxiliary mechanics)
// =============================================

export const orderRequestsService = {
    // Get all master mechanics for the auxiliary to choose from
    async getMasterMechanics() {
        if (DEMO_MODE || !supabase) {
            return DEMO_USERS.filter(u => u.is_master_mechanic && u.is_active);
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, phone, commission_percentage')
            .eq('is_master_mechanic', true)
            .eq('is_active', true);

        if (error) throw error;
        return data;
    },

    // Get pending requests for a master mechanic
    async getPendingForMaster(masterId) {
        if (DEMO_MODE || !supabase) {
            return DEMO_ORDER_REQUESTS.filter(r =>
                r.requested_to === masterId && r.status === 'pending'
            );
        }

        const { data, error } = await supabase
            .from('order_requests')
            .select(`
                *,
                requester:profiles!order_requests_requested_by_fkey(id, full_name, phone, commission_percentage)
            `)
            .eq('requested_to', masterId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // Get requests by auxiliary mechanic
    async getByAuxiliary(auxiliaryId) {
        if (DEMO_MODE || !supabase) {
            return DEMO_ORDER_REQUESTS.filter(r => r.requested_by === auxiliaryId);
        }

        const { data, error } = await supabase
            .from('order_requests')
            .select(`
                *,
                master:profiles!order_requests_requested_to_fkey(id, full_name)
            `)
            .eq('requested_by', auxiliaryId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // Create a new order request
    async create(requestData) {
        if (DEMO_MODE || !supabase) {
            const newRequest = {
                id: `request-${Date.now()}`,
                ...requestData,
                status: 'pending',
                created_at: new Date().toISOString()
            };
            DEMO_ORDER_REQUESTS.push(newRequest);
            return newRequest;
        }

        const { data, error } = await supabase
            .from('order_requests')
            .insert({
                requested_by: requestData.requested_by,
                requested_to: requestData.requested_to,
                order_data: requestData.order_data,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Approve a request (creates the order automatically)
    async approve(requestId, masterId, notes = '') {
        if (DEMO_MODE || !supabase) {
            const request = DEMO_ORDER_REQUESTS.find(r => r.id === requestId);
            if (request) {
                request.status = 'approved';
                request.response_notes = notes;
                request.responded_at = new Date().toISOString();
                // Order creation would happen separately
            }
            return request;
        }

        const { data, error } = await supabase
            .from('order_requests')
            .update({
                status: 'approved',
                response_notes: notes,
                responded_at: new Date().toISOString()
            })
            .eq('id', requestId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Reject a request
    async reject(requestId, masterId, notes = '') {
        if (DEMO_MODE || !supabase) {
            const request = DEMO_ORDER_REQUESTS.find(r => r.id === requestId);
            if (request) {
                request.status = 'rejected';
                request.response_notes = notes;
                request.responded_at = new Date().toISOString();
            }
            return request;
        }

        const { data, error } = await supabase
            .from('order_requests')
            .update({
                status: 'rejected',
                response_notes: notes,
                responded_at: new Date().toISOString()
            })
            .eq('id', requestId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Get count of pending requests for badge
    async getPendingCount(masterId) {
        if (DEMO_MODE || !supabase) {
            return DEMO_ORDER_REQUESTS.filter(r =>
                r.requested_to === masterId && r.status === 'pending'
            ).length;
        }

        const { count, error } = await supabase
            .from('order_requests')
            .select('*', { count: 'exact', head: true })
            .eq('requested_to', masterId)
            .eq('status', 'pending');

        if (error) throw error;
        return count || 0;
    },

    // Get all auxiliaries who have sent approved requests to this master or have orders assigned
    async getAuxiliariesWithStats(masterId) {
        if (DEMO_MODE || !supabase) {
            // Simplified demo logic for consistency
            const auxMap = {};
            DEMO_ORDERS.forEach(order => {
                if (order.approved_by === masterId && order.mechanic_id) {
                    const auxId = order.mechanic_id;
                    if (!auxMap[auxId]) {
                        const auxUser = DEMO_USERS.find(u => u.id === auxId);
                        auxMap[auxId] = {
                            mechanic_id: auxId,
                            mechanic_name: auxUser?.full_name || 'Auxiliar',
                            commission_percentage: auxUser?.commission_percentage || 10,
                            total_orders: 0,
                            total_labor: 0,
                            total_earned: 0,
                            pending_payment: 0,
                            pending_orders_list: []
                        };
                    }
                    const laborAmount = order.labor_total || 0;
                    auxMap[auxId].total_orders += 1;
                    auxMap[auxId].total_labor += laborAmount;
                    const commission = (laborAmount * auxMap[auxId].commission_percentage) / 100;
                    auxMap[auxId].total_earned += commission;
                    auxMap[auxId].pending_payment += commission;
                    auxMap[auxId].pending_orders_list.push({
                        id: order.id,
                        order_number: order.order_number,
                        labor_amount: laborAmount,
                        commission: commission
                    });
                }
            });
            return Object.values(auxMap);
        }

        // 1. Get all orders where approved_by = masterId
        const { data: allOrders, error: ordersError } = await supabase
            .from('orders')
            .select(`
                id,
                order_number,
                labor_total,
                mechanic_id,
                mechanic:profiles!orders_mechanic_id_fkey(id, full_name, commission_percentage),
                client:clients(full_name),
                is_paid,
                status_id
            `)
            .eq('approved_by', masterId);

        if (ordersError) throw ordersError;

        if (!allOrders || allOrders.length === 0) {
            // Handle pending requests even if there are no orders
            const { data: pendingRequests, error: reqError } = await supabase
                .from('order_requests')
                .select(`
                    requested_by,
                    requester:profiles!order_requests_requested_by_fkey(id, full_name, commission_percentage)
                `)
                .eq('requested_to', masterId)
                .eq('status', 'pending');

            if (reqError) throw reqError;

            const auxMap = {};
            pendingRequests?.forEach(req => {
                const auxId = req.requested_by;
                if (!auxMap[auxId]) {
                    auxMap[auxId] = {
                        mechanic_id: auxId,
                        mechanic_name: req.requester?.full_name || 'Auxiliar',
                        commission_percentage: req.requester?.commission_percentage || 10,
                        total_orders: 0,
                        total_labor: 0,
                        total_earned: 0,
                        pending_payment: 0,
                        pending_orders_list: []
                    };
                }
            });
            return Object.values(auxMap);
        }

        // 2. Get all mechanic earnings for THESE specific orders
        const orderIds = allOrders.map(o => o.id);
        const { data: allEarnings, error: earningsError } = await supabase
            .from('mechanic_earnings')
            .select('*')
            .in('order_id', orderIds);

        if (earningsError) throw earningsError;

        // 3. Get pending requests
        const { data: pendingRequests, error: reqError } = await supabase
            .from('order_requests')
            .select(`
                requested_by,
                requester:profiles!order_requests_requested_by_fkey(id, full_name, commission_percentage)
            `)
            .eq('requested_to', masterId)
            .eq('status', 'pending');

        if (reqError) throw reqError;

        // Identify orders that are ALREADY PAID or LINKED TO A PAYMENT
        const paidOrderIds = new Set(
            allEarnings?.filter(e => e.is_paid || e.payment_request_id).map(e => e.order_id)
        );

        const unpaidEarningsByOrder = {};
        allEarnings?.forEach(e => {
            // Un registro es elegible si no está pagado Y no está vinculado ya a una solicitud activa
            if (!e.is_paid && !e.payment_request_id) unpaidEarningsByOrder[e.order_id] = e;
        });

        // Group stats by auxiliary
        const auxMap = {};

        // Process Orders
        allOrders?.forEach(order => {
            const auxId = order.mechanic_id;
            if (!auxId) return;

            // ABSOLUTE EXCLUSION of already paid orders
            if (paidOrderIds.has(order.id)) return;

            if (!auxMap[auxId]) {
                auxMap[auxId] = {
                    mechanic_id: auxId,
                    mechanic_name: order.mechanic?.full_name || 'Auxiliar',
                    commission_percentage: order.mechanic?.commission_percentage || 10,
                    total_orders: 0,
                    total_labor: 0,
                    total_earned: 0,
                    pending_payment: 0,
                    pending_orders_list: []
                };
            }

            const laborTotal = parseFloat(order.labor_total) || 0;
            const rate = auxMap[auxId].commission_percentage / 100;

            const earningRecord = unpaidEarningsByOrder[order.id];
            const commission = earningRecord
                ? parseFloat(earningRecord.earned_amount)
                : (laborTotal * rate);

            auxMap[auxId].total_orders += 1;
            auxMap[auxId].total_labor += laborTotal;
            auxMap[auxId].total_earned += commission;
            auxMap[auxId].pending_payment += commission;
            auxMap[auxId].pending_orders_list.push({
                id: order.id,
                earning_id: earningRecord?.id || null, // VITAL: Incluir el ID de la ganancia real
                order_number: order.order_number,
                client_name: order.client?.full_name || 'Particular',
                labor_amount: laborTotal,
                commission: commission
            });
        });

        // Ensure auxiliaries with pending requests are also in the map
        pendingRequests?.forEach(req => {
            const auxId = req.requested_by;
            if (!auxMap[auxId]) {
                auxMap[auxId] = {
                    mechanic_id: auxId,
                    mechanic_name: req.requester?.full_name || 'Auxiliar',
                    commission_percentage: req.requester?.commission_percentage || 10,
                    total_orders: 0,
                    total_labor: 0,
                    total_earned: 0,
                    already_paid: 0,
                    pending_payment: 0,
                    pending_orders_list: []
                };
            }
        });

        return Object.values(auxMap);
    },

    // Alias for getByAuxiliary - used by MyRequests page
    async getMyRequests(auxiliaryId) {
        return this.getByAuxiliary(auxiliaryId);
    }
};

// =============================================
// MECHANIC EARNINGS SERVICE
// =============================================

export const earningsService = {
    // Record earnings when an order is completed
    async recordEarning(orderData, mechanicId, supervisorId = null) {
        const weekStart = getWeekStart(new Date());

        // Get mechanic's commission rate
        let commissionRate = 0;
        if (DEMO_MODE || !supabase) {
            const mechanic = DEMO_USERS.find(u => u.id === mechanicId);
            commissionRate = mechanic?.commission_percentage || 0;
        } else {
            const { data: mechanic } = await supabase
                .from('profiles')
                .select('commission_percentage')
                .eq('id', mechanicId)
                .single();
            commissionRate = mechanic?.commission_percentage || 0;
        }

        const laborAmount = orderData.labor_total || 0;
        const earnedAmount = (laborAmount * commissionRate) / 100;

        if (DEMO_MODE || !supabase) {
            // Check for existing in demo
            const existing = DEMO_EARNINGS.find(e => e.order_id === orderData.id && e.mechanic_id === mechanicId);
            if (existing) return existing;

            const earning = {
                id: `earning-${Date.now()}`,
                mechanic_id: mechanicId,
                supervisor_id: supervisorId,
                order_id: orderData.id,
                week_start: weekStart.toISOString().split('T')[0],
                labor_amount: laborAmount,
                commission_rate: commissionRate,
                earned_amount: earnedAmount,
                is_paid: false,
                created_at: new Date().toISOString()
            };
            DEMO_EARNINGS.push(earning);
            return earning;
        }

        // VITAL: Verificar si ya existe un registro para esta orden y mecánico
        const { data: existing } = await supabase
            .from('mechanic_earnings')
            .select('*')
            .eq('order_id', orderData.id)
            .eq('mechanic_id', mechanicId)
            .maybeSingle();

        if (existing) {
            console.log('ℹ️ Registro de ganancia ya existe:', existing.id);
            return existing;
        }

        const { data, error } = await supabase
            .from('mechanic_earnings')
            .insert({
                mechanic_id: mechanicId,
                supervisor_id: supervisorId,
                order_id: orderData.id,
                week_start: weekStart.toISOString().split('T')[0],
                labor_amount: laborAmount,
                commission_rate: commissionRate,
                earned_amount: earnedAmount,
                is_paid: false
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Get earnings summary for a mechanic
    async getMechanicEarnings(mechanicId, startDate = null, endDate = null) {
        if (DEMO_MODE || !supabase) {
            let earnings = DEMO_EARNINGS.filter(e => e.mechanic_id === mechanicId);
            if (startDate) {
                earnings = earnings.filter(e => new Date(e.week_start) >= new Date(startDate));
            }
            if (endDate) {
                earnings = earnings.filter(e => new Date(e.week_start) <= new Date(endDate));
            }
            return earnings;
        }

        let query = supabase
            .from('mechanic_earnings')
            .select(`
                *,
                order:orders(order_number, client:clients(full_name))
            `)
            .eq('mechanic_id', mechanicId)
            .order('created_at', { ascending: false });

        if (startDate) query = query.gte('week_start', startDate);
        if (endDate) query = query.lte('week_start', endDate);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    // Get earnings for all auxiliaries supervised by a master
    async getAuxiliaryEarnings(masterId, startDate = null, endDate = null) {
        if (DEMO_MODE || !supabase) {
            let earnings = DEMO_EARNINGS.filter(e => e.supervisor_id === masterId);
            if (startDate) {
                earnings = earnings.filter(e => new Date(e.week_start) >= new Date(startDate));
            }
            if (endDate) {
                earnings = earnings.filter(e => new Date(e.week_start) <= new Date(endDate));
            }

            // Group by mechanic
            const grouped = {};
            earnings.forEach(e => {
                if (!grouped[e.mechanic_id]) {
                    const mechanic = DEMO_USERS.find(u => u.id === e.mechanic_id);
                    grouped[e.mechanic_id] = {
                        mechanic_id: e.mechanic_id,
                        mechanic_name: mechanic?.full_name || 'Desconocido',
                        total_labor: 0,
                        total_earned: 0,
                        orders_count: 0
                    };
                }
                grouped[e.mechanic_id].total_labor += e.labor_amount;
                grouped[e.mechanic_id].total_earned += e.earned_amount;
                grouped[e.mechanic_id].orders_count += 1;
            });

            return Object.values(grouped);
        }

        const { data, error } = await supabase
            .from('mechanic_earnings')
            .select(`
                *,
                mechanic:profiles!mechanic_earnings_mechanic_id_fkey(id, full_name)
            `)
            .eq('supervisor_id', masterId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by mechanic
        const grouped = {};
        data?.forEach(e => {
            if (!grouped[e.mechanic_id]) {
                grouped[e.mechanic_id] = {
                    mechanic_id: e.mechanic_id,
                    mechanic_name: e.mechanic?.full_name || 'Desconocido',
                    total_labor: 0,
                    total_earned: 0,
                    orders_count: 0
                };
            }
            grouped[e.mechanic_id].total_labor += parseFloat(e.labor_amount) || 0;
            grouped[e.mechanic_id].total_earned += parseFloat(e.earned_amount) || 0;
            grouped[e.mechanic_id].orders_count += 1;
        });

        return Object.values(grouped);
    },

    // Get weekly summary
    async getWeeklySummary(mechanicId) {
        const weekStart = getWeekStart(new Date());

        if (DEMO_MODE || !supabase) {
            const earnings = DEMO_EARNINGS.filter(e =>
                e.mechanic_id === mechanicId &&
                e.week_start === weekStart.toISOString().split('T')[0]
            );

            return {
                week_start: weekStart.toISOString().split('T')[0],
                total_labor: earnings.reduce((sum, e) => sum + e.labor_amount, 0),
                total_earned: earnings.reduce((sum, e) => sum + e.earned_amount, 0),
                orders_count: earnings.length,
                unpaid_total: earnings.filter(e => !e.is_paid).reduce((sum, e) => sum + e.earned_amount, 0)
            };
        }

        const { data, error } = await supabase
            .from('mechanic_earnings')
            .select('*')
            .eq('mechanic_id', mechanicId)
            .eq('week_start', weekStart.toISOString().split('T')[0]);

        if (error) throw error;

        const earnings = data || [];
        return {
            week_start: weekStart.toISOString().split('T')[0],
            total_labor: earnings.reduce((sum, e) => sum + (parseFloat(e.labor_amount) || 0), 0),
            total_earned: earnings.reduce((sum, e) => sum + (parseFloat(e.earned_amount) || 0), 0),
            orders_count: earnings.length,
            unpaid_total: earnings.filter(e => !e.is_paid).reduce((sum, e) => sum + (parseFloat(e.earned_amount) || 0), 0)
        };
    },

    // Mark earnings as paid
    async markAsPaid(earningIds) {
        if (DEMO_MODE || !supabase) {
            earningIds.forEach(id => {
                const earning = DEMO_EARNINGS.find(e => e.id === id);
                if (earning) {
                    earning.is_paid = true;
                    earning.paid_at = new Date().toISOString();
                }
            });
            return true;
        }

        const { error } = await supabase
            .from('mechanic_earnings')
            .update({
                is_paid: true,
                paid_at: new Date().toISOString()
            })
            .in('id', earningIds);

        if (error) throw error;
        return true;
    }
};

// Helper function to get start of week (Monday)
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

// =============================================
// PAYMENT REQUESTS SERVICE (Master → Auxiliary payments)
// =============================================

export const paymentRequestsService = {
    // Master creates a payment request for an auxiliary
    async create(paymentData) {
        if (DEMO_MODE || !supabase) {
            const master = DEMO_USERS.find(u => u.id === paymentData.from_master_id);
            const auxiliary = DEMO_USERS.find(u => u.id === paymentData.to_auxiliary_id);
            const newPayment = {
                id: `payment-${Date.now()}`,
                from_master_id: paymentData.from_master_id,
                master_name: master?.full_name || 'Maestro',
                to_auxiliary_id: paymentData.to_auxiliary_id,
                auxiliary_name: auxiliary?.full_name || 'Auxiliar',
                total_amount: paymentData.total_amount,
                labor_amount: paymentData.labor_amount,
                commission_percentage: paymentData.commission_percentage || 50,
                orders_summary: paymentData.orders_summary,
                earning_ids: paymentData.earning_ids,
                status: 'pending',
                notes: paymentData.notes || '',
                created_at: new Date().toISOString()
            };
            DEMO_PAYMENT_REQUESTS.push(newPayment);
            return newPayment;
        }

        // 1. VITAL: Asegurar que TODAS las órdenes en el resumen tengan un registro de ganancia
        const finalEarningIds = [...(paymentData.earning_ids || [])];
        const ordersSummary = [...(paymentData.orders_summary || [])];

        for (let i = 0; i < ordersSummary.length; i++) {
            const orderItem = ordersSummary[i];
            if (!orderItem.earning_id) {
                console.log(`🔧 Generando registro de comisión faltante para orden #${orderItem.order_number}`);
                try {
                    // Crear el registro de ganancia si no existe
                    const newEarning = await earningsService.recordEarning(
                        { id: orderItem.id, labor_total: orderItem.labor_amount },
                        paymentData.to_auxiliary_id,
                        paymentData.from_master_id
                    );

                    if (newEarning && newEarning.id) {
                        if (!finalEarningIds.includes(newEarning.id)) {
                            finalEarningIds.push(newEarning.id);
                        }
                        // Actualizar el objeto en el resumen para persistirlo en el JSON de la solicitud
                        ordersSummary[i] = { ...orderItem, earning_id: newEarning.id };
                    }
                } catch (e) {
                    console.error('❌ Error reparando registro de comisión:', e);
                }
            }
        }

        const { data, error } = await supabase
            .from('payment_requests')
            .insert({
                from_master_id: paymentData.from_master_id,
                to_auxiliary_id: paymentData.to_auxiliary_id,
                total_amount: paymentData.total_amount,
                labor_amount: paymentData.labor_amount,
                orders_summary: ordersSummary,
                earning_ids: finalEarningIds,
                status: 'pending',
                notes: paymentData.notes || ''
            })
            .select()
            .single();

        if (error) throw error;

        // 2. VITAL: Vincular formalmente los registros de ganancia con esta solicitud de pago
        if (finalEarningIds.length > 0) {
            console.log(`🔗 Vinculando ${finalEarningIds.length} comisiones al pago ${data.id}`);
            const { error: linkError } = await supabase
                .from('mechanic_earnings')
                .update({ payment_request_id: data.id })
                .in('id', finalEarningIds);

            if (linkError) console.error('❌ Error vinculando comisiones:', linkError);
        }

        return data;
    },

    // Auxiliary accepts a payment
    async accept(paymentId, auxiliaryId) {
        if (DEMO_MODE || !supabase) {
            const payment = DEMO_PAYMENT_REQUESTS.find(p => p.id === paymentId);
            if (payment) {
                payment.status = 'accepted';
                payment.responded_at = new Date().toISOString();

                if (payment.earning_ids?.length) {
                    await earningsService.markAsPaid(payment.earning_ids);
                }
            }
            return payment;
        }

        // 1. Update Payment Status
        const { data, error } = await supabase
            .from('payment_requests')
            .update({
                status: 'accepted',
                responded_at: new Date().toISOString()
            })
            .eq('id', paymentId)
            .eq('to_auxiliary_id', auxiliaryId)
            .select()
            .single();

        if (error) throw error;

        // 2. Mark linked earnings as paid
        // Usamos tanto los IDs enviados como cualquier registro vinculado formalmente en la DB
        const { error: markError } = await supabase
            .from('mechanic_earnings')
            .update({
                is_paid: true,
                paid_at: new Date().toISOString()
            })
            .eq('payment_request_id', paymentId);

        if (markError) {
            console.error('❌ Error marcando ganancias como pagadas por ID de pago:', markError);
            // Fallback a los IDs individuales si el vínculo falló
            if (data.earning_ids?.length) {
                await earningsService.markAsPaid(data.earning_ids);
            }
        }

        return data;
    },

    // Get pending payments for an auxiliary
    async getPendingForAuxiliary(auxiliaryId) {
        if (DEMO_MODE || !supabase) {
            const payments = DEMO_PAYMENT_REQUESTS.filter(p =>
                p.to_auxiliary_id === auxiliaryId && p.status === 'pending'
            );
            // Enrich with profile objects for consistency with Supabase response
            return payments.map(p => ({
                ...p,
                master: { id: p.from_master_id, full_name: p.master_name },
                auxiliary: { id: p.to_auxiliary_id, full_name: p.auxiliary_name }
            }));
        }

        const { data, error } = await supabase
            .from('payment_requests')
            .select(`
                *,
                master:profiles!payment_requests_from_master_id_fkey(id, full_name),
                auxiliary:profiles!payment_requests_to_auxiliary_id_fkey(id, full_name)
            `)
            .eq('to_auxiliary_id', auxiliaryId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // Get payment history for an auxiliary
    async getHistoryForAuxiliary(auxiliaryId) {
        if (DEMO_MODE || !supabase) {
            const payments = DEMO_PAYMENT_REQUESTS.filter(p =>
                p.to_auxiliary_id === auxiliaryId && p.status === 'accepted'
            );
            return payments.map(p => ({
                ...p,
                master: { id: p.from_master_id, full_name: p.master_name },
                auxiliary: { id: p.to_auxiliary_id, full_name: p.auxiliary_name }
            }));
        }

        const { data, error } = await supabase
            .from('payment_requests')
            .select(`
                *,
                master:profiles!payment_requests_from_master_id_fkey(id, full_name),
                auxiliary:profiles!payment_requests_to_auxiliary_id_fkey(id, full_name)
            `)
            .eq('to_auxiliary_id', auxiliaryId)
            .eq('status', 'accepted')
            .order('responded_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // Get payment history for a master
    async getHistoryForMaster(masterId) {
        if (DEMO_MODE || !supabase) {
            const payments = DEMO_PAYMENT_REQUESTS.filter(p =>
                p.from_master_id === masterId
            );
            return payments.map(p => ({
                ...p,
                master: { id: p.from_master_id, full_name: p.master_name },
                auxiliary: { id: p.to_auxiliary_id, full_name: p.auxiliary_name }
            }));
        }

        const { data, error } = await supabase
            .from('payment_requests')
            .select(`
                *,
                auxiliary:profiles!payment_requests_to_auxiliary_id_fkey(id, full_name)
            `)
            .eq('from_master_id', masterId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // Get pending payment count for badge
    async getPendingCount(auxiliaryId) {
        if (DEMO_MODE || !supabase) {
            return DEMO_PAYMENT_REQUESTS.filter(p =>
                p.to_auxiliary_id === auxiliaryId && p.status === 'pending'
            ).length;
        }

        const { count, error } = await supabase
            .from('payment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('to_auxiliary_id', auxiliaryId)
            .eq('status', 'pending');

        if (error) throw error;
        return count || 0;
    }
};

export { supabase };
export default supabase;


