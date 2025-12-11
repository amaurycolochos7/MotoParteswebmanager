import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Plus, ClipboardList, History, Settings, Users, ShieldCheck, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function MobileNav() {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const isAdmin = user?.role === 'admin';
    const isInMechanicRoute = location.pathname.startsWith('/mechanic');

    const mechanicLinks = [
        { to: '/mechanic', icon: Home, label: 'Inicio' },
        { to: '/mechanic/new-order', icon: Plus, label: 'Nueva', isNew: true },
        { to: '/mechanic/appointments', icon: Calendar, label: 'Citas' },
        { to: '/mechanic/clients', icon: Users, label: 'Clientes' },
        { to: '/mechanic/orders', icon: ClipboardList, label: 'Servicios' },
        { to: '/mechanic/history', icon: History, label: 'Historial' },
    ];

    const adminLinks = [
        { to: '/admin', icon: Home, label: 'Panel' },
        { to: '/admin/orders', icon: ClipboardList, label: 'Órdenes' },
        { to: '/admin/users', icon: Users, label: 'Usuarios' },
        { to: '/admin/settings', icon: Settings, label: 'Config' },
    ];

    let links = isAdmin && location.pathname.startsWith('/admin')
        ? adminLinks
        : mechanicLinks;

    // Add Admin button for admins in mechanic routes
    if (isAdmin && isInMechanicRoute) {
        links = [
            { to: '/admin', icon: ShieldCheck, label: 'Admin', isAdmin: true },
            ...mechanicLinks
        ];
    }

    return (
        <nav className="mobile-nav">
            {links.map(({ to, icon: Icon, label, isNew, isAdmin: isAdminLink }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={to === '/mechanic' || to === '/admin'}
                    className={({ isActive }) =>
                        `mobile-nav-item ${isActive ? 'active' : ''} ${isNew ? 'new-order' : ''} ${isAdminLink ? 'admin-link' : ''}`
                    }
                >
                    <Icon size={24} />
                    <span>{label}</span>
                </NavLink>
            ))}
        </nav>
    );
}
