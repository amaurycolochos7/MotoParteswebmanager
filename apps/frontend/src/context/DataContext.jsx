import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
    clientsService,
    motorcyclesService,
    ordersService,
    servicesService,
    statusesService,
    statsService,
    orderUpdatesService,
    earningsService,
    authService
} from '../lib/api';

const DataContext = createContext(null);

export function DataProvider({ children }) {
    const { user, isAdmin, hasPermission } = useAuth();

    // Estados
    const [clients, setClients] = useState([]);
    const [orders, setOrders] = useState([]);
    const [services, setServices] = useState([]);
    const [statuses, setStatuses] = useState([]);
    const [serviceUpdates, setServiceUpdates] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Cargar datos iniciales
    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Cargar datos en paralelo
                const [clientsRes, servicesRes, statusesRes, updatesRes, usersRes] = await Promise.all([
                    clientsService.getAll(),
                    servicesService.getAll(),
                    statusesService.getAll(),
                    orderUpdatesService.getAll(),
                    authService.getAllUsers()
                ]);

                if (clientsRes.error) console.error('Error clients:', clientsRes.error);
                if (servicesRes.error) console.error('Error services:', servicesRes.error);

                setClients(clientsRes.data || []);
                setServices(servicesRes.data || []);
                setStatuses(statusesRes.data || []);
                setServiceUpdates(updatesRes.data || []);
                setUsers(usersRes.data || []);

                // Cargar órdenes según rol
                let ordersRes;
                if (hasPermission('canViewAllOrders')) {
                    ordersRes = await ordersService.getAll();
                } else {
                    ordersRes = await ordersService.getByMechanic(user.id);
                }
                setOrders(ordersRes.data || []);

            } catch (err) {
                console.error('Error loading data:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [user, hasPermission]);

    // =============================================
    // CLIENTES
    // =============================================
    const refreshClients = useCallback(async () => {
        try {
            const { data, error } = await clientsService.getAll();
            if (error) throw error;
            setClients(data || []);
        } catch (err) {
            console.error('Error refreshing clients:', err);
        }
    }, []);

    const addClient = useCallback(async (clientData) => {
        const { data: newClient, error } = await clientsService.create(clientData, user?.id);
        if (error) throw error;
        setClients(prev => prev ? [newClient, ...prev] : [newClient]);
        return newClient;
    }, [user]);

    const updateClient = useCallback(async (id, updates) => {
        const { data: updated, error } = await clientsService.update(id, updates);
        if (error) throw error;
        setClients(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
        return updated;
    }, []);

    const deleteClient = useCallback(async (id) => {
        const { error } = await clientsService.delete(id);
        if (error) throw error;
        setClients(prev => prev.filter(c => c.id !== id));
    }, []);

    const findClientByPhone = useCallback((phone) => {
        const normalized = phone.replace(/\D/g, '');
        return clients.find(c => c.phone.replace(/\D/g, '') === normalized);
    }, [clients]);

    const searchClients = useCallback((query) => {
        if (!query || query.trim().length < 2) return [];
        const q = query.toLowerCase().trim();
        const phoneQuery = query.replace(/\D/g, '');

        return clients.filter(c =>
            c.full_name?.toLowerCase().includes(q) ||
            (phoneQuery.length >= 3 && c.phone?.replace(/\D/g, '').includes(phoneQuery))
        ).slice(0, 10); // Limit to 10 results
    }, [clients]);

    const getClientMotorcycles = useCallback((clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client?.motorcycles || [];
    }, [clients]);

    // =============================================
    // MOTOCICLETAS
    // =============================================
    const addMotorcycle = useCallback(async (motoData) => {
        const { data: newMoto, error } = await motorcyclesService.create(motoData);
        if (error) throw error;

        // Actualizar cliente con la nueva moto
        setClients(prev => prev.map(c => {
            if (c.id === motoData.client_id) {
                return {
                    ...c,
                    motorcycles: [...(c.motorcycles || []), newMoto]
                };
            }
            return c;
        }));
        return newMoto;
    }, []);

    const updateMotorcycle = useCallback(async (id, updates) => {
        const { data: updated, error } = await motorcyclesService.update(id, updates);
        if (error) throw error;

        setClients(prev => prev.map(c => ({
            ...c,
            motorcycles: c.motorcycles?.map(m => m.id === id ? { ...m, ...updated } : m)
        })));
        return updated;
    }, []);

    const deleteMotorcycle = useCallback(async (id) => {
        const { error } = await motorcyclesService.delete(id);
        if (error) throw error;

        setClients(prev => prev.map(c => ({
            ...c,
            motorcycles: c.motorcycles?.filter(m => m.id !== id)
        })));
    }, []);

    // =============================================
    // ÓRDENES
    // =============================================
    const refreshOrders = useCallback(async () => {
        try {
            let res;
            if (hasPermission('canViewAllOrders')) {
                res = await ordersService.getAll();
            } else {
                res = await ordersService.getByMechanic(user?.id);
            }
            setOrders(res.data || []);
        } catch (err) {
            console.error('Error refreshing orders:', err);
        }
    }, [user, hasPermission]);

    const getOrderById = useCallback(async (id) => {
        const { data } = await ordersService.getById(id);
        return data;
    }, []);

    const addOrder = useCallback(async (orderData) => {
        const { data: newOrder, error } = await ordersService.create({
            ...orderData,
            mechanic_id: orderData.mechanic_id || user?.id
        });
        if (error) throw error;
        await refreshOrders(); // Recargar para obtener datos completos
        return newOrder;
    }, [user, refreshOrders]);

    const updateOrderStatus = useCallback(async (orderId, statusId, notes = '') => {
        const { error } = await ordersService.updateStatus(orderId, statusId, user?.id, notes);
        if (error) throw error;
        await refreshOrders();
    }, [user, refreshOrders]);

    const markOrderAsPaid = useCallback(async (orderId) => {
        // Obtener la orden para calcular ganancias
        const order = orders.find(o => o.id === orderId);

        const { error } = await ordersService.markAsPaid(orderId);
        if (error) throw error;

        // Registrar ganancias automáticamente
        if (order && order.mechanic_id) {
            const laborTotal = order.services?.reduce((sum, svc) =>
                sum + (parseFloat(svc.labor_cost) || 0), 0) || 0;

            // Determinar supervisor_id - si el mecánico es auxiliar, buscar su maestro
            let supervisorId = order.approved_by || null;

            // Si no hay approved_by, intentar obtenerlo del perfil del mecánico
            if (!supervisorId) {
                try {
                    const { data: mechanic } = await authService.getProfile(order.mechanic_id);
                    if (mechanic?.requires_approval && mechanic?.supervisor_id) {
                        supervisorId = mechanic.supervisor_id;
                    }
                } catch (err) {
                    console.log('Could not get mechanic profile for supervisor');
                }
            }

            try {
                await earningsService.recordEarning(
                    { id: orderId, labor_total: laborTotal },
                    order.mechanic_id,
                    supervisorId
                );
            } catch (err) {
                console.error('Error recording earnings:', err);
            }
        }

        await refreshOrders();
    }, [orders, refreshOrders]);

    const updateOrder = useCallback(async (orderId, updates) => {
        const { error } = await ordersService.update(orderId, updates);
        if (error) throw error;
        await refreshOrders();
    }, [refreshOrders]);

    const deleteOrder = useCallback(async (orderId) => {
        const { error } = await ordersService.delete(orderId);
        if (error) throw error;
        setOrders(prev => prev.filter(o => o.id !== orderId));
    }, []);

    // Filtros de órdenes
    const getActiveOrders = useCallback((mechanicId = null) => {
        const terminalStatus = statuses.find(s => s.is_terminal)?.name;
        return orders.filter(o => {
            if (mechanicId && o.mechanic_id !== mechanicId) return false;
            return o.status?.name !== terminalStatus;
        });
    }, [orders, statuses]);

    const getTodayOrders = useCallback((mechanicId = null) => {
        const today = new Date().toDateString();
        return orders.filter(o => {
            if (mechanicId && o.mechanic_id !== mechanicId) return false;
            return new Date(o.created_at).toDateString() === today;
        });
    }, [orders]);

    const getClientOrders = useCallback(async (clientId) => {
        try {
            const { data } = await ordersService.getByClient(clientId);
            return data || [];
        } catch (err) {
            console.error('Error getting client orders:', err);
            return [];
        }
    }, []);

    // =============================================
    // SERVICIOS
    // =============================================
    const addService = useCallback(async (serviceData) => {
        const { data: newService, error } = await servicesService.create(serviceData);
        if (error) throw error;
        setServices(prev => [...prev, newService]);
        return newService;
    }, []);

    const updateService = useCallback(async (id, updates) => {
        const { data: updated, error } = await servicesService.update(id, updates);
        if (error) throw error;
        setServices(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
        return updated;
    }, []);

    const deleteService = useCallback(async (id) => {
        const { error } = await servicesService.delete(id);
        if (error) throw error;
        setServices(prev => prev.filter(s => s.id !== id));
    }, []);

    // =============================================
    // NOVEDADES (UPDATES)
    // =============================================
    const getOrderUpdates = useCallback((orderId) => {
        return serviceUpdates.filter(u => u.order_id === orderId);
    }, [serviceUpdates]);

    const addServiceUpdate = useCallback(async (updateData) => {
        const { data: newUpdate, error } = await orderUpdatesService.create({
            ...updateData,
            created_by: user?.id
        });
        if (error) throw error;
        setServiceUpdates(prev => [newUpdate, ...prev]);
        return newUpdate;
    }, [user]);

    // =============================================
    // ESTADÍSTICAS (Solo para Admin)
    // =============================================
    const getMechanicsPerformance = useCallback(async (startDate, endDate) => {
        if (!hasPermission('canViewMechanicStats')) return [];
        const { data } = await statsService.getMechanicsPerformance(startDate, endDate);
        return data || [];
    }, [hasPermission]);

    const getDashboardStats = useCallback(async () => {
        const { data } = await statsService.getDashboardStats();
        return data;
    }, []);

    // =============================================
    // CÁLCULOS DE GANANCIAS
    // =============================================
    const getMechanicEarnings = useCallback((mechanicId, startDate = null, endDate = null) => {
        let filteredOrders = orders.filter(o =>
            o.mechanic_id === mechanicId && o.is_paid
        );

        if (startDate) {
            filteredOrders = filteredOrders.filter(o =>
                new Date(o.created_at) >= new Date(startDate)
            );
        }
        if (endDate) {
            filteredOrders = filteredOrders.filter(o =>
                new Date(o.created_at) <= new Date(endDate)
            );
        }

        const laborTotal = filteredOrders.reduce((sum, o) =>
            sum + (parseFloat(o.labor_total) || 0), 0
        );

        // Obtener porcentaje de comisión del mecánico
        const mechanic = orders.find(o => o.mechanic?.id === mechanicId)?.mechanic;
        const commissionRate = (mechanic?.commission_percentage || 10) / 100;

        return {
            laborTotal,
            commission: laborTotal * commissionRate,
            commissionPercentage: commissionRate * 100,
            ordersCount: filteredOrders.length
        };
    }, [orders]);

    // =============================================
    // USUARIOS
    // =============================================
    const refreshUsers = useCallback(async () => {
        try {
            const { data } = await authService.getAllUsers();
            setUsers(data || []);
        } catch (err) {
            console.error('Error refreshing users:', err);
        }
    }, []);

    const value = {
        // Estado
        loading,
        error,

        // Clientes
        clients,
        refreshClients,
        addClient,
        updateClient,
        deleteClient,
        findClientByPhone,
        searchClients,
        getClientMotorcycles,

        // Motocicletas - computed from clients
        motorcycles: clients.flatMap(c => c.motorcycles || []),
        addMotorcycle,
        updateMotorcycle,
        deleteMotorcycle,

        // Órdenes
        orders,
        refreshOrders,
        getOrderById,
        getClientOrders,
        addOrder,
        updateOrder,
        updateOrderStatus,
        markOrderAsPaid,
        deleteOrder,
        getActiveOrders,
        getTodayOrders,

        // Servicios
        services,
        addService,
        updateService,
        deleteService,

        // Novedades
        serviceUpdates,
        getOrderUpdates,
        addServiceUpdate,

        // Estados
        statuses,

        // Estadísticas
        getMechanicsPerformance,
        getDashboardStats,
        getMechanicEarnings,

        // Usuarios
        users,
        refreshUsers,
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
