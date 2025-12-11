import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

// Demo users for local development
const DEFAULT_PERMISSIONS = {
    canManageAppointments: true,
    canManageQuotes: true,
    canViewAnalytics: false, // Only for admins by default
};

const DEMO_USERS = [
    {
        id: 'admin-001',
        email: 'admin@motopartes.com',
        password: 'admin123',
        full_name: 'Usuario Maestro',
        phone: '555-0001',
        role: 'admin',
        is_active: true,
        permissions: {
            canManageAppointments: true,
            canManageQuotes: true,
            canViewAnalytics: true,
        },
    },
    {
        id: 'mech-001',
        email: 'mecanico@motopartes.com',
        password: 'mech123',
        full_name: 'Carlos Hernández',
        phone: '555-0002',
        role: 'mechanic',
        is_active: true,
        permissions: {
            canManageAppointments: true,
            canManageQuotes: true,
            canViewAnalytics: false,
        },
    },
];

const STORAGE_KEY = 'motopartes_auth';
const USERS_STORAGE_KEY = 'motopartes_users';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);

    // Initialize users from localStorage with migration support
    const [users, setUsers] = useState(() => {
        const stored = localStorage.getItem(USERS_STORAGE_KEY);
        if (stored) {
            try {
                const parsedUsers = JSON.parse(stored);

                // Migration: Add permissions to users that don't have them
                const migratedUsers = parsedUsers.map(user => {
                    if (!user.permissions) {
                        console.log(`🔧 Migrating user ${user.email} to add permissions...`);
                        return {
                            ...user,
                            permissions: {
                                canManageAppointments: true,
                                canManageQuotes: true,
                                canViewAnalytics: user.role === 'admin',
                            }
                        };
                    }
                    return user;
                });

                console.log('✅ Loaded users from localStorage:', migratedUsers.length);
                return migratedUsers;
            } catch (e) {
                console.error('Error loading users from localStorage:', e);
            }
        }

        console.log('📦 No stored users found, using demo users');
        return DEMO_USERS;
    });

    const [loading, setLoading] = useState(true);

    // Save users to storage whenever they change
    useEffect(() => {
        console.log('💾 Saving users to localStorage:', users.length);
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    }, [users]);

    // Check for existing session on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setUser(parsed);
            } catch (e) {
                localStorage.removeItem(STORAGE_KEY);
            }
        }
        setLoading(false);
    }, []);

    const login = useCallback(async (email, password) => {
        // Demo mode authentication
        const foundUser = users.find(
            (u) => u.email === email && u.password === password
        );

        if (!foundUser) {
            throw new Error('Credenciales incorrectas');
        }

        if (!foundUser.is_active) {
            throw new Error('Usuario desactivado');
        }

        const userData = {
            id: foundUser.id,
            email: foundUser.email,
            full_name: foundUser.full_name,
            phone: foundUser.phone,
            role: foundUser.role,
        };

        setUser(userData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));

        return userData;
    }, [users]);

    const logout = useCallback(() => {
        setUser(null);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const addUser = useCallback((userData) => {
        const newUser = {
            id: `user-${Date.now()}`,
            ...userData,
            commission_percentage: userData.role === 'mechanic'
                ? (userData.commission_percentage || 10)
                : null,
            permissions: userData.permissions || {
                canManageAppointments: true,
                canManageQuotes: true,
                canViewAnalytics: userData.role === 'admin',
            },
            is_active: true,
            created_at: new Date().toISOString(),
        };
        setUsers(prev => [...prev, newUser]);
        return newUser;
    }, []);

    const updateUser = useCallback((id, userData) => {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, ...userData } : u));
    }, []);

    const deleteUser = useCallback((id) => {
        setUsers(prev => prev.filter(u => u.id !== id));
    }, []);

    const isAdmin = useCallback(() => {
        return user?.role === 'admin';
    }, [user]);

    const isMechanic = useCallback(() => {
        // Admin también tiene acceso de mecánico
        return user?.role === 'mechanic' || user?.role === 'admin';
    }, [user]);

    const hasPermission = useCallback((permission) => {
        if (!user) return false;
        // Admins always have all permissions
        if (user.role === 'admin') return true;
        return user.permissions?.[permission] || false;
    }, [user]);

    const canManageAppointments = useCallback(() => {
        return hasPermission('canManageAppointments');
    }, [hasPermission]);

    const canManageQuotes = useCallback(() => {
        return hasPermission('canManageQuotes');
    }, [hasPermission]);

    const canViewAnalytics = useCallback(() => {
        return hasPermission('canViewAnalytics');
    }, [hasPermission]);

    const value = {
        user,
        users,
        loading,
        login,
        logout,
        addUser,
        updateUser,
        deleteUser,
        isAdmin,
        isMechanic,
        hasPermission,
        canManageAppointments,
        canManageQuotes,
        canViewAnalytics,
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
