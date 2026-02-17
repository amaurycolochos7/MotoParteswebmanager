import { useState, useEffect, useMemo } from 'react';
import { authService } from '../../lib/api';
import { useData } from '../../context/DataContext';
import { Link } from 'react-router-dom';
import {
    Wrench,
    DollarSign,
    ClipboardList,
    User,
    Percent,
    Edit2,
    Phone,
    Mail,
    CheckCircle,
    Clock
} from 'lucide-react';

export default function AdminMechanics() {
    const { orders } = useData();
    const [allUsers, setAllUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('month');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const users = await authService.getAllUsers();
            setAllUsers(users || []);
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filtrar solo mecánicos (role: mechanic o admin_mechanic)
    const mechanics = useMemo(() => {
        return allUsers.filter(u => u.role === 'mechanic' || u.role === 'admin_mechanic');
    }, [allUsers]);

    // Calcular estadísticas por mecánico
    const mechanicsWithStats = useMemo(() => {
        // Determinar fecha de inicio según filtro
        const now = new Date();
        let startDate = new Date();

        if (dateRange === 'week') {
            startDate.setDate(now.getDate() - 7);
        } else if (dateRange === 'month') {
            startDate.setMonth(now.getMonth() - 1);
        } else {
            startDate.setFullYear(now.getFullYear() - 1);
        }

        return mechanics.map(mechanic => {
            // Órdenes del mecánico en el período
            const mechanicOrders = orders.filter(o =>
                o.mechanic_id === mechanic.id &&
                new Date(o.created_at) >= startDate
            );

            // Órdenes completadas (pagadas)
            const completedOrders = mechanicOrders.filter(o => o.is_paid);

            // Órdenes activas (no pagadas)
            const activeOrders = mechanicOrders.filter(o => !o.is_paid);

            // Total mano de obra
            const totalLabor = completedOrders.reduce((sum, o) =>
                sum + (parseFloat(o.labor_total) || 0), 0
            );

            // Comisión calculada
            const commissionRate = (mechanic.commission_percentage || 10) / 100;
            const totalCommission = totalLabor * commissionRate;

            return {
                ...mechanic,
                totalOrders: mechanicOrders.length,
                completedOrders: completedOrders.length,
                activeOrders: activeOrders.length,
                totalLabor,
                totalCommission
            };
        }).sort((a, b) => b.totalLabor - a.totalLabor);
    }, [mechanics, orders, dateRange]);

    // Totales generales
    const totals = useMemo(() => {
        return {
            labor: mechanicsWithStats.reduce((sum, m) => sum + m.totalLabor, 0),
            commission: mechanicsWithStats.reduce((sum, m) => sum + m.totalCommission, 0),
            completed: mechanicsWithStats.reduce((sum, m) => sum + m.completedOrders, 0),
            active: mechanicsWithStats.reduce((sum, m) => sum + m.activeOrders, 0)
        };
    }, [mechanicsWithStats]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    const getRankBadge = (index) => {
        if (index === 0) return { emoji: '🥇', color: '#ffd700' };
        if (index === 1) return { emoji: '🥈', color: '#c0c0c0' };
        if (index === 2) return { emoji: '🥉', color: '#cd7f32' };
        return { emoji: `${index + 1}°`, color: 'var(--text-muted)' };
    };

    if (loading) {
        return (
            <div className="loading-overlay" style={{ position: 'relative', minHeight: 400 }}>
                <div className="spinner spinner-lg"></div>
                <p>Cargando mecánicos...</p>
            </div>
        );
    }

    return (
        <div className="admin-mechanics">
            {/* Header */}
            <div className="page-header-mobile">
                <div>
                    <h1 className="page-title">Equipo de Mecánicos</h1>
                    <p className="page-subtitle">
                        {mechanics.length} mecánico{mechanics.length !== 1 ? 's' : ''} en el taller
                    </p>
                </div>
                <div className="date-filter">
                    <button
                        className={`btn btn-sm ${dateRange === 'week' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setDateRange('week')}
                    >
                        Semana
                    </button>
                    <button
                        className={`btn btn-sm ${dateRange === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setDateRange('month')}
                    >
                        Mes
                    </button>
                    <button
                        className={`btn btn-sm ${dateRange === 'year' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setDateRange('year')}
                    >
                        Año
                    </button>
                </div>
            </div>

            {/* Resumen KPI */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-success">
                        <DollarSign size={24} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{formatCurrency(totals.labor)}</div>
                        <div className="kpi-label">Mano de Obra Total</div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-warning">
                        <Percent size={24} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{formatCurrency(totals.commission)}</div>
                        <div className="kpi-label">Comisiones a Pagar</div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-primary">
                        <CheckCircle size={24} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{totals.completed}</div>
                        <div className="kpi-label">Órdenes Completadas</div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-secondary">
                        <Clock size={24} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{totals.active}</div>
                        <div className="kpi-label">Órdenes Activas</div>
                    </div>
                </div>
            </div>

            {/* Lista de mecánicos */}
            {mechanics.length === 0 ? (
                <div className="card">
                    <div className="card-body">
                        <div className="empty-state">
                            <Wrench size={48} className="empty-state-icon" />
                            <p className="empty-state-title">No hay mecánicos</p>
                            <p className="empty-state-message">
                                Crea usuarios con rol "Mecánico" para verlos aquí
                            </p>
                            <Link to="/admin/users" className="btn btn-primary mt-md">
                                Ir a Usuarios
                            </Link>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mechanics-grid">
                    {mechanicsWithStats.map((mechanic, index) => {
                        const rank = getRankBadge(index);
                        return (
                            <div key={mechanic.id} className={`mechanic-card ${!mechanic.is_active ? 'inactive' : ''}`}>
                                {/* Header con ranking */}
                                <div className="mechanic-card-header">
                                    <div className="mechanic-rank" style={{ color: rank.color }}>
                                        {rank.emoji}
                                    </div>
                                    <div className="mechanic-avatar">
                                        {mechanic.full_name?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="mechanic-info">
                                        <h3 className="mechanic-name">{mechanic.full_name}</h3>
                                        <span className="commission-badge">
                                            {mechanic.commission_percentage || 10}% comisión
                                        </span>
                                    </div>
                                    <Link
                                        to={`/admin/users/${mechanic.id}/orders`}
                                        className="btn btn-ghost btn-icon-sm"
                                        title="Ver historial de servicios"
                                    >
                                        <ClipboardList size={16} />
                                    </Link>
                                </div>

                                {/* Contacto */}
                                <div className="mechanic-contact">
                                    {mechanic.phone && (
                                        <a href={`tel:${mechanic.phone}`} className="contact-item">
                                            <Phone size={14} />
                                            {mechanic.phone}
                                        </a>
                                    )}
                                    {mechanic.email && (
                                        <span className="contact-item">
                                            <Mail size={14} />
                                            {mechanic.email}
                                        </span>
                                    )}
                                </div>

                                {/* Estadísticas */}
                                <div className="mechanic-stats-grid">
                                    <div className="stat-box">
                                        <ClipboardList size={16} />
                                        <div className="stat-content">
                                            <span className="stat-value">{mechanic.completedOrders}</span>
                                            <span className="stat-label">Completadas</span>
                                        </div>
                                    </div>
                                    <div className="stat-box active">
                                        <Clock size={16} />
                                        <div className="stat-content">
                                            <span className="stat-value">{mechanic.activeOrders}</span>
                                            <span className="stat-label">Activas</span>
                                        </div>
                                    </div>
                                    <div className="stat-box money">
                                        <DollarSign size={16} />
                                        <div className="stat-content">
                                            <span className="stat-value">{formatCurrency(mechanic.totalLabor)}</span>
                                            <span className="stat-label">Mano de Obra</span>
                                        </div>
                                    </div>
                                    <div className="stat-box highlight">
                                        <Percent size={16} />
                                        <div className="stat-content">
                                            <span className="stat-value">{formatCurrency(mechanic.totalCommission)}</span>
                                            <span className="stat-label">Comisión</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Estado */}
                                {!mechanic.is_active && (
                                    <div className="inactive-badge">Usuario inactivo</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                .date-filter {
                    display: flex;
                    gap: var(--spacing-xs);
                    flex-wrap: wrap;
                }

                .mechanics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                    gap: var(--spacing-lg);
                }

                .mechanic-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .mechanic-card.inactive {
                    opacity: 0.6;
                }

                .mechanic-card-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .mechanic-rank {
                    font-size: 1.5rem;
                    min-width: 40px;
                    text-align: center;
                }

                .mechanic-avatar {
                    width: 44px;
                    height: 44px;
                    background: var(--primary);
                    color: white;
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    font-size: 0.9rem;
                    flex-shrink: 0;
                }

                .mechanic-info {
                    flex: 1;
                    min-width: 0;
                }

                .mechanic-name {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 600;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .commission-badge {
                    display: inline-block;
                    font-size: 0.6875rem;
                    padding: 2px 8px;
                    background: var(--success-light);
                    color: var(--success);
                    border-radius: var(--radius-sm);
                    margin-top: 4px;
                }

                .mechanic-contact {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--spacing-md);
                    padding: var(--spacing-sm) 0;
                    border-bottom: 1px solid var(--border-light);
                }

                .contact-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                    text-decoration: none;
                }

                .contact-item:hover {
                    color: var(--primary);
                }

                .mechanic-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-sm);
                }

                .stat-box {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-hover);
                    border-radius: var(--radius-md);
                }

                .stat-box svg {
                    color: var(--text-muted);
                    flex-shrink: 0;
                }

                .stat-box.active svg {
                    color: var(--warning);
                }

                .stat-box.money svg {
                    color: var(--primary);
                }

                .stat-box.highlight {
                    background: var(--success-light);
                }

                .stat-box.highlight svg {
                    color: var(--success);
                }

                .stat-content {
                    display: flex;
                    flex-direction: column;
                }

                .stat-box .stat-value {
                    font-size: 0.9375rem;
                    font-weight: 700;
                }

                .stat-box .stat-label {
                    font-size: 0.6875rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                }

                .stat-box.highlight .stat-value {
                    color: var(--success);
                }

                .inactive-badge {
                    text-align: center;
                    padding: var(--spacing-xs);
                    background: var(--danger-light);
                    color: var(--danger);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                @media (max-width: 480px) {
                    .page-header-mobile {
                        flex-direction: column;
                        gap: var(--spacing-md);
                    }

                    .mechanics-grid {
                        grid-template-columns: 1fr;
                    }

                    .mechanic-stats-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
}
