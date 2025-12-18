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
        is_active: true
    },
    {
        id: 'demo-mech-001',
        email: 'mecanico@motopartes.com',
        password_hash: 'mech123',
        full_name: 'Juan Mecánico',
        phone: '5559876543',
        role: 'mechanic',
        commission_percentage: 15,
        is_active: true
    }
];

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

        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
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
                mechanic:profiles!orders_mechanic_id_fkey(id, full_name, commission_percentage),
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
        const laborTotal = services.reduce((sum, s) => sum + (parseFloat(s.labor_cost) || 0), 0);
        const partsTotal = services.reduce((sum, s) => sum + (parseFloat(s.materials_cost) || 0), 0);
        const totalAmount = services.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);

        if (DEMO_MODE || !supabase) {
            orderNumber = `OS-${currentYear}-${String(DEMO_ORDERS.length + 1).padStart(4, '0')}`;
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
            .ilike('order_number', `OS-${currentYear}-%`)
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
        orderNumber = `OS-${currentYear}-${String(sequence).padStart(4, '0')}`;

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
                client_link: `/orden/${publicToken}`
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
                price: s.price
                // labor_cost & materials_cost omitted as cols don't exist yet in order_services
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

        const { error } = await supabase
            .from('orders')
            .delete()
            .eq('id', orderId);

        if (error) throw error;
        return true;
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

export { supabase };
export default supabase;
