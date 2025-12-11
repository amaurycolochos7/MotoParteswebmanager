import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { generatePublicToken, generateClientLink } from '../utils/tokenGenerator';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);

const STORAGE_KEYS = {
    clients: 'motopartes_clients',
    motorcycles: 'motopartes_motorcycles',
    orders: 'motopartes_orders',
    services: 'motopartes_services',
    statuses: 'motopartes_statuses',
    serviceUpdates: 'motopartes_service_updates',
    appointments: 'motopartes_appointments',
    quotations: 'motopartes_quotations',
};

// Default service catalog
const DEFAULT_SERVICES = [
    { id: 'svc-001', name: 'Servicio Completo', description: 'Revisión general de la moto', price: 500, category: 'mantenimiento', is_active: true, display_order: 1 },
    { id: 'svc-002', name: 'Cambio de Aceite', description: 'Cambio de aceite de motor', price: 250, category: 'mantenimiento', is_active: true, display_order: 2 },
    { id: 'svc-003', name: 'Afinación', description: 'Afinación completa del motor', price: 800, category: 'motor', is_active: true, display_order: 3 },
    { id: 'svc-004', name: 'Frenos', description: 'Revisión y ajuste de frenos', price: 400, category: 'frenos', is_active: true, display_order: 4 },
    { id: 'svc-005', name: 'Sistema Eléctrico', description: 'Diagnóstico y reparación eléctrica', price: 350, category: 'electrico', is_active: true, display_order: 5 },
    { id: 'svc-006', name: 'Cambio de Llantas', description: 'Cambio de llantas delanteras o traseras', price: 150, category: 'general', is_active: true, display_order: 6 },
    { id: 'svc-007', name: 'Suspensión', description: 'Revisión y ajuste de suspensión', price: 450, category: 'suspension', is_active: true, display_order: 7 },
    { id: 'svc-008', name: 'Cadena y Sprockets', description: 'Limpieza, lubricación o cambio', price: 200, category: 'general', is_active: true, display_order: 8 },
];

// Default order statuses
const DEFAULT_STATUSES = [
    { id: 'status-001', name: 'Registrada', description: 'Orden recién creada, pendiente de revisión', color: '#00d4ff', display_order: 1, is_active: true },
    { id: 'status-002', name: 'En Revisión', description: 'Mecánico revisando la motocicleta', color: '#ffd700', display_order: 2, is_active: true },
    { id: 'status-003', name: 'En Reparación', description: 'Trabajo en progreso', color: '#9966ff', display_order: 3, is_active: true },
    { id: 'status-004', name: 'Lista para Entregar', description: 'Trabajo terminado, esperando al cliente', color: '#00ff88', display_order: 4, is_active: true },
    { id: 'status-005', name: 'Entregada', description: 'Orden finalizada y entregada al cliente', color: '#00cc6a', display_order: 5, is_active: true },
];

// Demo data
const DEMO_CLIENTS = [
    { id: 'client-001', phone: '5512345678', full_name: 'Juan Pérez', email: 'juan@email.com', notes: 'Cliente frecuente', created_at: new Date().toISOString() },
    { id: 'client-002', phone: '5598765432', full_name: 'María García', email: '', notes: 'Prefiere pago con tarjeta', created_at: new Date().toISOString() },
];

const DEMO_MOTORCYCLES = [
    { id: 'moto-001', client_id: 'client-001', brand: 'Honda', model: 'CB500X', year: 2022, plates: 'ABC123', color: 'Rojo', mileage: 15000, notes: '', created_at: new Date().toISOString() },
    { id: 'moto-002', client_id: 'client-001', brand: 'Yamaha', model: 'MT-07', year: 2021, plates: 'XYZ789', color: 'Negro', mileage: 8500, notes: 'Escape deportivo', created_at: new Date().toISOString() },
    { id: 'moto-003', client_id: 'client-002', brand: 'Italika', model: 'FT150', year: 2023, plates: 'DEF456', color: 'Azul', mileage: 2000, notes: '', created_at: new Date().toISOString() },
];

