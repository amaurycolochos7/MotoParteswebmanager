import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
    clientsService,
    motorcyclesService,
    ordersService,
    servicesService,
    statusesService,
    statsService,
    orderUpdatesService
} from '../lib/supabase';

const DataContext = createContext(null);

export function DataProvider({ children }) {
    const { user, isAdmin, hasPermission } = useAuth();

    // Estados
    const [clients, setClients] = useState([]);
    const [orders, setOrders] = useState([]);
    const [services, setServices] = useState([]);
    const [statuses, setStatuses] = useState([]);
    const [serviceUpdates, setServiceUpdates] = useState([]);
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
                const [clientsData, servicesData, statusesData, updatesData] = await Promise.all([
                    clientsService.getAll(),
                    servicesService.getAll(),
                    statusesService.getAll(),
                    orderUpdatesService.getAll()
                ]);

                setClients(clientsData || []);
                setServices(servicesData || []);
                setStatuses(statusesData || []);
                setServiceUpdates(updatesData || []);

                // Cargar órdenes según rol
                let ordersData;
                if (hasPermission('canViewAllOrders')) {
                    ordersData = await ordersService.getAll();
                } else {
                    ordersData = await ordersService.getByMechanic(user.id);
                }
                setOrders(ordersData || []);

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
            const data = await clientsService.getAll();
            setClients(data || []);
        } catch (err) {
            console.error('Error refreshing clients:', err);
        }
    }, []);

    const addClient = useCallback(async (clientData) => {
        const newClient = await clientsService.create(clientData, user?.id);
        setClients(prev => [newClient, ...prev]);
        return newClient;
    }, [user]);

    const updateClient = useCallback(async (id, updates) => {
        const updated = await clientsService.update(id, updates);
        setClients(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
        return updated;
    }, []);

    const deleteClient = useCallback(async (id) => {
        await clientsService.delete(id);
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
        const newMoto = await motorcyclesService.create(motoData);
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
        const updated = await motorcyclesService.update(id, updates);
        setClients(prev => prev.map(c => ({
            ...c,
            motorcycles: c.motorcycles?.map(m => m.id === id ? { ...m, ...updated } : m)
        })));
        return updated;
    }, []);

    const deleteMotorcycle = useCallback(async (id) => {
        await motorcyclesService.delete(id);
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
            let data;
            if (hasPermission('canViewAllOrders')) {
                data = await ordersService.getAll();
            } else {
                data = await ordersService.getByMechanic(user?.id);
            }
            setOrders(data || []);
        } catch (err) {
            console.error('Error refreshing orders:', err);
        }
    }, [user, hasPermission]);

    const getOrderById = useCallback(async (id) => {
        return ordersService.getById(id);
    }, []);

    const addOrder = useCallback(async (orderData) => {
        const newOrder = await ordersService.create({
            ...orderData,
            mechanic_id: orderData.mechanic_id || user?.id
        });
        await refreshOrders(); // Recargar para obtener datos completos
        return newOrder;
    }, [user, refreshOrders]);

    const updateOrderStatus = useCallback(async (orderId, statusId, notes = '') => {
        await ordersService.updateStatus(orderId, statusId, user?.id, notes);
        await refreshOrders();
    }, [user, refreshOrders]);

    const markOrderAsPaid = useCallback(async (orderId) => {
        await ordersService.markAsPaid(orderId);
        await refreshOrders();
    }, [refreshOrders]);

    const updateOrder = useCallback(async (orderId, updates) => {
        await ordersService.update(orderId, updates);
        await refreshOrders();
    }, [refreshOrders]);

    const deleteOrder = useCallback(async (orderId) => {
        await ordersService.delete(orderId);
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
            return await ordersService.getByClient(clientId);
        } catch (err) {
            console.error('Error getting client orders:', err);
            return [];
        }
    }, []);

    // =============================================
    // SERVICIOS
    // =============================================
    const addService = useCallback(async (serviceData) => {
        const newService = await servicesService.create(serviceData);
        setServices(prev => [...prev, newService]);
        return newService;
    }, []);

    const updateService = useCallback(async (id, updates) => {
        const updated = await servicesService.update(id, updates);
        setServices(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
        return updated;
    }, []);

    const deleteService = useCallback(async (id) => {
        await servicesService.delete(id);
        setServices(prev => prev.filter(s => s.id !== id));
    }, []);

    // =============================================
    // NOVEDADES (UPDATES)
    // =============================================
    const getOrderUpdates = useCallback((orderId) => {
        return serviceUpdates.filter(u => u.order_id === orderId);
    }, [serviceUpdates]);

    const addServiceUpdate = useCallback(async (updateData) => {
        const newUpdate = await orderUpdatesService.create({
            ...updateData,
            created_by: user?.id
        });
        setServiceUpdates(prev => [newUpdate, ...prev]);
        return newUpdate;
    }, [user]);

    // =============================================
    // ESTADÍSTICAS (Solo para Admin)
    // =============================================
    const getMechanicsPerformance = useCallback(async (startDate, endDate) => {
        if (!hasPermission('canViewMechanicStats')) return [];
        return statsService.getMechanicsPerformance(startDate, endDate);
    }, [hasPermission]);

    const getDashboardStats = useCallback(async () => {
        return statsService.getDashboardStats();
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

        // Motocicletas
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
