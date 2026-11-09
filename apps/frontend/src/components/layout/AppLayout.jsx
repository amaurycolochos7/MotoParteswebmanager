import { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBadges } from '../../hooks/useBadges';
import NotificationBell from './NotificationBell';
import {
    LayoutDashboard, ClipboardList, Users, Wrench, MessageSquare, BarChart3, Calendar, PlusCircle,
    History, DollarSign, LogOut, Menu, Crown, Send, CreditCard, Gift, Zap, FileText, Activity,
    CheckSquare, Store, QrCode, Plug, LifeBuoy, ShieldCheck, Printer, Search, UserCog, MessagesSquare,
    ChevronDown, X,
} from 'lucide-react';
import ConnectionStatus from '../ui/ConnectionStatus';
import { initialsOf } from '../ui/kit';

const ROLE_LABEL = {
    owner: 'Dueño',
    admin: 'Administrador',
    maestro: 'Mecánico maestro',
    mecanico: 'Mecánico',
    auxiliar: 'Auxiliar',
};

/* -----------------------------------------------------------------------------
   Estructura del menú. `badge` enlaza con los contadores de la campanita.
   ----------------------------------------------------------------------------- */
function buildAdminGroups({ canViewInbox, isSuper }) {
    const groups = [
        {
            id: 'operacion', title: 'Operación', items: [
                { to: '/admin', icon: LayoutDashboard, label: 'Inicio', end: true },
                { to: '/admin/orders', icon: ClipboardList, label: 'Órdenes' },
                { to: '/mechanic/new-order', icon: PlusCircle, label: 'Nueva orden' },
                { to: '/mechanic/appointments', icon: Calendar, label: 'Citas', badge: 'appts' },
                { to: '/mechanic/quotations', icon: FileText, label: 'Cotizaciones' },
            ],
        },
        {
            id: 'clientes', title: 'Clientes', items: [
                { to: '/admin/lookup', icon: Search, label: 'Buscar cliente' },
                { to: '/admin/clients', icon: Users, label: 'Clientes' },
            ],
        },
        {
            id: 'equipo', title: 'Equipo y WhatsApp', items: [
                { to: '/admin/team', icon: UserCog, label: 'Equipo' },
                { to: '/admin/mechanics', icon: Wrench, label: 'Rendimiento' },
                ...(canViewInbox ? [{ to: '/admin/inbox', icon: MessagesSquare, label: 'Conversaciones', badge: 'unread' }] : []),
                { to: '/admin/whatsapp', icon: MessageSquare, label: 'WhatsApp del taller' },
            ],
        },
        {
            id: 'negocio', title: 'Negocio', items: [
                { to: '/admin/analytics', icon: BarChart3, label: 'Reportes' },
                { to: '/admin/automations', icon: Zap, label: 'Automatizaciones' },
                { to: '/admin/templates', icon: FileText, label: 'Plantillas' },
                { to: '/admin/tasks', icon: CheckSquare, label: 'Tareas' },
                { to: '/admin/printing', icon: Printer, label: 'Impresión' },
            ],
        },
        {
            id: 'ajustes', title: 'Ajustes', collapsedByDefault: true, items: [
                { to: '/admin/workspace', icon: Store, label: 'Mi taller' },
                { to: '/admin/billing', icon: CreditCard, label: 'Suscripción' },
                { to: '/admin/referrals', icon: Gift, label: 'Referidos' },
                { to: '/admin/shop-qr', icon: QrCode, label: 'QR del taller' },
                { to: '/admin/integrations', icon: Plug, label: 'Integraciones' },
                { to: '/admin/support', icon: LifeBuoy, label: 'Soporte' },
                { to: '/admin/bot-health', icon: Activity, label: 'Estado del bot' },
            ],
        },
    ];
    if (isSuper) groups.push({ id: 'super', title: 'Super', items: [{ to: '/super', icon: ShieldCheck, label: 'Panel Super' }] });
    return groups;
}

