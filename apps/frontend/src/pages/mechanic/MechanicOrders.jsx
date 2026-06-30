import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import OrderCard from '../../components/ui/OrderCard';
import { PageHeader, EmptyState, Button } from '../../components/ui';

export default function MechanicOrders() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { getActiveOrders, statuses } = useData();

    const activeOrders = useMemo(() => {
        return getActiveOrders(user?.id) || [];
    }, [getActiveOrders, user?.id]);

    const n = activeOrders.length;

    return (
        <div className="morders">
            <PageHeader
                title="Mis servicios"
                subtitle={`${n} servicio${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}`}
            />

            {n === 0 ? (
                <EmptyState
                    icon={<ClipboardList size={26} />}
                    title="Sin servicios activos"
                    message="Cuando crees órdenes de servicio aparecerán aquí."
                    action={<Button onClick={() => navigate('/mechanic/new-order')} leftIcon={<Plus size={16} />} size="sm">Nueva orden</Button>}
                />
            ) : (
                <div className="morders__list">
                    {activeOrders.map(order => (
                        <OrderCard key={order.id} order={order} statuses={statuses} />
                    ))}
                </div>
            )}

            <style>{`
                .morders { padding: 20px 16px 100px; max-width: 720px; margin: 0 auto; }
                .morders__list { display: flex; flex-direction: column; gap: 12px; }
            `}</style>
        </div>
    );
}
