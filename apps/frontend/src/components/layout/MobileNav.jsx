import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Plus, ClipboardList, History, Users, ShieldCheck, Calendar, Crown, DollarSign } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { orderRequestsService, paymentRequestsService } from '../../lib/api';

export default function MobileNav() {
    const { user, isMasterMechanic, requiresApproval } = useAuth();
    const location = useLocation();
    const [pendingCount, setPendingCount] = useState(0);
    const [pendingPayments, setPendingPayments] = useState(0);

    const isAdmin = user?.role === 'admin';
    const isInMechanicRoute = location.pathname.startsWith('/mechanic');
    const isMaster = isMasterMechanic && isMasterMechanic();
    const isAuxiliary = requiresApproval && requiresApproval();

    // Cargar conteo de solicitudes pendientes para mecánicos maestros
    useEffect(() => {
        if (isMaster && user?.id) {
            loadPendingCount();
            // Refrescar cada 10 segundos para notificaciones más rápidas
            const interval = setInterval(loadPendingCount, 10000);

            // Refrescar inmediatamente al volver a la pestaña
            const handleVisibilityChange = () => {
                if (!document.hidden) loadPendingCount();
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);

            return () => {
                clearInterval(interval);
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }
    }, [isMaster, user?.id]);

    const loadPendingCount = async () => {
        try {
            const count = await orderRequestsService.getPendingCount(user?.id);
            setPendingCount(count);
        } catch (error) {
            console.error('Error loading pending count:', error);
        }
    };

    // Cargar conteo de pagos pendientes para auxiliares
    useEffect(() => {
        if (isAuxiliary && user?.id) {
            loadPendingPayments();
            // Refrescar cada 10 segundos
            const interval = setInterval(loadPendingPayments, 10000);

            // Refrescar inmediatamente al volver a la pestaña
            const handleVisibilityChange = () => {
                if (!document.hidden) loadPendingPayments();
            };
            document.addEventListener('visibilitychange', handleVisibilityChange);

            return () => {
                clearInterval(interval);
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            };
        }
    }, [isAuxiliary, user?.id]);

    const loadPendingPayments = async () => {
        try {
            const count = await paymentRequestsService.getPendingCount(user?.id);
            setPendingPayments(count);
        } catch (error) {
            console.error('Error loading pending payments:', error);
        }
    };

    let mechanicLinks = [
        { to: '/mechanic', icon: Home, label: 'Inicio' },
        { to: '/mechanic/new-order', icon: Plus, label: 'Nueva', isNew: true },
        { to: '/mechanic/appointments', icon: Calendar, label: 'Citas' },
        { to: '/mechanic/clients', icon: Users, label: 'Clientes' },
        { to: '/mechanic/orders', icon: ClipboardList, label: 'Servicios' },
        { to: '/mechanic/history', icon: History, label: 'Historial' },
    ];

    // Agregar link de solicitudes para mecánicos maestros
    if (isMaster) {
        mechanicLinks.push({
            to: '/mechanic/requests',
            icon: Crown,
            label: 'Solicitudes',
            isMaster: true,
            badge: pendingCount
        });
    }

    // Agregar link de pagos para auxiliares
    if (isAuxiliary) {
        mechanicLinks.push({
            to: '/mechanic/my-payments',
            icon: DollarSign,
            label: 'Pagos',
            isAuxiliary: true,
            badge: pendingPayments
        });
    }

    const adminLinks = [
        { to: '/admin', icon: Home, label: 'Panel' },
        { to: '/admin/orders', icon: ClipboardList, label: 'Órdenes' },
        { to: '/admin/users', icon: Users, label: 'Usuarios' },
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
            {links.map(({ to, icon: Icon, label, isNew, isAdmin: isAdminLink, isMaster: isMasterLink, badge }) => (
                <NavLink
                    key={to}
                    to={to}
                    end={to === '/mechanic' || to === '/admin'}
                    className={({ isActive }) =>
                        `mobile-nav-item ${isActive ? 'active' : ''} ${isNew ? 'new-order' : ''} ${isAdminLink ? 'admin-link' : ''} ${isMasterLink ? 'master-link' : ''}`
                    }
                >
                    <div className="nav-icon-wrapper">
                        <Icon size={24} />
                        {badge > 0 && (
                            <span className="nav-badge">{badge > 9 ? '9+' : badge}</span>
                        )}
                    </div>
                    <span>{label}</span>
                </NavLink>
            ))}

            <style>{`
                .nav-icon-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .nav-badge {
                    position: absolute;
                    top: -6px;
                    right: -8px;
                    min-width: 18px;
                    height: 18px;
                    background: var(--danger);
                    color: white;
                    font-size: 0.625rem;
                    font-weight: 700;
                    border-radius: 9px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 4px;
                    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.4);
                }

                .master-link {
                    color: var(--warning);
                }

                .master-link.active {
                    color: var(--warning);
                    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(249, 115, 22, 0.1) 100%);
                }
            `}</style>
        </nav>
    );
}