function buildWorkGroups({ teamRole, isManager, canViewInbox }) {
    const groups = [
        {
            id: 'trabajo', title: 'Trabajo', items: [
                { to: '/mechanic', icon: LayoutDashboard, label: 'Inicio', end: true },
                { to: '/mechanic/new-order', icon: PlusCircle, label: 'Nueva orden' },
                { to: '/mechanic/orders', icon: ClipboardList, label: 'Mis órdenes' },
                { to: '/mechanic/quotations', icon: FileText, label: 'Cotizaciones' },
                { to: '/mechanic/appointments', icon: Calendar, label: 'Citas', badge: 'appts' },
            ],
        },
        {
            id: 'clientes', title: 'Clientes', items: [
                { to: '/mechanic/lookup', icon: Search, label: 'Buscar cliente' },
                { to: '/mechanic/clients', icon: Users, label: 'Clientes' },
                ...(canViewInbox ? [{ to: '/mechanic/inbox', icon: MessagesSquare, label: 'Conversaciones', badge: 'unread' }] : []),
            ],
        },
    ];
    if (teamRole === 'maestro' || isManager) {
        groups.push({
            id: 'maestro', title: 'Mi equipo', items: [
                { to: '/mechanic/requests', icon: Crown, label: 'Solicitudes' },
                { to: '/mechanic/auxiliaries', icon: Users, label: 'Mis auxiliares' },
                { to: '/mechanic/team', icon: UserCog, label: 'Alta y comisiones' },
            ],
        });
    }
    if (teamRole === 'auxiliar') {
        groups.push({
            id: 'auxiliar', title: 'Auxiliar', items: [
                { to: '/mechanic/my-requests', icon: Send, label: 'Mis solicitudes' },
                { to: '/mechanic/my-payments', icon: DollarSign, label: 'Mis pagos' },
            ],
        });
    }
    groups.push({
        id: 'cuenta', title: 'Mi cuenta', items: [
            { to: '/mechanic/history', icon: History, label: 'Historial' },
            { to: '/mechanic/earnings', icon: DollarSign, label: 'Mis ganancias' },
        ],
    });
    if (isManager) {
        groups.push({
            id: 'admin', title: 'Administración', items: [
                { to: '/admin/team', icon: UserCog, label: 'Equipo' },
                { to: '/admin/whatsapp', icon: MessageSquare, label: 'WhatsApp del taller' },
                { to: '/admin/printing', icon: Printer, label: 'Impresión' },
            ],
        });
    }
    return groups;
}


// Título de la barra superior cuando la ruta no está en el menú (p. ej. pantallas de /mechanic abiertas desde el modo admin).
const ROUTE_TITLES = [
    ['/mechanic/new-order', 'Nueva orden'], ['/mechanic/orders', 'Órdenes'], ['/mechanic/order/', 'Orden'],
    ['/admin/order/', 'Orden'], ['/admin/orders/', 'Orden'], ['/mechanic/quotations/new', 'Nueva cotización'],
    ['/mechanic/quotations', 'Cotizaciones'], ['/mechanic/clients', 'Clientes'], ['/mechanic/lookup', 'Buscar cliente'],
    ['/mechanic/appointments', 'Citas'], ['/mechanic/history', 'Historial'], ['/mechanic/earnings', 'Mis ganancias'],
    ['/mechanic/requests', 'Solicitudes'], ['/mechanic/auxiliaries', 'Mis auxiliares'], ['/mechanic/my-requests', 'Mis solicitudes'],
    ['/mechanic/my-payments', 'Mis pagos'], ['/mechanic/team', 'Equipo'], ['/mechanic/inbox', 'Conversaciones'], ['/mechanic/whatsapp', 'WhatsApp'],
    ['/mechanic', 'Inicio'],
];

const COLLAPSE_KEY = 'mp_nav_collapsed_v2';
const readCollapsed = () => { try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || 'null'); } catch { return null; } };

