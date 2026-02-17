import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowLeft, History, AlertCircle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import OrderCard from '../../components/ui/OrderCard';
import { authService, ordersService } from '../../lib/api';

export default function AdminMechanicOrders() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { statuses } = useData();
    const [mechanic, setMechanic] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                // 1. Obtener datos del mecánico
                const mechanicData = await authService.getProfile(id);
                setMechanic(mechanicData);

                // 2. Obtener TODAS las órdenes (Historial completo)
                const history = await ordersService.getByMechanic(id);
                setOrders(history || []);
            } catch (error) {
                console.error('Error loading mechanic history:', error);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            loadData();
        }
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="spinner spinner-lg"></div>
            </div>
        );
    }

    if (!mechanic) {
        return (
            <div className="empty-state">
                <AlertCircle size={48} />
                <h2>Mecánico no encontrado</h2>
                <button className="btn btn-primary mt-md" onClick={() => navigate('/admin/mechanics')}>
                    Volver a Mecánicos
                </button>
            </div>
        );
    }

    return (
        <div className="admin-mechanic-orders pb-20">
            <div className="page-header mb-xl">
                <button className="btn btn-ghost btn-icon mb-sm" onClick={() => navigate('/admin/mechanics')}>
                    <ArrowLeft size={24} />
                    <span>Volver</span>
                </button>

                <div className="flex items-start justify-between flex-wrap gap-md">
                    <div>
                        <h1 className="page-title flex items-center gap-sm text-2xl mb-xs">
                            <History size={28} />
                            Historial de {mechanic.full_name}
                        </h1>
                        <p className="page-subtitle text-secondary">
                            {orders.length} servicios registrados en total
                        </p>
                    </div>
                </div>
            </div>

            {orders.length === 0 ? (
                <div className="empty-state card">
                    <ClipboardList size={48} className="empty-state-icon" />
                    <h3>Sin historial de servicios</h3>
                    <p className="text-secondary">Este mecánico aún no ha realizado ningún servicio.</p>
                    <button onClick={() => navigate('/admin/mechanics')} className="btn btn-outline mt-md">
                        Volver a Mecánicos
                    </button>
                </div>
            ) : (
                <div className="orders-list flex flex-col gap-md">
                    {orders.map(order => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            statuses={statuses}
                            baseUrl="/admin/order"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
