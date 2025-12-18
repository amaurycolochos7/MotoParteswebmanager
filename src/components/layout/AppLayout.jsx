import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    LayoutDashboard,
    ClipboardList,
    Users,
    Wrench,
    Settings,
    MessageSquare,
    BarChart3,
    Calendar,
    PlusCircle,
    History,
    DollarSign,
    ChevronLeft,
    LogOut,
    Menu,
    Bike
} from 'lucide-react';
import ConnectionStatus from '../ui/ConnectionStatus';

export default function AppLayout() {
    const { user, logout, isAdmin, isMechanic, hasPermission } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Navegación para Admin
    const adminNavItems = [
        { section: 'Principal' },
        { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
        { to: '/admin/orders', icon: ClipboardList, label: 'Órdenes' },
        { to: '/admin/mechanics', icon: Wrench, label: 'Mecánicos' },

        { section: 'Gestión' },
        { to: '/admin/clients', icon: Users, label: 'Clientes' },
        { to: '/admin/users', icon: Users, label: 'Usuarios' },
        { to: '/admin/services', icon: Settings, label: 'Servicios' },

        { section: 'Herramientas' },
        { to: '/admin/analytics', icon: BarChart3, label: 'Reportes' },
    ];

    // Navegación para Mecánico - construida dinámicamente basada en permisos
    const baseMechanicNavItems = [
        { section: 'Principal' },
        { to: '/mechanic', icon: LayoutDashboard, label: 'Mi Dashboard', end: true },
        { to: '/mechanic/new-order', icon: PlusCircle, label: 'Nueva Orden' },
        { to: '/mechanic/orders', icon: ClipboardList, label: 'Mis Órdenes' },

        { section: 'Consultas' },
        { to: '/mechanic/clients', icon: Users, label: 'Clientes' },
        { to: '/mechanic/appointments', icon: Calendar, label: 'Citas' },
    ];

    // Agregar opción de Servicios si tiene permiso
    if (hasPermission('can_create_services')) {
        baseMechanicNavItems.push({ to: '/mechanic/services', icon: Settings, label: 'Servicios' });
    }

    baseMechanicNavItems.push(
        { section: 'Historial' },
        { to: '/mechanic/history', icon: History, label: 'Historial' },
        { to: '/mechanic/earnings', icon: DollarSign, label: 'Mis Ganancias' },
    );

    const mechanicNavItems = baseMechanicNavItems;

    // Determinar qué navegación mostrar
    const navItems = isAdmin() ? adminNavItems : mechanicNavItems;

    // Obtener iniciales para el avatar
    const getInitials = (name) => {
        if (!name) return 'U';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    // Nombre del rol en español
    const getRoleName = (role) => {
        const roles = {
            admin: 'Administrador',
            mechanic: 'Mecánico',
            admin_mechanic: 'Admin-Mecánico'
        };
        return roles[role] || role;
    };

    return (
        <div className="app-layout">
            <ConnectionStatus />
            {/* Overlay para móvil */}
            {sidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <Bike size={28} />
                        <span>MotoPartes</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item, index) => {
                        if (item.section) {
                            return (
                                <div key={index} className="nav-section-title">
                                    {item.section}
                                </div>
                            );
                        }

                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    `nav-item ${isActive ? 'active' : ''}`
                                }
                                onClick={() => setSidebarOpen(false)}
                            >
                                <Icon size={20} />
                                <span>{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-menu">
                        <div className="user-avatar">
                            {getInitials(user?.full_name)}
                        </div>
                        <div className="user-info">
                            <div className="user-name">{user?.full_name}</div>
                            <div className="user-role">{getRoleName(user?.role)}</div>
                        </div>
                    </div>
                    <button
                        className="btn btn-ghost w-full mt-sm"
                        onClick={handleLogout}
                        style={{ justifyContent: 'flex-start' }}
                    >
                        <LogOut size={18} />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>

            {/* Contenido Principal */}
            <main className="main-content">
                {/* Header Bar (móvil) */}
                <div className="page-header-bar">
                    <button
                        className="btn btn-ghost btn-icon mobile-menu-btn"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu size={24} />
                    </button>
                    <div className="header-logo">
                        <Bike size={24} />
                        <span>MotoPartes</span>
                    </div>
                    <div style={{ width: 40 }} />
                </div>

                {/* Contenido de la página */}
                <div className="page-content">
                    <Outlet />
                </div>
            </main>

            <style>{`
                .sidebar-overlay {
                    display: none;
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 99;
                }

                .header-logo {
                    display: none;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .header-logo svg {
                    color: var(--primary);
                }

                .mobile-menu-btn {
                    display: none;
                }

                @media (max-width: 768px) {
                    .sidebar-overlay {
                        display: block;
                    }

                    .header-logo {
                        display: flex;
                    }

                    .mobile-menu-btn {
                        display: flex;
                    }

                    .page-header-bar {
                        display: flex !important;
                    }
                }

                @media (min-width: 769px) {
                    .page-header-bar {
                        display: none;
                    }
                }
            `}</style>
        </div>
    );
}
