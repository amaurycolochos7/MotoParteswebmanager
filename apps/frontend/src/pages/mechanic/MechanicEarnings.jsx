import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
    DollarSign,
    TrendingUp,
    Calendar,
    Percent,
    ClipboardList,
    ChevronDown,
    ChevronUp,
    Clock
} from 'lucide-react';

export default function MechanicEarnings() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { orders } = useData();
    const [searchParams] = useSearchParams();
    const periodFilter = searchParams.get('period'); // 'week' or 'month'

    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [showAllOrders, setShowAllOrders] = useState(false);
    const [viewMode, setViewMode] = useState(periodFilter || 'month'); // 'week' or 'month'

    // Update view mode when URL param changes
    useEffect(() => {
        if (periodFilter === 'week' || periodFilter === 'month') {
            setViewMode(periodFilter);
        }
    }, [periodFilter]);

    // Get commission percentage from user profile
    const commissionRate = user?.commission_percentage || 10;

    // Filter my completed orders
    const myCompletedOrders = useMemo(() => {
        return orders.filter(o =>
            o.mechanic_id === user?.id &&
            o.is_paid === true
        ).sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at));
    }, [orders, user?.id]);

    // Calculate earnings by month
    const earningsByMonth = useMemo(() => {
        const grouped = {};

        myCompletedOrders.forEach(order => {
            const date = new Date(order.completed_at || order.created_at);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!grouped[monthKey]) {
                grouped[monthKey] = {
                    month: monthKey,
                    orders: [],
                    totalLabor: 0,
                    totalCommission: 0
                };
            }

            const laborAmount = parseFloat(order.labor_total) || 0;
            const commission = laborAmount * (commissionRate / 100);

            grouped[monthKey].orders.push({
                ...order,
                laborAmount,
                commission
            });
            grouped[monthKey].totalLabor += laborAmount;
            grouped[monthKey].totalCommission += commission;
        });

        return Object.values(grouped).sort((a, b) => b.month.localeCompare(a.month));
    }, [myCompletedOrders, commissionRate]);

    // Current month data
    const currentMonthData = earningsByMonth.find(m => m.month === selectedMonth) || {
        orders: [],
        totalLabor: 0,
        totalCommission: 0
    };

    // Total earnings (all time)
    const totalEarnings = earningsByMonth.reduce((sum, m) => sum + m.totalCommission, 0);
    const totalOrders = myCompletedOrders.length;

    // Week earnings data
    const weekData = useMemo(() => {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
        weekStart.setHours(0, 0, 0, 0);

        const weekOrders = myCompletedOrders.filter(o => {
            const orderDate = new Date(o.paid_at || o.completed_at || o.created_at);
            return orderDate >= weekStart;
        });

        const ordersWithCommission = weekOrders.map(order => {
            const laborAmount = parseFloat(order.labor_total) || 0;
            const commission = laborAmount * (commissionRate / 100);
            return { ...order, laborAmount, commission };
        });

        const totalLabor = ordersWithCommission.reduce((sum, o) => sum + o.laborAmount, 0);
        const totalCommission = ordersWithCommission.reduce((sum, o) => sum + o.commission, 0);

        return {
            orders: ordersWithCommission,
            totalLabor,
            totalCommission,
            weekStart
        };
    }, [myCompletedOrders, commissionRate]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount || 0);
    };

    const formatMonthYear = (monthKey) => {
        const [year, month] = monthKey.split('-');
        const date = new Date(year, parseInt(month) - 1);
        return date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
    };

    // Generate month options (last 12 months)
    const monthOptions = useMemo(() => {
        const options = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        return options;
    }, []);
    // Get orders based on view mode
    const currentData = viewMode === 'week' ? weekData : currentMonthData;
    const displayedOrders = showAllOrders
        ? currentData.orders
        : currentData.orders.slice(0, 5);

    return (
        <div className="earnings-page">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Mis Ganancias</h1>
                    <p className="page-subtitle">
                        Resumen de tus comisiones
                    </p>
                </div>
            </div>

            {/* Commission Rate Card */}
            <div className="commission-rate-card">
                <div className="rate-icon">
                    <Percent size={24} />
                </div>
                <div className="rate-info">
                    <span className="rate-label">Tu tasa de comisión</span>
                    <span className="rate-value">{commissionRate}%</span>
                </div>
                <div className="rate-description">
                    sobre mano de obra
                </div>
            </div>

            {/* View Mode Toggle */}
            <div className="view-mode-toggle">
                <button
                    className={`toggle-btn ${viewMode === 'week' ? 'active' : ''}`}
                    onClick={() => setViewMode('week')}
                >
                    <Clock size={16} />
                    Esta Semana
                </button>
                <button
                    className={`toggle-btn ${viewMode === 'month' ? 'active' : ''}`}
                    onClick={() => setViewMode('month')}
                >
                    <Calendar size={16} />
                    Este Mes
                </button>
            </div>

            <div className="kpi-grid">
                <div className="kpi-card kpi-main">
                    <div className="kpi-icon kpi-icon-success">
                        <DollarSign size={24} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{formatCurrency(viewMode === 'week' ? weekData.totalCommission : currentMonthData.totalCommission)}</div>
                        <div className="kpi-label">{viewMode === 'week' ? 'Ganancia de la Semana' : 'Ganancia del Mes'}</div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-primary">
                        <TrendingUp size={24} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{formatCurrency(viewMode === 'week' ? weekData.totalLabor : currentMonthData.totalLabor)}</div>
                        <div className="kpi-label">Mano de Obra</div>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon kpi-icon-warning">
                        <Percent size={20} />
                    </div>
                    <div className="kpi-content">
                        <div className="kpi-value">{commissionRate}%</div>
                        <div className="kpi-label">Tu Comisión</div>
                    </div>
                </div>
            </div>

            {/* Period Header */}
            <div className="period-header">
                <h3>
                    {viewMode === 'week'
                        ? `Semana del ${weekData.weekStart.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`
                        : formatMonthYear(selectedMonth)
                    }
                </h3>
                {viewMode === 'month' && (
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="form-select period-select"
                    >
                        {monthOptions.map(month => (
                            <option key={month} value={month}>
                                {formatMonthYear(month)}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Orders List */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        <DollarSign size={18} />
                        Detalle de {formatMonthYear(selectedMonth)}
                    </h3>
                </div>
                <div className="card-body">
                    {currentData.orders.length === 0 ? (
                        <div className="empty-state">
                            <DollarSign size={48} className="empty-state-icon" />
                            <p className="empty-state-title">Sin ganancias {viewMode === 'week' ? 'esta semana' : 'este mes'}</p>
                            <p className="empty-state-message">
                                Completa órdenes para ver tus comisiones aquí
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="earnings-list">
                                {displayedOrders.map(order => (
                                    <div key={order.id} className="earning-item">
                                        <div className="earning-info">
                                            <div className="earning-order">
                                                {order.order_number}
                                            </div>
                                            <div className="earning-client">
                                                {order.client?.full_name}
                                            </div>
                                            <div className="earning-date">
                                                {new Date(order.completed_at || order.created_at).toLocaleDateString('es-MX')}
                                            </div>
                                        </div>
                                        <div className="earning-amounts">
                                            <div className="labor-amount">
                                                Mano de obra: {formatCurrency(order.laborAmount)}
                                            </div>
                                            <div className="commission-amount">
                                                +{formatCurrency(order.commission)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {currentData.orders.length > 5 && (
                                <button
                                    className="btn btn-secondary w-full mt-md"
                                    onClick={() => setShowAllOrders(!showAllOrders)}
                                >
                                    {showAllOrders ? (
                                        <><ChevronUp size={18} /> Ver menos</>
                                    ) : (
                                        <><ChevronDown size={18} /> Ver todas ({currentData.orders.length})</>
                                    )}
                                </button>
                            )}

                            {/* Period Summary */}
                            <div className="month-summary">
                                <div className="summary-row">
                                    <span>Total Mano de Obra:</span>
                                    <span>{formatCurrency(currentData.totalLabor)}</span>
                                </div>
                                <div className="summary-row">
                                    <span>Tu Comisión ({commissionRate}%):</span>
                                    <span className="commission-total">
                                        {formatCurrency(currentData.totalCommission)}
                                    </span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style>{`
                .earnings-page {
                    padding-bottom: 80px;
                }

                .commission-rate-card {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
                    border-radius: var(--radius-lg);
                    color: white;
                    margin-bottom: var(--spacing-lg);
                }

                .rate-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .rate-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .rate-label {
                    font-size: 0.8125rem;
                    opacity: 0.9;
                }

                .rate-value {
                    font-size: 1.75rem;
                    font-weight: 800;
                }

                .rate-description {
                    font-size: 0.75rem;
                    opacity: 0.8;
                    text-align: right;
                }

                .view-mode-toggle {
                    display: flex;
                    gap: var(--spacing-xs);
                    margin-bottom: var(--spacing-lg);
                    background: var(--bg-secondary);
                    padding: 4px;
                    border-radius: var(--radius-md);
                }

                .toggle-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    font-weight: 600;
                    border-radius: var(--radius-sm);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .toggle-btn.active {
                    background: var(--bg-card);
                    color: var(--primary);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .period-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                }

                .period-header h3 {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0;
                }

                .period-select {
                    max-width: 180px;
                    padding: var(--spacing-xs) var(--spacing-sm);
                    font-size: 0.8125rem;
                }

                .kpi-main {
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%);
                    border: 2px solid var(--success);
                }

                .kpi-clickable {
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .kpi-clickable:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    border-color: var(--primary);
                }

                .kpi-clickable:active {
                    transform: scale(0.98);
                }

                .month-selector {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }

                .month-selector label {
                    font-weight: 600;
                    color: var(--text-secondary);
                }

                .form-select {
                    flex: 1;
                    padding: var(--spacing-sm) var(--spacing-md);
                    border: 2px solid var(--border-color);
                    border-radius: var(--radius-md);
                    background: var(--bg-card);
                    font-size: 0.9375rem;
                    color: var(--text-primary);
                }

                .earnings-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .earning-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    border-radius: var(--radius-md);
                    gap: var(--spacing-md);
                }

                .earning-info {
                    flex: 1;
                    min-width: 0;
                }

                .earning-order {
                    font-weight: 700;
                    color: var(--primary);
                    font-size: 0.875rem;
                }

                .earning-client {
                    font-weight: 600;
                    font-size: 0.9375rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .earning-date {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }

                .earning-amounts {
                    text-align: right;
                    flex-shrink: 0;
                }

                .labor-amount {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .commission-amount {
                    font-size: 1rem;
                    font-weight: 700;
                    color: var(--success);
                }

                .month-summary {
                    margin-top: var(--spacing-lg);
                    padding-top: var(--spacing-lg);
                    border-top: 2px solid var(--border-color);
                }

                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-sm) 0;
                    font-size: 0.9375rem;
                }

                .summary-row:last-child {
                    font-weight: 700;
                    font-size: 1.125rem;
                    padding-top: var(--spacing-md);
                }

                .commission-total {
                    color: var(--success);
                }

                .w-full {
                    width: 100%;
                }

                @media (max-width: 480px) {
                    .earning-item {
                        flex-direction: column;
                        align-items: flex-start;
                    }

                    .earning-amounts {
                        text-align: left;
                        width: 100%;
                        padding-top: var(--spacing-sm);
                        border-top: 1px dashed var(--border-light);
                        margin-top: var(--spacing-sm);
                    }
                }
            `}</style>
        </div>
    );
}
