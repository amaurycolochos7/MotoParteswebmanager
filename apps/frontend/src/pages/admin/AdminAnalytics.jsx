import { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import {
    BarChart3,
    TrendingUp,
    DollarSign,
    ClipboardList,
    Users,
    Calendar,
    ArrowUp,
    ArrowDown
} from 'lucide-react';

export default function AdminAnalytics() {
    const { orders, clients } = useData();

    // Calcular estadísticas
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    const thisMonthOrders = orders.filter(o => new Date(o.created_at) >= thisMonth);
    const lastMonthOrders = orders.filter(o =>
        new Date(o.created_at) >= lastMonth && new Date(o.created_at) <= lastMonthEnd
    );

    const thisMonthRevenue = orders
        .filter(o => o.is_paid && new Date(o.paid_at) >= thisMonth)
        .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    const lastMonthRevenue = orders
        .filter(o => o.is_paid && new Date(o.paid_at) >= lastMonth && new Date(o.paid_at) <= lastMonthEnd)
        .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

    const revenueChange = lastMonthRevenue > 0
        ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
        : 100;

    const ordersChange = lastMonthOrders.length > 0
        ? ((thisMonthOrders.length - lastMonthOrders.length) / lastMonthOrders.length * 100).toFixed(1)
        : 100;

    // Órdenes por estado
    const ordersByStatus = orders.reduce((acc, order) => {
        const status = order.status?.name || 'Sin estado';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    // Servicios más populares
    const serviceCount = {};
    orders.forEach(order => {
        order.services?.forEach(service => {
            serviceCount[service.name] = (serviceCount[service.name] || 0) + 1;
        });
    });
    const topServices = Object.entries(serviceCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    return (
        <div className="admin-analytics">
            {/* Header */}
            <div className="page-header">
                <h1 className="page-title">Reportes y Estadísticas</h1>
                <p className="page-subtitle">
                    Resumen del rendimiento del taller
                </p>
            </div>

            {/* KPIs principales */}
            <div className="kpi-grid mb-xl">
                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-success">
                        <DollarSign size={28} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{formatCurrency(thisMonthRevenue)}</div>
                        <div className="kpi-label">Ingresos del mes</div>
                        <div className={`kpi-change ${parseFloat(revenueChange) >= 0 ? 'positive' : 'negative'}`}>
                            {parseFloat(revenueChange) >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                            {Math.abs(revenueChange)}% vs mes anterior
                        </div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-primary">
                        <ClipboardList size={28} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{thisMonthOrders.length}</div>
                        <div className="kpi-label">Órdenes del mes</div>
                        <div className={`kpi-change ${parseFloat(ordersChange) >= 0 ? 'positive' : 'negative'}`}>
                            {parseFloat(ordersChange) >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                            {Math.abs(ordersChange)}% vs mes anterior
                        </div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-secondary">
                        <Users size={28} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{clients.length}</div>
                        <div className="kpi-label">Total clientes</div>
                    </div>
                </div>

                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-warning">
                        <TrendingUp size={28} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">
                            {thisMonthOrders.length > 0
                                ? formatCurrency(thisMonthRevenue / thisMonthOrders.length)
                                : formatCurrency(0)}
                        </div>
                        <div className="kpi-label">Ticket promedio</div>
                    </div>
                </div>
            </div>

            {/* Gráficos */}
            <div className="analytics-grid">
                {/* Órdenes por Estado */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <BarChart3 size={20} />
                            Órdenes por Estado
                        </h3>
                    </div>
                    <div className="card-body">
                        <div className="status-bars">
                            {Object.entries(ordersByStatus).map(([status, count]) => (
                                <div key={status} className="status-bar-item">
                                    <div className="status-bar-header">
                                        <span className="status-name">{status}</span>
                                        <span className="status-count">{count}</span>
                                    </div>
                                    <div className="status-bar-track">
                                        <div
                                            className="status-bar-fill"
                                            style={{
                                                width: `${(count / orders.length) * 100}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Servicios más populares */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">
                            <TrendingUp size={20} />
                            Servicios Más Populares
                        </h3>
                    </div>
                    <div className="card-body">
                        {topServices.length === 0 ? (
                            <p className="text-muted text-center">No hay datos de servicios</p>
                        ) : (
                            <div className="top-services">
                                {topServices.map(([name, count], index) => (
                                    <div key={name} className="top-service-item">
                                        <span className="service-rank">{index + 1}</span>
                                        <span className="service-name">{name}</span>
                                        <span className="service-count">{count} veces</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .analytics-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-lg);
                }

                @media (max-width: 1024px) {
                    .analytics-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .kpi-change {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    font-weight: 500;
                    margin-top: 4px;
                }

                .kpi-change.positive {
                    color: var(--success);
                }

                .kpi-change.negative {
                    color: var(--danger);
                }

                .status-bars {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .status-bar-item {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .status-bar-header {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.8125rem;
                }

                .status-name {
                    font-weight: 500;
                }

                .status-count {
                    color: var(--text-muted);
                }

                .status-bar-track {
                    height: 8px;
                    background: var(--bg-hover);
                    border-radius: var(--radius-full);
                    overflow: hidden;
                }

                .status-bar-fill {
                    height: 100%;
                    background: var(--primary);
                    border-radius: var(--radius-full);
                    min-width: 4px;
                }

                .top-services {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .top-service-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-sm);
                    background: var(--bg-hover);
                    border-radius: var(--radius-md);
                }

                .service-rank {
                    width: 24px;
                    height: 24px;
                    background: var(--primary);
                    color: white;
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .service-name {
                    flex: 1;
                    font-weight: 500;
                }

                .service-count {
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                }
            `}</style>
        </div>
    );
}
