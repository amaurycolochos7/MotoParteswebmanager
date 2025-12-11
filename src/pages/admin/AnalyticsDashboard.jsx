import { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { BarChart3, TrendingUp, Users, Wrench, DollarSign, Calendar } from 'lucide-react';

export default function AnalyticsDashboard() {
    const { orders, clients, services } = useData();
    const [period, setPeriod] = useState('month'); // 'week' | 'month' | 'year' | 'all'

    // Filter orders by period
    const filteredOrders = useMemo(() => {
        const now = new Date();
        const filterDate = new Date();

        switch (period) {
            case 'week':
                filterDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                filterDate.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                filterDate.setFullYear(now.getFullYear() - 1);
                break;
            default:
                return orders;
        }

        return orders.filter(o => new Date(o.created_at) >= filterDate);
    }, [orders, period]);

    // Calculate metrics
    const metrics = useMemo(() => {
        const completedOrders = filteredOrders.filter(o => o.status === 'Entregada');
        const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const averageTicket = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;
        const paidOrders = filteredOrders.filter(o => o.is_paid);

        // Most requested services
        const serviceCounts = {};
        filteredOrders.forEach(order => {
            order.services?.forEach(service => {
                serviceCounts[service.name] = (serviceCounts[service.name] || 0) + 1;
            });
        });

        const topServices = Object.entries(serviceCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        // Top clients
        const clientOrders = {};
        filteredOrders.forEach(order => {
            const client = clients.find(c => c.id === order.client_id);
            if (client) {
                if (!clientOrders[client.id]) {
                    clientOrders[client.id] = { client, count: 0, total: 0 };
                }
                clientOrders[client.id].count++;
                clientOrders[client.id].total += (order.total_amount || 0);
            }
        });

        const topClients = Object.values(clientOrders)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            totalOrders: filteredOrders.length,
            completedOrders: completedOrders.length,
            totalRevenue,
            averageTicket,
            paidOrders: paidOrders.length,
            topServices,
            topClients
        };
    }, [filteredOrders, clients]);

    const periodLabels = {
        week: 'Última Semana',
        month: 'Último Mes',
        year: 'Último Año',
        all: 'Todo el Tiempo'
    };

    return (
        <div className="analytics-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <BarChart3 size={28} />
                        Analíticas y Reportes
                    </h1>
                    <p className="page-subtitle">Métricas de rendimiento del taller</p>
                </div>
            </div>

            {/* Period Selector */}
            <div className="period-selector">
                {Object.entries(periodLabels).map(([key, label]) => (
                    <button
                        key={key}
                        className={`period-button ${period === key ? 'active' : ''}`}
                        onClick={() => setPeriod(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Summary Cards */}
            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-icon revenue">
                        <DollarSign size={24} />
                    </div>
                    <div className="metric-content">
                        <div className="metric-label">Ingresos Totales</div>
                        <div className="metric-value">${metrics.totalRevenue.toLocaleString('es-MX')}</div>
                        <div className="metric-detail">{metrics.completedOrders} órdenes completadas</div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon orders">
                        <Wrench size={24} />
                    </div>
                    <div className="metric-content">
                        <div className="metric-label">Órdenes Totales</div>
                        <div className="metric-value">{metrics.totalOrders}</div>
                        <div className="metric-detail">{metrics.paidOrders} pagadas</div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon average">
                        <TrendingUp size={24} />
                    </div>
                    <div className="metric-content">
                        <div className="metric-label">Ticket Promedio</div>
                        <div className="metric-value">${Math.round(metrics.averageTicket).toLocaleString('es-MX')}</div>
                        <div className="metric-detail">Por orden completada</div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon clients">
                        <Users size={24} />
                    </div>
                    <div className="metric-content">
                        <div className="metric-label">Clientes Únicos</div>
                        <div className="metric-value">{metrics.topClients.length}</div>
                        <div className="metric-detail">En este período</div>
                    </div>
                </div>
            </div>

            {/* ReportsTop Services */}
            <div className="report-section card">
                <h3 className="report-title">
                    <Wrench size={20} />
                    Servicios Más Solicitados
                </h3>
                {metrics.topServices.length > 0 ? (
                    <div className="services-chart">
                        {metrics.topServices.map((service, idx) => {
                            const percentage = metrics.topServices.length > 0 ?
                                (service.count / metrics.topServices[0].count) * 100 : 0;
                            return (
                                <div key={idx} className="chart-bar-item">
                                    <div className="chart-label">
                                        <span>{service.name}</span>
                                        <strong>{service.count} veces</strong>
                                    </div>
                                    <div className="chart-bar">
                                        <div className="chart-fill" style={{ width: `${percentage}%` }}></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="empty-message">No hay datos para mostrar</p>
                )}
            </div>

            {/* Top Clients */}
            <div className="report-section card">
                <h3 className="report-title">
                    <Users size={20} />
                    Clientes Más Frecuentes
                </h3>
                {metrics.topClients.length > 0 ? (
                    <div className="clients-list">
                        {metrics.topClients.map((item, idx) => (
                            <div key={idx} className="client-item">
                                <div className="client-rank">#{idx + 1}</div>
                                <div className="client-info">
                                    <div className="client-name">{item.client.full_name}</div>
                                    <div className="client-stats">
                                        {item.count} visita{item.count > 1 ? 's' : ''} • ${item.total.toLocaleString('es-MX')}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="empty-message">No hay datos para mostrar</p>
                )}
            </div>

            <style>{`
                .analytics-page {
                    padding-bottom: 80px;
                }

                .page-header {
                    margin-bottom: var(--spacing-xl);
                }

                .page-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: 4px;
                }

                .page-subtitle {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .period-selector {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-xl);
                    overflow-x: auto;
                    padding-bottom: var(--spacing-sm);
                }

                .period-button {
                    padding: var(--spacing-sm) var(--spacing-lg);
                    border: 2px solid var(--border-color);
                    background: var(--bg-card);
                    border-radius: var(--radius-md);
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    white-space: nowrap;
                }

                .period-button:hover {
                    border-color: var(--primary);
                    background: var(--primary-light);
                }

                .period-button.active {
                    background: var(--primary);
                    border-color: var(--primary);
                    color: white;
                }

                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-xl);
                }

                .metric-card {
                    display: flex;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    transition: transform var(--transition-fast);
                }

                .metric-card:hover {
                    transform: translateY(-2px);
                }

                .metric-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .metric-icon.revenue {
                    background: rgba(16, 185, 129, 0.15);
                    color: #10b981;
                }

                .metric-icon.orders {
                    background: rgba(59, 130, 246, 0.15);
                    color: var(--primary);
                }

                .metric-icon.average {
                    background: rgba(245, 158, 11, 0.15);
                    color: #f59e0b;
                }

                .metric-icon.clients {
                    background: rgba(168, 85, 247, 0.15);
                    color: #a855f7;
                }

                .metric-content {
                    flex: 1;
                }

                .metric-label {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                    margin-bottom: 4px;
                }

                .metric-value {
                    font-size: 1.75rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 2px;
                }

                .metric-detail {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }

                .report-section {
                    padding: var(--spacing-lg);
                    margin-bottom: var(--spacing-lg);
                }

                .report-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1.125rem;
                    font-weight: 600;
                    margin-bottom: var(--spacing-lg);
                }

                .services-chart {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .chart-bar-item {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xs);
                }

                .chart-label {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.875rem;
                }

                .chart-label strong {
                    color: var(--primary);
                    font-weight: 600;
                }

                .chart-bar {
                    height: 8px;
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-full);
                    overflow: hidden;
                }

                .chart-fill {
                    height: 100%;
                    background: linear-gradient(90deg, var(--primary), var(--secondary));
                    border-radius: var(--radius-full);
                    transition: width 0.5s ease;
                }

                .clients-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .client-item {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    border-radius: var(--radius-md);
                }

                .client-rank {
                    width: 32px;
                    height: 32px;
                    background: var(--primary-light);
                    color: var(--primary);
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 0.875rem;
                    flex-shrink: 0;
                }

                .client-info {
                    flex: 1;
                }

                .client-name {
                    font-weight: 600;
                    font-size: 0.9375rem;
                    margin-bottom: 2px;
                }

                .client-stats {
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .empty-message {
                    text-align: center;
                    color: var(--text-secondary);
                    padding: var(--spacing-xl);
                }
            `}</style>
        </div>
    );
}
