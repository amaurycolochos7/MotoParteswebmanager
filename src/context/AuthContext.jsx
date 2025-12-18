import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../lib/supabase';

const AuthContext = createContext(null);

const STORAGE_KEY = 'motopartes_auth';

// Permisos por rol
const ROLE_PERMISSIONS = {
    admin: {
        canViewAllOrders: true,
        canCreateOrders: false,        // Admin NO crea órdenes
        canManageUsers: true,
        canManageClients: true,
        canManageServices: true,
        canManageWhatsApp: true,
        canViewAnalytics: true,
        canViewMechanicStats: true,
        canEditClients: true,
        canDeleteClients: true,
    },
    mechanic: {
        canViewAllOrders: false,       // Solo ve sus órdenes
        canCreateOrders: true,          // Mecánico SÍ crea órdenes
        canManageUsers: false,
        canManageClients: false,        // Solo lectura
        canManageServices: false,
        canManageWhatsApp: false,
        canViewAnalytics: false,
        canViewMechanicStats: false,
        canEditClients: false,
        canDeleteClients: false,
    },
    admin_mechanic: {
        canViewAllOrders: true,         // Ve todas las órdenes
        canCreateOrders: true,          // Puede crear órdenes
        canManageUsers: false,          // NO puede crear usuarios
        canManageClients: true,         // Puede gestionar clientes
        canManageServices: false,
        canManageWhatsApp: false,       // NO puede configurar WhatsApp
        canViewAnalytics: true,
        canViewMechanicStats: false,
        canEditClients: true,
        canDeleteClients: false,
    },
};

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Cargar sesión al iniciar
    useEffect(() => {
        const loadSession = async () => {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const userData = JSON.parse(stored);
                    // Verificar que el usuario sigue activo en la base de datos
                    const freshUser = await authService.getProfile(userData.id);
                    if (freshUser && freshUser.is_active) {
                        setUser(freshUser);
                    } else {
                        localStorage.removeItem(STORAGE_KEY);
                    }
                }
            } catch (error) {
                console.error('Error loading session:', error);
                localStorage.removeItem(STORAGE_KEY);
            } finally {
                setLoading(false);
            }
        };

        loadSession();
    }, []);

    // Login
    const login = useCallback(async (email, password) => {
        setLoading(true);
        try {
            const userData = await authService.login(email, password);
            setUser(userData);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
            return userData;
        } catch (error) {
            // Re-throw the error so the Login component can catch it
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    // Logout
    const logout = useCallback(() => {
        setUser(null);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    // Verificar rol
    const isAdmin = useCallback(() => {
        return user?.role === 'admin';
    }, [user]);

    const isMechanic = useCallback(() => {
        return user?.role === 'mechanic' || user?.role === 'admin_mechanic';
    }, [user]);

    const isAdminMechanic = useCallback(() => {
        return user?.role === 'admin_mechanic';
    }, [user]);

    // Verificar permiso específico
    const hasPermission = useCallback((permission) => {
        if (!user) return false;
        const permissions = ROLE_PERMISSIONS[user.role];
        return permissions?.[permission] || false;
    }, [user]);

    // Obtener todos los permisos del usuario actual
    const getPermissions = useCallback(() => {
        if (!user) return {};
        return ROLE_PERMISSIONS[user.role] || {};
    }, [user]);

    // Verificar si puede acceder a una ruta
    const canAccess = useCallback((route) => {
        if (!user) return false;

        const adminOnlyRoutes = ['/admin/users', '/admin/whatsapp', '/admin/settings'];
        const mechanicOnlyRoutes = ['/mechanic/new-order'];

        if (adminOnlyRoutes.some(r => route.startsWith(r))) {
            return user.role === 'admin';
        }

        if (mechanicOnlyRoutes.some(r => route.startsWith(r))) {
            return user.role === 'mechanic' || user.role === 'admin_mechanic';
        }

        return true;
    }, [user]);

    // Permisos específicos del usuario (vienen de la BD)
    const canCreateAppointments = useCallback(() => {
        if (!user) return false;
        // Admin siempre puede, mecánicos depende de su configuración
        if (user.role === 'admin') return true;
        return user.can_create_appointments !== false;
    }, [user]);

    const canSendMessages = useCallback(() => {
        if (!user) return false;
        // Admin siempre puede, mecánicos depende de su configuración
        if (user.role === 'admin') return true;
        return user.can_send_messages !== false;
    }, [user]);

    const canCreateClients = useCallback(() => {
        if (!user) return false;
        if (user.role === 'admin') return true;
        return user.can_create_clients !== false; // Default true if undefined
    }, [user]);

    const canEditClients = useCallback(() => {
        if (!user) return false;
        if (user.role === 'admin') return true;
        return user.can_edit_clients === true; // Default false if undefined
    }, [user]);

    const canDeleteOrders = useCallback(() => {
        if (!user) return false;
        if (user.role === 'admin') return true;
        return user.can_delete_orders === true; // Default false if undefined
    }, [user]);

    const value = {
        user,
        loading,
        login,
        logout,
        isAdmin,
        isMechanic,
        isAdminMechanic,
        hasPermission,
        getPermissions,
        canAccess,
        canCreateAppointments,
        canSendMessages,
        canCreateClients,
        canEditClients,
        canDeleteOrders,
        isAuthenticated: !!user,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
