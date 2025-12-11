import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Filter } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import OrderCard from '../../components/ui/OrderCard';

export default function MechanicOrders() {
    const { user } = useAuth();
    const { getActiveOrders, statuses } = useData();

    const activeOrders = useMemo(() => {
        return getActiveOrders(user?.id) || [];
    }, [getActiveOrders, user?.id]);

    return (
        <div className="mechanic-orders">
            <div className="page-header">
                <h1 className="page-title">
                    <ClipboardList size={24} />
                    Mis Servicios
                </h1>
                <p className="page-subtitle">{activeOrders.length} servicios activos</p>
            </div>

            {activeOrders.length === 0 ? (
                <div className="empty-state card">
                    <ClipboardList size={48} className="empty-state-icon" />
                    <h3>Sin servicios activos</h3>
                    <p className="text-secondary">Cuando crees órdenes de servicio aparecerán aquí</p>
                    <Link to="/mechanic/new-order" className="btn btn-primary mt-md">
                        Nueva Orden
                    </Link>
                </div>
            ) : (
                <div className="orders-list">
                    {activeOrders.map(order => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            statuses={statuses}
                        />
                    ))}
                </div>
            )}

            <style>{`
        .mechanic-orders {
          padding-bottom: 100px;
        }

        .page-header {
          margin-bottom: var(--spacing-xl);
        }

        .page-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-size: 1.5rem;
          margin-bottom: var(--spacing-xs);
        }

        .orders-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }
      `}</style>
        </div>
    );
}