export default function AppLayout() {
    const { user, logout, isAdmin, teamRole, isManager, canViewInbox } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Panel de administración: perfil admin global, o gerencia dentro de /admin.
    const adminMode = isAdmin() || (isManager && location.pathname.startsWith('/admin'));

    const groups = useMemo(
        () => (adminMode
            ? buildAdminGroups({ canViewInbox, isSuper: !!user?.is_super_admin })
            : buildWorkGroups({ teamRole, isManager, canViewInbox })),
        [adminMode, canViewInbox, user?.is_super_admin, teamRole, isManager],
    );

    // Grupos plegables (los de uso poco frecuente empiezan cerrados). El que contiene la ruta actual siempre se ve.
    const [collapsed, setCollapsed] = useState(() => {
        const saved = readCollapsed();
        if (saved) return saved;
        const init = {};
        [...buildAdminGroups({ canViewInbox: true, isSuper: false }), ...buildWorkGroups({ teamRole: 'maestro', isManager: true, canViewInbox: true })]
            .forEach((g) => { if (g.collapsedByDefault) init[g.id] = true; });
        return init;
    });
    const toggleGroup = (id) => setCollapsed((c) => {
        const next = { ...c, [id]: !c[id] };
        try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
        return next;
    });

    const badges = useBadges({ userId: user?.id, isManager, canViewInbox });

    // Cierra el cajón al navegar
    useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

    const pathMatches = (item) => (item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(item.to + '/'));
    const currentTitle = useMemo(() => {
        let best = null;
        groups.forEach((g) => g.items.forEach((it) => {
            if (pathMatches(it) && (!best || it.to.length > best.to.length)) best = it;
        }));
        if (best?.label) return best.label;
        const hit = ROUTE_TITLES.find(([prefix]) => location.pathname === prefix || location.pathname.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'));
        return hit ? hit[1] : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, location.pathname]);

    const handleLogout = () => { logout(); navigate('/login'); };

    return (
        <div className="app-layout">
            <ConnectionStatus />
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Menú principal">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <img src="/logo-mark.png" alt="MotoPartes Club" className="logo-image" width="82" height="60" />
                    </div>
                    <button type="button" className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
                </div>

                <nav className="sidebar-nav">
                    {groups.map((g) => {
                        const hasActive = g.items.some(pathMatches);
                        const isCollapsed = !!collapsed[g.id] && !hasActive;
                        return (
                            <div key={g.id} className="nav-group">
                                <button type="button" className="nav-section-title nav-group-btn" onClick={() => toggleGroup(g.id)} aria-expanded={!isCollapsed}>
                                    <span>{g.title}</span>
                                    <ChevronDown size={14} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 140ms ease' }} />
                                </button>
                                {!isCollapsed && g.items.map((item) => {
                                    const Icon = item.icon;
                                    const n = item.badge ? badges[item.badge] : 0;
                                    return (
                                        <NavLink
                                            key={item.to + item.label}
                                            to={item.to}
                                            end={item.end}
                                            className={() => `nav-item ${pathMatches(item) ? 'active' : ''}`}
                                        >
                                            <Icon size={18} />
                                            <span>{item.label}</span>
                                            {n > 0 && <span className="nav-count">{n > 9 ? '9+' : n}</span>}
                                        </NavLink>
                                    );
                                })}
                            </div>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-menu">
                        <div className="user-avatar">{initialsOf(user?.full_name)}</div>
                        <div className="user-info">
                            <div className="user-name">{user?.full_name}</div>
                            <div className="user-role-badge"><span className="role-chip">{ROLE_LABEL[teamRole] || 'Usuario'}</span></div>
                        </div>
                    </div>
                    <button className="btn btn-ghost w-full mt-sm" onClick={handleLogout} style={{ justifyContent: 'flex-start' }}>
                        <LogOut size={18} />
                        <span>Cerrar sesión</span>
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="shell-topbar">
                    <button type="button" className="bell shell-topbar__menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menú">
                        <Menu size={22} />
                    </button>
                    <img className="shell-topbar__logo" src="/logo-mark.png" alt="MotoPartes" width="44" height="32" />
                    <h2 className="shell-topbar__title">{currentTitle}</h2>
                    <div className="shell-topbar__spacer" />
                    <div className="shell-topbar__actions">
                        <NotificationBell
                            appts={badges.appts}
                            appointmentsPath="/mechanic/appointments"
                        />
                        <span className="shell-topbar__avatar" title={user?.full_name || ''} aria-hidden="true">{initialsOf(user?.full_name)}</span>
                    </div>
                </header>

                <div className="page-content">
                    <Outlet />
                </div>
            </main>

            <style>{`
                .sidebar-header { display: flex; align-items: center; }
                .nav-group-btn { width: 100%; }
            `}</style>
        </div>
    );
}