function loadFromStorage(key, defaultValue) {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error(`Error loading ${key} from storage:`, e);
    }
    return defaultValue;
}

function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Error saving ${key} to storage:`, e);
    }
}

export function DataProvider({ children }) {
    // Initialize with proper defaults and migrate old data
    const [clients, setClients] = useState(() => loadFromStorage(STORAGE_KEYS.clients, DEMO_CLIENTS));
    const [motorcycles, setMotorcycles] = useState(() => loadFromStorage(STORAGE_KEYS.motorcycles, DEMO_MOTORCYCLES));
    const [orders, setOrders] = useState(() => loadFromStorage(STORAGE_KEYS.orders, []));
    const [services, setServices] = useState(() => loadFromStorage(STORAGE_KEYS.services, DEFAULT_SERVICES));

    // Special handling for statuses - ensure they all have description
    const [statuses, setStatuses] = useState(() => {
        const loaded = loadFromStorage(STORAGE_KEYS.statuses, DEFAULT_STATUSES);
        // Check if any status is missing description
        const needsMigration = loaded.some(s => !s.description);
        if (needsMigration) {
            console.log('🔧 Migrating statuses to add descriptions...');
            // Force reload with defaults
            saveToStorage(STORAGE_KEYS.statuses, DEFAULT_STATUSES);
            return DEFAULT_STATUSES;
        }
        return loaded;
    });

    const [serviceUpdates, setServiceUpdates] = useState(() => loadFromStorage(STORAGE_KEYS.serviceUpdates, []));
    const [appointments, setAppointments] = useState(() => loadFromStorage(STORAGE_KEYS.appointments, []));
    const [quotations, setQuotations] = useState(() => loadFromStorage(STORAGE_KEYS.quotations, []));

    // Track if migration has run
    const migrationRan = useRef(false);

    // Persist data changes
    useEffect(() => { saveToStorage(STORAGE_KEYS.clients, clients); }, [clients]);
    useEffect(() => { saveToStorage(STORAGE_KEYS.motorcycles, motorcycles); }, [motorcycles]);
    useEffect(() => { saveToStorage(STORAGE_KEYS.orders, orders); }, [orders]);
    useEffect(() => { saveToStorage(STORAGE_KEYS.services, services); }, [services]);
    useEffect(() => { saveToStorage(STORAGE_KEYS.statuses, statuses); }, [statuses]);
    useEffect(() => { saveToStorage(STORAGE_KEYS.serviceUpdates, serviceUpdates); }, [serviceUpdates]);
    useEffect(() => { saveToStorage(STORAGE_KEYS.appointments, appointments); }, [appointments]);
    useEffect(() => { saveToStorage(STORAGE_KEYS.quotations, quotations); }, [quotations]);

    // Real-time synchronization across tabs/windows
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === STORAGE_KEYS.orders && e.newValue) {
                try {
                    const updatedOrders = JSON.parse(e.newValue);
                    console.log('🔄 Real-time update: Orders changed in another tab', updatedOrders.length);
                    setOrders(updatedOrders);
                } catch (error) {
                    console.error('Error parsing storage update:', error);
                }
            }
            if (e.key === STORAGE_KEYS.serviceUpdates && e.newValue) {
                try {
                    const updatedServiceUpdates = JSON.parse(e.newValue);
                    console.log('🔄 Real-time update: Service updates changed');
                    setServiceUpdates(updatedServiceUpdates);
                } catch (error) {
                    console.error('Error parsing storage update:', error);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // Migration: Remove "Autorización Pendiente" status completely
    useEffect(() => {
        // Clean statuses
        const hasOldStatus = statuses.some(s => s.name === 'Autorización Pendiente');
        if (hasOldStatus) {
            console.log('🧹 Removing "Autorización Pendiente" status from system...');
            const cleanedStatuses = statuses.filter(s => s.name !== 'Autorización Pendiente');
            setStatuses(cleanedStatuses);

            // Update any orders with that status to "En Revisión"
            const ordersWithOldStatus = orders.filter(o => o.status === 'Autorización Pendiente');
            if (ordersWithOldStatus.length > 0) {
                console.log(`🔧 Updating ${ordersWithOldStatus.length} orders with old status...`);
                const updatedOrders = orders.map(order => {
                    if (order.status === 'Autorización Pendiente') {
                        return {
                            ...order,
                            status: 'En Revisión',
                            updated_at: new Date().toISOString()
                        };
                    }
                    return order;
                });
                setOrders(updatedOrders);
            }
            console.log('✅ Migration complete: "Autorización Pendiente" removed');
        }
    }, []); // Run only once on mount

    // Migration: Generate client_link for old orders that don't have it
    useEffect(() => {
        if (migrationRan.current) return; // Only run once

        const ordersNeedingLinks = orders.filter(o => !o.client_link || !o.public_token);

        if (ordersNeedingLinks.length > 0) {
            console.log(`🔧 Migrating ${ordersNeedingLinks.length} orders to add client links...`);

            const updatedOrders = orders.map(order => {
                if (!order.client_link || !order.public_token) {
                    const publicToken = order.public_token || generatePublicToken();
                    const clientLink = generateClientLink(publicToken);

                    return {
                        ...order,
                        public_token: publicToken,
                        client_link: clientLink
                    };
                }
                return order;
            });

            setOrders(updatedOrders);
            migrationRan.current = true;
            console.log('✅ Migration complete: All orders now have client links');
        } else {
            migrationRan.current = true;
        }
    }, [orders]);

    // Client functions
    const findClientByPhone = useCallback((phone) => {
        const normalized = phone.replace(/\D/g, '');
        return clients.find(c => c.phone.replace(/\D/g, '') === normalized);
    }, [clients]);

    const addClient = useCallback((clientData) => {
        const newClient = {
            id: `client-${Date.now()}`,
            ...clientData,
            created_at: new Date().toISOString(),
        };
        setClients(prev => [...prev, newClient]);
        return newClient;
    }, []);

    const updateClient = useCallback((id, data) => {
        setClients(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    }, []);

    const deleteClient = useCallback((id) => {
        setClients(prev => prev.filter(c => c.id !== id));
        // Also delete client's motorcycles
        setMotorcycles(prev => prev.filter(m => m.client_id !== id));
    }, []);

    // Motorcycle functions
    const getClientMotorcycles = useCallback((clientId) => {
        return motorcycles.filter(m => m.client_id === clientId);
    }, [motorcycles]);

    const addMotorcycle = useCallback((motoData) => {
        const newMoto = {
            id: `moto-${Date.now()}`,
            ...motoData,
            created_at: new Date().toISOString(),
        };
        setMotorcycles(prev => [...prev, newMoto]);
        return newMoto;
    }, []);

    const updateMotorcycle = useCallback((id, data) => {
        setMotorcycles(prev => prev.map(m => m.id === id ? { ...m, ...data } : m));
    }, []);

    const deleteMotorcycle = useCallback((id) => {
        setMotorcycles(prev => prev.filter(m => m.id !== id));
    }, []);

    // Order functions
    const generateOrderNumber = useCallback(() => {
        const year = new Date().getFullYear();
        const count = orders.filter(o => o.order_number?.includes(year.toString())).length + 1;
        return `OS-${year}-${count.toString().padStart(4, '0')}`;
    }, [orders]);

    const addOrder = useCallback((orderData) => {
        const publicToken = generatePublicToken();
        const clientLink = generateClientLink(publicToken);

        const newOrder = {
            id: `order-${Date.now()}`,
            order_number: generateOrderNumber(),
            ...orderData,
            public_token: publicToken,
            client_link: clientLink,
            client_last_seen_at: null,
            link_sent_at: null,
            photos: [], // Gallery de fotos (before/after/evidence)
            status: statuses[0]?.name || 'Registrada',
            is_paid: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            history: [
                {
                    id: `hist-${Date.now()}`,
                    changed_by: orderData.mechanic_id,
                    old_status: null,
                    new_status: statuses[0]?.name || 'Registrada',
                    notes: 'Orden creada',
                    changed_at: new Date().toISOString(),
                },
            ],
        };
        setOrders(prev => [...prev, newOrder]);
        return newOrder;
    }, [generateOrderNumber, statuses]);

    const updateOrder = useCallback((id, data) => {
        setOrders(prev => prev.map(o => {
            if (o.id === id) {
                return { ...o, ...data, updated_at: new Date().toISOString() };
            }
            return o;
        }));
    }, []);

    const updateOrderStatus = useCallback((orderId, newStatus, userId, notes = '') => {
        setOrders(prev => {
            const updatedOrders = prev.map(o => {
                if (o.id === orderId) {
                    const historyEntry = {
                        id: `hist-${Date.now()}`,
                        changed_by: userId,
                        old_status: o.status,
                        new_status: newStatus,
                        notes,
                        changed_at: new Date().toISOString(),
                    };

                    console.log('🔄 Updating order status:', {
                        orderId,
                        oldStatus: o.status,
                        newStatus,
                        timestamp: new Date().toISOString()
                    });

                    return {
                        ...o,
                        status: newStatus,
                        updated_at: new Date().toISOString(),
                        history: [...(o.history || []), historyEntry],
                    };
                }
                return o;
            });

            // Explicitly save to localStorage
            console.log('💾 Saving orders to localStorage', updatedOrders.length);
            saveToStorage(STORAGE_KEYS.orders, updatedOrders);

            return updatedOrders;
        });
    }, []);

    const deleteOrder = useCallback((orderId) => {
        setOrders(prev => {
            const updated = prev.filter(o => o.id !== orderId);
            console.log('🗑️ Deleting order:', orderId);
            saveToStorage(STORAGE_KEYS.orders, updated);
            return updated;
        });
        // Also delete related service updates
        setServiceUpdates(prev => prev.filter(u => u.order_id !== orderId));
    }, []);

    const getMechanicOrders = useCallback((mechanicId) => {
        return orders.filter(o => o.mechanic_id === mechanicId);
    }, [orders]);

    const getActiveOrders = useCallback((mechanicId) => {
        const deliveredStatus = statuses.find(s => s.name === 'Entregada')?.name;
        return orders.filter(o =>
            o.mechanic_id === mechanicId &&
            o.status !== deliveredStatus
        );
    }, [orders, statuses]);

    const getTodayOrders = useCallback((mechanicId) => {
        const today = new Date().toDateString();
        return orders.filter(o =>
            o.mechanic_id === mechanicId &&
            new Date(o.created_at).toDateString() === today
        );
    }, [orders]);

    const getTodayStats = useCallback((mechanicId) => {
        const todayOrders = getTodayOrders(mechanicId);
        const completedOrders = todayOrders.filter(o =>
            o.status === 'Lista para Entregar' || o.status === 'Entregada'
        );
        const totalCollected = todayOrders
            .filter(o => o.is_paid)
            .reduce((sum, o) => sum + (o.total_amount || 0), 0);

        return {
            totalOrders: todayOrders.length,
            completedOrders: completedOrders.length,
            totalCollected,
        };
    }, [getTodayOrders]);

    // Service catalog functions
    const addService = useCallback((serviceData) => {
        const newService = {
            id: `svc-${Date.now()}`,
            ...serviceData,
            is_active: true,
            display_order: services.length + 1,
        };
        setServices(prev => [...prev, newService]);
        return newService;
    }, [services]);

    const updateService = useCallback((id, data) => {
        setServices(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    }, []);

    const deleteService = useCallback((id) => {
        setServices(prev => prev.filter(s => s.id !== id));
    }, []);

    // Service Updates functions
    const getOrderUpdates = useCallback((orderId) => {
        return serviceUpdates.filter(u => u.order_id === orderId);
    }, [serviceUpdates]);

    const addServiceUpdate = useCallback((updateData) => {
        const newUpdate = {
            id: `update-${Date.now()}`,
            ...updateData,
            authorization_status: updateData.requires_authorization ? 'pending' : null,
            created_at: new Date().toISOString(),
            client_responded_at: null,
        };
        setServiceUpdates(prev => [...prev, newUpdate]);
        return newUpdate;
    }, []);

    const updateServiceUpdateAuth = useCallback((updateId, authStatus) => {
        setServiceUpdates(prev => prev.map(u => {
            if (u.id === updateId) {
                // Calculate new order total when authorization changes
                const update = prev.find(u => u.id === updateId);
                if (update) {
                    const order = orders.find(o => o.id === update.order_id);
                    if (order) {
                        // Recalculate total
                        const servicesTotal = order.services.reduce((sum, svc) => sum + (svc.price || 0), 0);
                        const approvedUpdatesTotal = prev
                            .filter(u => u.order_id === order.id &&
                                (u.id === updateId ? authStatus === 'approved' : u.authorization_status === 'approved'))
                            .reduce((sum, u) => sum + (u.estimated_price || 0), 0);

                        updateOrder(order.id, { total_amount: servicesTotal + approvedUpdatesTotal });
                    }
                }

                return {
                    ...u,
                    authorization_status: authStatus,
                    client_responded_at: new Date().toISOString(),
                };
            }
            return u;
        }));
    }, [orders, updateOrder]);

    // Appointment functions
    const addAppointment = useCallback((appointmentData) => {
        const newAppointment = {
            id: `appt-${Date.now()}`,
            ...appointmentData,
            status: 'scheduled',
            reminder_sent: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setAppointments(prev => [...prev, newAppointment]);
        return newAppointment;
    }, []);

    const updateAppointment = useCallback((id, data) => {
        setAppointments(prev => prev.map(a =>
            a.id === id ? { ...a, ...data, updated_at: new Date().toISOString() } : a
        ));
    }, []);

    const deleteAppointment = useCallback((id) => {
        setAppointments(prev => prev.filter(a => a.id !== id));
    }, []);

    const getAppointmentsByDate = useCallback((date) => {
        const dateStr = new Date(date).toDateString();
        return appointments.filter(a => new Date(a.scheduled_date).toDateString() === dateStr);
    }, [appointments]);

    const getMechanicAppointments = useCallback((mechanicId, date = null) => {
        let filtered = appointments.filter(a => a.assigned_mechanic_id === mechanicId);
        if (date) {
            const dateStr = new Date(date).toDateString();
            filtered = filtered.filter(a => new Date(a.scheduled_date).toDateString() === dateStr);
        }
        return filtered.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));
    }, [appointments]);

    const getUpcomingReminders = useCallback(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toDateString();

        return appointments.filter(a =>
            !a.reminder_sent &&
            a.status === 'scheduled' &&
            new Date(a.scheduled_date).toDateString() === tomorrowStr
        );
    }, [appointments]);

    // Quotation functions
    const addQuotation = useCallback((quotationData) => {
        const quotationNumber = `COT-${new Date().getFullYear()}-${String(quotations.length + 1).padStart(4, '0')}`;

        const newQuotation = {
            id: `quote-${Date.now()}`,
            quotation_number: quotationNumber,
            ...quotationData,
            status: 'pending', // 'pending' | 'approved' | 'rejected' | 'expired'
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        };
        setQuotations(prev => [...prev, newQuotation]);
        return newQuotation;
    }, [quotations.length]);

    const updateQuotation = useCallback((id, data) => {
        setQuotations(prev => prev.map(q =>
            q.id === id ? { ...q, ...data, updated_at: new Date().toISOString() } : q
        ));
    }, []);

    const deleteQuotation = useCallback((id) => {
        setQuotations(prev => prev.filter(q => q.id !== id));
    }, []);

    const changeQuotationStatus = useCallback((id, newStatus, notes = '') => {
        setQuotations(prev => prev.map(q => {
            if (q.id === id) {
                return {
                    ...q,
                    status: newStatus,
                    status_changed_at: new Date().toISOString(),
                    status_notes: notes,
                    updated_at: new Date().toISOString()
                };
            }
            return q;
        }));
    }, []);

    const convertQuotationToOrder = useCallback((quotationId) => {
        const quotation = quotations.find(q => q.id === quotationId);
        if (!quotation || quotation.status !== 'approved') {
            return null;
        }

        // Create order from quotation
        const orderData = {
            client_id: quotation.client_id,
            motorcycle_id: quotation.motorcycle_id,
            services: quotation.services,
            customer_complaint: quotation.description,
            advance_payment: 0,
            total_amount: quotation.total_amount,
            mechanic_id: quotation.created_by,
            quotation_id: quotationId,
        };

        const newOrder = addOrder(orderData);

        // Mark quotation as converted
        updateQuotation(quotationId, {
            converted_to_order_id: newOrder.id,
            converted_at: new Date().toISOString()
        });

        return newOrder;
    }, [quotations, addOrder, updateQuotation]);

    const getClientQuotations = useCallback((clientId) => {
        return quotations.filter(q => q.client_id === clientId)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [quotations]);

    // Earnings calculation functions (labor commission only)
    const { users } = useAuth();

    const getMechanicEarnings = useCallback((mechanicId, startDate = null, endDate = null) => {
        // Get mechanic's commission percentage
        const mechanic = users?.find(u => u.id === mechanicId);
        const commissionRate = (mechanic?.commission_percentage || 10) / 100;

        // Filter orders by mechanic, paid status, and date range
        let mechanicOrders = orders.filter(o =>
            o.mechanic_id === mechanicId &&
            o.is_paid === true
        );

        if (startDate) {
            mechanicOrders = mechanicOrders.filter(o =>
                new Date(o.created_at) >= new Date(startDate)
            );
        }

        if (endDate) {
            mechanicOrders = mechanicOrders.filter(o =>
                new Date(o.created_at) <= new Date(endDate)
            );
        }

        // Calculate labor total (sum of all services - this is mano de obra)
        const laborTotal = mechanicOrders.reduce((sum, order) => {
            const orderLaborTotal = order.services?.reduce((svcSum, svc) =>
                svcSum + (svc.price || 0), 0
            ) || 0;
            return sum + orderLaborTotal;
        }, 0);

        const mechanicEarnings = laborTotal * commissionRate;

        return {
            laborTotal,
            mechanicEarnings,
            commissionRate: commissionRate * 100,
            orderCount: mechanicOrders.length,
            orders: mechanicOrders
        };
    }, [orders, users]);

    const getTodayEarnings = useCallback((mechanicId) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return getMechanicEarnings(mechanicId, today);
    }, [getMechanicEarnings]);

    const getWeekEarnings = useCallback((mechanicId) => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return getMechanicEarnings(mechanicId, weekAgo);
    }, [getMechanicEarnings]);

    const getMonthEarnings = useCallback((mechanicId) => {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return getMechanicEarnings(mechanicId, monthAgo);
    }, [getMechanicEarnings]);

    const value = {
        // Data
        clients,
        motorcycles,
        orders,
        services,
        statuses,
        serviceUpdates,
        appointments,
        quotations,
        // Client functions
        findClientByPhone,
        addClient,
        updateClient,
        deleteClient,
        // Motorcycle functions
        getClientMotorcycles,
        addMotorcycle,
        updateMotorcycle,
        deleteMotorcycle,
        // Order functions
        addOrder,
        updateOrder,
        updateOrderStatus,
        deleteOrder,
        getMechanicOrders,
        getActiveOrders,
        getTodayOrders,
        getTodayStats,
        // Service functions
        addService,
        updateService,
        deleteService,
        // Service Update functions
        getOrderUpdates,
        addServiceUpdate,
        updateServiceUpdateAuth,
        // Appointment functions
        addAppointment,
        updateAppointment,
        deleteAppointment,
        getAppointmentsByDate,
        getMechanicAppointments,
        getUpcomingReminders,
        // Quotation functions
        addQuotation,
        updateQuotation,
        deleteQuotation,
        changeQuotationStatus,
        convertQuotationToOrder,
        getClientQuotations,
        // Earnings functions
        getMechanicEarnings,
        getTodayEarnings,
        getWeekEarnings,
        getMonthEarnings,
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}

export default DataContext;
