import { useAuth } from '../../context/AuthContext';
import { Calendar, Lock, Mail, Phone } from 'lucide-react';

// Real exports
export { default as MechanicDashboard } from './MechanicDashboard';
export { default as MechanicClients } from './ClientsList';
import AppointmentCalendarComponent from './AppointmentCalendar';

// Appointments with permission check
export function MechanicAppointments() {
    const { user, canCreateAppointments } = useAuth();

    // If user doesn't have permission, show blocked message
    if (!canCreateAppointments()) {
        return (
            <div className="blocked-page">
                <div className="blocked-content">
                    <div className="blocked-icon">
                        <Lock size={64} />
                    </div>
                    <h1 className="blocked-title">Acceso Bloqueado</h1>
                    <p className="blocked-subtitle">
                        No tienes permisos para gestionar citas
                    </p>

                    <div className="blocked-info">
                        <p>
                            Tu cuenta no tiene habilitada la opción de crear o gestionar citas.
                        </p>
                        <p>
                            Contacta al administrador si necesitas acceso a esta función.
                        </p>
                    </div>
                </div>

                <style>{`
                    .blocked-page {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 70vh;
                        padding: var(--spacing-xl);
                    }
                    
                    .blocked-content {
                        text-align: center;
                        max-width: 400px;
                    }
                    
                    .blocked-icon {
                        width: 100px;
                        height: 100px;
                        background: rgba(239, 68, 68, 0.1);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto var(--spacing-lg);
                        color: var(--danger);
                    }
                    
                    .blocked-title {
                        font-size: 1.5rem;
                        font-weight: 700;
                        color: var(--danger);
                        margin-bottom: var(--spacing-xs);
                    }
                    
                    .blocked-subtitle {
                        font-size: 1rem;
                        color: var(--text-secondary);
                        margin-bottom: var(--spacing-xl);
                    }
                    
                    .blocked-info {
                        background: var(--bg-secondary);
                        border-radius: var(--radius-lg);
                        padding: var(--spacing-lg);
                        margin-bottom: var(--spacing-xl);
                        text-align: left;
                    }
                    
                    .blocked-info p {
                        color: var(--text-secondary);
                        font-size: 0.9375rem;
                        margin-bottom: var(--spacing-sm);
                    }
                    
                    .blocked-info p:last-child {
                        margin-bottom: 0;
                    }
                    
                    .contact-admin {
                        display: flex;
                        flex-direction: column;
                        gap: var(--spacing-sm);
                    }
                    
                    .contact-btn {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: var(--spacing-sm);
                        padding: var(--spacing-md) var(--spacing-lg);
                        background: var(--primary);
                        color: white;
                        border: none;
                        border-radius: var(--radius-lg);
                        font-size: 1rem;
                        font-weight: 600;
                        text-decoration: none;
                        transition: all var(--transition-fast);
                    }
                    
                    .contact-btn:hover {
                        background: var(--primary-hover);
                        transform: translateY(-2px);
                    }
                `}</style>
            </div>
        );
    }

    // If has permission, show the real calendar
    return <AppointmentCalendarComponent />;
}

// Services Management for mechanics with permission
import AdminServicesComponent from '../admin/AdminServices';
import { Settings } from 'lucide-react';

export function MechanicServices() {
    const { hasPermission } = useAuth();

    // If user doesn't have permission, show blocked message
    if (!hasPermission('can_create_services')) {
        return (
            <div className="blocked-page">
                <div className="blocked-content">
                    <div className="blocked-icon">
                        <Lock size={64} />
                    </div>
                    <h1 className="blocked-title">Acceso Bloqueado</h1>
                    <p className="blocked-subtitle">
                        No tienes permisos para gestionar servicios
                    </p>

                    <div className="blocked-info">
                        <p>
                            Tu cuenta no tiene habilitada la opción de crear o gestionar servicios.
                        </p>
                        <p>
                            Contacta al administrador si necesitas acceso a esta función.
                        </p>
                    </div>
                </div>

                <style>{`
                    .blocked-page {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 70vh;
                        padding: var(--spacing-xl);
                    }
                    
                    .blocked-content {
                        text-align: center;
                        max-width: 400px;
                    }
                    
                    .blocked-icon {
                        width: 100px;
                        height: 100px;
                        background: rgba(239, 68, 68, 0.1);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto var(--spacing-lg);
                        color: var(--danger);
                    }
                    
                    .blocked-title {
                        font-size: 1.5rem;
                        font-weight: 700;
                        color: var(--danger);
                        margin-bottom: var(--spacing-xs);
                    }
                    
                    .blocked-subtitle {
                        font-size: 1rem;
                        color: var(--text-secondary);
                        margin-bottom: var(--spacing-xl);
                    }
                    
                    .blocked-info {
                        background: var(--bg-secondary);
                        border-radius: var(--radius-lg);
                        padding: var(--spacing-lg);
                        margin-bottom: var(--spacing-xl);
                        text-align: left;
                    }
                    
                    .blocked-info p {
                        color: var(--text-secondary);
                        font-size: 0.9375rem;
                        margin-bottom: var(--spacing-sm);
                    }
                    
                    .blocked-info p:last-child {
                        margin-bottom: 0;
                    }
                `}</style>
            </div>
        );
    }

    // If has permission, show AdminServices component
    return <AdminServicesComponent />;
}

// Real component exports
export { default as MechanicNewOrder } from './NewServiceOrder';
export { default as MechanicOrders } from './MechanicOrders';
export { default as MechanicOrderDetail } from './OrderDetail';
export { default as MechanicHistory } from './MechanicHistory';
export { default as MechanicEarnings } from './MechanicEarnings';
export { default as MasterRequests } from './MasterRequests';
export { default as AuxiliaryDashboard } from './AuxiliaryDashboard';
export { default as MyRequests } from './MyRequests';
export { default as AuxiliaryPayments } from './AuxiliaryPayments';
export { default as AuxiliaryOrders } from './AuxiliaryOrders';
export { default as WhatsAppConnect } from './WhatsAppConnect';

// Componente placeholder
function PlaceholderPage({ title, subtitle }) {
    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">{title}</h1>
                <p className="page-subtitle">{subtitle}</p>
            </div>
            <div className="card">
                <div className="card-body">
                    <div className="empty-state">
                        <p className="empty-state-title">En construcción</p>
                        <p className="empty-state-message">
                            Esta sección está siendo desarrollada
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
