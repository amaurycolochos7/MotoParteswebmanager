import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  Plus,
  ChevronRight,
  Bike,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

export default function MechanicDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orders, loading } = useData();

  const myActiveOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o =>
      o.mechanic_id === user?.id && !o.status?.is_terminal
    );
  }, [orders, user]);

  const stats = useMemo(() => {
    if (!orders || !user) {
      return { weekEarnings: 0, prevWeekEarnings: 0, inProcess: 0, readyToDeliver: 0, finishedToday: 0 };
    }

    const now = new Date();

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const myOrders = orders.filter(o => o.mechanic_id === user.id);
    const myPaidOrders = myOrders.filter(o => o.is_paid);

    const weekOrders = myPaidOrders.filter(o =>
      new Date(o.paid_at || o.created_at) >= weekStart
    );
    const weekEarnings = weekOrders.reduce((sum, o) => sum + (parseFloat(o.labor_total) || 0), 0);

    const prevWeekOrders = myPaidOrders.filter(o => {
      const d = new Date(o.paid_at || o.created_at);
      return d >= prevWeekStart && d < weekStart;
    });
    const prevWeekEarnings = prevWeekOrders.reduce((sum, o) => sum + (parseFloat(o.labor_total) || 0), 0);

    const inProcess = myActiveOrders.filter(o => {
      const statusName = (o.status?.name || '').toLowerCase();
      return !statusName.includes('lista') && !statusName.includes('entregar');
    }).length;

    const readyToDeliver = myActiveOrders.filter(o => {
      const statusName = (o.status?.name || '').toLowerCase();
      return statusName.includes('lista') || statusName.includes('entregar');
    }).length;

    const finishedToday = myOrders.filter(o => {
      if (!o.status?.is_terminal) return false;
      const d = new Date(o.updated_at || o.created_at);
      return d >= todayStart;
    }).length;

    return { weekEarnings, prevWeekEarnings, inProcess, readyToDeliver, finishedToday };
  }, [orders, user, myActiveOrders]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const todayFormatted = useMemo(() => {
    const now = new Date();
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }, []);

  const weekGrowth = useMemo(() => {
    if (stats.prevWeekEarnings === 0 && stats.weekEarnings === 0) return null;
    if (stats.prevWeekEarnings === 0) return 100;
    return Math.round(((stats.weekEarnings - stats.prevWeekEarnings) / stats.prevWeekEarnings) * 100);
  }, [stats]);

  const getStatusChip = (statusName) => {
    const name = (statusName || '').toLowerCase();
    if (name.includes('lista') || name.includes('entregar')) {
      return { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' };
    }
    if (name.includes('diagnóstico') || name.includes('diagnostico')) {
      return { bg: '#FEF9C3', color: '#A16207', border: '#FDE68A' };
    }
    return { bg: '#F3F4F6', color: '#374151', border: '#E5E7EB' };
  };

  if (loading) {
    return (
      <div className="db">
        <div style={{ height: 20, width: '30%', background: '#E5E7EB', borderRadius: 4, marginBottom: 4 }}></div>
        <div style={{ height: 14, width: '25%', background: '#F3F4F6', borderRadius: 3, marginBottom: 20 }}></div>
        <div style={{ height: 60, background: '#E5E7EB', borderRadius: 10, marginBottom: 28 }}></div>
        <div style={{ height: 14, width: '35%', background: '#E5E7EB', borderRadius: 3, marginBottom: 12 }}></div>
        {[1, 2].map(i => <div key={i} style={{ height: 72, background: '#F3F4F6', borderRadius: 10, marginBottom: 8 }}></div>)}
        <div style={{ height: 80, background: '#F3F4F6', borderRadius: 10, marginTop: 20, marginBottom: 8 }}></div>
        <div style={{ height: 80, background: '#F3F4F6', borderRadius: 10 }}></div>
      </div>
    );
  }

  return (
    <div className="db">
      {/* ===== HEADER ===== */}
      <div className="db-h">
        <h1 className="db-name">{user?.full_name?.split(' ')[0]}</h1>
        <span className="db-status">
          {myActiveOrders.length > 0
            ? `${myActiveOrders.length} orden${myActiveOrders.length > 1 ? 'es' : ''} activa${myActiveOrders.length > 1 ? 's' : ''}`
            : 'Sin órdenes activas'}
        </span>
        <span className="db-date">{todayFormatted}</span>
      </div>

      {/* ===== CTA ===== */}
      <Link to="/mechanic/new-order" className="db-cta">
        <Plus size={22} strokeWidth={2.5} />
        Crear nueva orden
      </Link>

      {/* ===== ÓRDENES ACTIVAS (PROTAGONISTA) ===== */}
      <div className="db-block">
        <div className="db-block-head">
          <h2 className="db-block-title">Órdenes activas</h2>
          {myActiveOrders.length > 0 && (
            <Link to="/mechanic/orders" className="db-link">
              Todo <ChevronRight size={15} />
            </Link>
          )}
        </div>

        {myActiveOrders.length === 0 ? (
          <div className="db-empty">
            <p>Sin órdenes activas</p>
            <Link to="/mechanic/new-order" className="db-empty-btn">
              <Plus size={15} /> Nueva orden
            </Link>
          </div>
        ) : (
          <div className="db-list">
            {myActiveOrders.slice(0, 5).map(order => {
              const chip = getStatusChip(order.status?.name);
              return (
                <button
                  key={order.id}
                  className="db-ord"
                  onClick={() => navigate(`/mechanic/order/${order.id}`)}
                >
                  <div className="db-ord-main">
                    <div className="db-ord-client">{order.client?.full_name}</div>
                    {order.motorcycle && (
                      <div className="db-ord-moto">
                        <Bike size={12} />
                        {order.motorcycle?.brand} {order.motorcycle?.model}
                      </div>
                    )}
                    <div className="db-ord-code">#{order.order_number}</div>
                  </div>
                  <span
                    className="db-chip"
                    style={{ background: chip.bg, color: chip.color, borderColor: chip.border }}
                  >
                    {order.status?.name}
                  </span>
                  <ArrowRight size={15} className="db-arrow" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== RESUMEN RÁPIDO ===== */}
      <div className="db-stats">
        <div className="db-stat" onClick={() => navigate('/mechanic/orders')}>
          <span className="db-stat-n">{stats.inProcess}</span>
          <span className="db-stat-l">En proceso</span>
        </div>
        <div className="db-stat-div"></div>
        <div className="db-stat" onClick={() => navigate('/mechanic/orders')}>
          <span className="db-stat-n db-stat-n--g">{stats.readyToDeliver}</span>
          <span className="db-stat-l">Listas</span>
        </div>
        <div className="db-stat-div"></div>
        <div className="db-stat" onClick={() => navigate('/mechanic/history')}>
          <span className="db-stat-n">{stats.finishedToday}</span>
          <span className="db-stat-l">Finalizadas</span>
        </div>
      </div>

      {/* ===== INGRESOS ===== */}
      <div className="db-earn" onClick={() => navigate('/mechanic/earnings?period=week')}>
        <div className="db-earn-top">
          <span className="db-earn-label">Ingresos semana</span>
          {weekGrowth !== null && (
            <span className={`db-earn-badge ${weekGrowth >= 0 ? 'up' : 'down'}`}>
              <TrendingUp size={12} />
              {weekGrowth >= 0 ? '+' : ''}{weekGrowth}%
            </span>
          )}
        </div>
        <span className="db-earn-amount">{formatCurrency(stats.weekEarnings)}</span>
      </div>

      <style>{`
        .db {
          background: #F4F5F7;
          min-height: 100%;
          padding: 20px 18px 40px;
        }

        /* ===== HEADER ===== */
        .db-h {
          margin-bottom: 20px;
        }

        .db-name {
          font-size: 24px;
          font-weight: 800;
          color: #0F172A;
          margin: 0;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        .db-status {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin-top: 3px;
        }

        .db-date {
          display: block;
          font-size: 11px;
          color: #9CA3AF;
          font-weight: 500;
          margin-top: 2px;
          letter-spacing: 0.02em;
        }

        /* ===== CTA ===== */
        .db-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          height: 60px;
          background: #111827;
          color: #F9FAFB;
          border: none;
          border-radius: 10px;
          font-size: 17px;
          font-weight: 700;
          font-family: inherit;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.12s;
          margin-bottom: 28px;
          letter-spacing: -0.01em;
        }

        .db-cta:hover { background: #000; }
        .db-cta:active { transform: scale(0.995); }

        /* ===== BLOCK ===== */
        .db-block {
          margin-bottom: 20px;
        }

        .db-block-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .db-block-title {
          font-size: 13px;
          font-weight: 700;
          color: #0F172A;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .db-link {
          display: flex;
          align-items: center;
          gap: 1px;
          font-size: 12px;
          font-weight: 600;
          color: #9CA3AF;
          text-decoration: none;
        }
        .db-link:hover { color: #374151; }

        /* ===== EMPTY ===== */
        .db-empty {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 28px 16px;
          text-align: center;
        }

        .db-empty p {
          font-size: 13px;
          color: #9CA3AF;
          margin: 0 0 10px;
        }

        .db-empty-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 8px 16px;
          background: #111827;
          color: white;
          font-size: 12px;
          font-weight: 700;
          border-radius: 8px;
          text-decoration: none;
        }

        /* ===== ORDERS ===== */
        .db-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .db-ord {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px 14px;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          transition: border-color 0.12s;
        }

        .db-ord:hover {
          border-color: #D1D5DB;
        }

        .db-ord:active {
          background: #FAFAFA;
        }

        .db-ord-main {
          flex: 1;
          min-width: 0;
        }

        .db-ord-client {
          font-size: 15px;
          font-weight: 700;
          color: #0F172A;
          line-height: 1.2;
        }

        .db-ord-moto {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #9CA3AF;
          margin-top: 1px;
        }

        .db-ord-code {
          font-size: 11px;
          color: #D1D5DB;
          margin-top: 2px;
          font-weight: 500;
        }

        .db-chip {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          border: 1px solid;
          flex-shrink: 0;
          letter-spacing: 0.01em;
        }

        .db-arrow {
          color: #D1D5DB;
          flex-shrink: 0;
        }

        /* ===== STATS ===== */
        .db-stats {
          display: flex;
          align-items: center;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 14px 0;
          margin-bottom: 10px;
        }

        .db-stat {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          cursor: pointer;
        }

        .db-stat-n {
          font-size: 26px;
          font-weight: 800;
          color: #0F172A;
          line-height: 1;
        }

        .db-stat-n--g { color: #15803D; }

        .db-stat-l {
          font-size: 10px;
          color: #9CA3AF;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .db-stat-div {
          width: 1px;
          height: 32px;
          background: #E5E7EB;
          flex-shrink: 0;
        }

        /* ===== EARNINGS ===== */
        .db-earn {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 10px;
          padding: 16px 18px;
          cursor: pointer;
          transition: border-color 0.12s;
        }

        .db-earn:hover { border-color: #D1D5DB; }

        .db-earn-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .db-earn-label {
          font-size: 11px;
          font-weight: 700;
          color: #9CA3AF;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .db-earn-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .db-earn-badge.up {
          background: #DCFCE7;
          color: #15803D;
        }

        .db-earn-badge.down {
          background: #FEE2E2;
          color: #DC2626;
        }

        .db-earn-badge.down svg {
          transform: rotate(180deg);
        }

        .db-earn-amount {
          font-size: 32px;
          font-weight: 800;
          color: #0F172A;
          line-height: 1;
          letter-spacing: -0.02em;
        }
      `}</style>
    </div>
  );
}
