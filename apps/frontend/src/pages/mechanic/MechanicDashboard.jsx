import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  Plus, ChevronRight, Bike, TrendingUp, ArrowRight, FileText,
  CheckCircle2, Clock, AlertTriangle, ClipboardList,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { quotationsService } from '../../lib/api';
import { ActionCard, StatusChip, EmptyState, Button } from '../../components/ui';

export default function MechanicDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orders, loading } = useData();

  // ELIHU: cotizaciones por autorizar (pendiente/enviada).
  const [pendingQuotes, setPendingQuotes] = useState(0);
  useEffect(() => {
    let cancelled = false;
    quotationsService.getAll().then(({ data }) => {
      if (cancelled || !Array.isArray(data)) return;
      const n = data.filter((q) => ['pendiente', 'enviada'].includes((q.status || '').toLowerCase())).length;
      setPendingQuotes(n);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const myActiveOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(o => o.mechanic_id === user?.id && !o.status?.is_terminal);
  }, [orders, user]);

  const stats = useMemo(() => {
    if (!orders || !user) {
      return { weekEarnings: 0, prevWeekEarnings: 0, inProcess: 0, readyToDeliver: 0, finishedToday: 0, authorized: 0, deliveryDue: 0 };
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

    const weekOrders = myPaidOrders.filter(o => new Date(o.paid_at || o.created_at) >= weekStart);
    const weekEarnings = weekOrders.reduce((sum, o) => sum + (parseFloat(o.labor_total) || 0), 0);

    const prevWeekOrders = myPaidOrders.filter(o => {
      const d = new Date(o.paid_at || o.created_at);
      return d >= prevWeekStart && d < weekStart;
    });
    const prevWeekEarnings = prevWeekOrders.reduce((sum, o) => sum + (parseFloat(o.labor_total) || 0), 0);

    const inProcess = myActiveOrders.filter(o => {
      const s = (o.status?.name || '').toLowerCase();
      return !s.includes('lista') && !s.includes('entregar');
    }).length;
    const readyToDeliver = myActiveOrders.filter(o => {
      const s = (o.status?.name || '').toLowerCase();
      return s.includes('lista') || s.includes('entregar');
    }).length;
    const finishedToday = myOrders.filter(o => {
      if (!o.status?.is_terminal) return false;
      return new Date(o.updated_at || o.created_at) >= todayStart;
    }).length;
    const authorized = myActiveOrders.filter(o => (o.status?.name || '').toLowerCase().includes('autorizada')).length;
    const soon = new Date(now); soon.setDate(soon.getDate() + 2);
    const deliveryDue = myActiveOrders.filter(o => o.estimated_delivery_at && new Date(o.estimated_delivery_at) <= soon).length;

    return { weekEarnings, prevWeekEarnings, inProcess, readyToDeliver, finishedToday, authorized, deliveryDue };
  }, [orders, user, myActiveOrders]);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);

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

  if (loading) {
    return (
      <div className="mdash">
        <div className="mdash__skel" style={{ width: '40%', height: 26 }} />
        <div className="mdash__skel" style={{ width: '30%', height: 14, marginBottom: 22 }} />
        <div className="mdash__skel" style={{ height: 78, borderRadius: 22, marginBottom: 12 }} />
        <div className="mdash__skel" style={{ height: 78, borderRadius: 22, marginBottom: 24 }} />
        <div className="mdash__skel" style={{ height: 72, borderRadius: 22, marginBottom: 8 }} />
        <div className="mdash__skel" style={{ height: 72, borderRadius: 22 }} />
      </div>
    );
  }

  return (
    <div className="mdash">
      {/* Greeting */}
      <header className="mdash__greet">
        <h1 className="mdash__name">Hola, {user?.full_name?.split(' ')[0] || 'mecánico'}</h1>
        <p className="mdash__status">
          {myActiveOrders.length > 0
            ? `${myActiveOrders.length} orden${myActiveOrders.length > 1 ? 'es' : ''} activa${myActiveOrders.length > 1 ? 's' : ''}`
            : 'Sin órdenes activas hoy'}
          <span className="mdash__date"> · {todayFormatted}</span>
        </p>
      </header>

      {/* Primary actions */}
      <div className="mdash__actions">
        <ActionCard
          to="/mechanic/new-order"
          tone="brand"
          icon={<Plus size={22} strokeWidth={2.4} />}
          title="Crear nueva orden"
          subtitle="Recibe una moto al taller"
        />
        <ActionCard
          to="/mechanic/quotations/new"
          tone="neutral"
          icon={<FileText size={20} strokeWidth={2.2} />}
          title="Nueva cotización"
          subtitle="Cotiza antes de autorizar"
        />
      </div>

      {/* Active orders */}
      <section className="mdash__block">
        <div className="mdash__block-head">
          <h2 className="mdash__block-title">Órdenes activas</h2>
          {myActiveOrders.length > 0 && (
            <button className="mdash__link" onClick={() => navigate('/mechanic/orders')}>
              Ver todas <ChevronRight size={15} />
            </button>
          )}
        </div>

        {myActiveOrders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={26} />}
            title="Sin órdenes activas"
            message="Cuando recibas una moto, aparecerá aquí."
            action={<Button onClick={() => navigate('/mechanic/new-order')} variant="primary" size="sm" leftIcon={<Plus size={16} />}>Nueva orden</Button>}
          />
        ) : (
          <div className="mdash__orders">
            {myActiveOrders.slice(0, 5).map(order => (
              <button key={order.id} className="mdash__order" onClick={() => navigate(`/mechanic/order/${order.id}`)}>
                <div className="mdash__order-main">
                  <div className="mdash__order-client">{order.client?.full_name}</div>
                  {order.motorcycle && (
                    <div className="mdash__order-moto">
                      <Bike size={12} /> {order.motorcycle?.brand} {order.motorcycle?.model}
                    </div>
                  )}
                  <div className="mdash__order-code">#{order.order_number}</div>
                </div>
                <StatusChip status={order.status?.name} />
                <ArrowRight size={15} className="mdash__order-arrow" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Quick metrics — unified strip */}
      <div className="mdash__stats">
        <button className="mdash__stat" onClick={() => navigate('/mechanic/orders')}>
          <span className="mdash__stat-val">{stats.inProcess}</span>
          <span className="mdash__stat-lbl">En proceso</span>
        </button>
        <span className="mdash__stat-sep" />
        <button className="mdash__stat" onClick={() => navigate('/mechanic/orders')}>
          <span className="mdash__stat-val mdash__stat-val--success">{stats.readyToDeliver}</span>
          <span className="mdash__stat-lbl">Listas</span>
        </button>
        <span className="mdash__stat-sep" />
        <button className="mdash__stat" onClick={() => navigate('/mechanic/history')}>
          <span className="mdash__stat-val">{stats.finishedToday}</span>
          <span className="mdash__stat-lbl">Finalizadas</span>
        </button>
      </div>

      {/* ELIHU metrics — unified strip */}
      <div className="mdash__stats">
        <button className="mdash__stat" onClick={() => navigate('/mechanic/orders')}>
          <span className="mdash__stat-val mdash__stat-val--brand"><CheckCircle2 size={15} />{stats.authorized}</span>
          <span className="mdash__stat-lbl">Autorizadas</span>
        </button>
        <span className="mdash__stat-sep" />
        <button className="mdash__stat" onClick={() => navigate('/mechanic/quotations')}>
          <span className="mdash__stat-val mdash__stat-val--warning"><FileText size={15} />{pendingQuotes}</span>
          <span className="mdash__stat-lbl">Por autorizar</span>
        </button>
        <span className="mdash__stat-sep" />
        <button className="mdash__stat" onClick={() => navigate('/mechanic/orders')}>
          <span className={`mdash__stat-val ${stats.deliveryDue > 0 ? 'mdash__stat-val--warning' : ''}`}>
            {stats.deliveryDue > 0 ? <AlertTriangle size={15} /> : <Clock size={15} />}{stats.deliveryDue}
          </span>
          <span className="mdash__stat-lbl">Entregas</span>
        </button>
      </div>

      {/* Earnings */}
      <button className="mdash__earn" onClick={() => navigate('/mechanic/earnings?period=week')}>
        <div className="mdash__earn-top">
          <span className="mdash__earn-label">Ingresos de la semana</span>
          {weekGrowth !== null && (
            <span className={`mdash__earn-badge ${weekGrowth >= 0 ? 'up' : 'down'}`}>
              <TrendingUp size={12} />{weekGrowth >= 0 ? '+' : ''}{weekGrowth}%
            </span>
          )}
        </div>
        <span className="mdash__earn-amount">{formatCurrency(stats.weekEarnings)}</span>
      </button>

      <style>{`
        .mdash { padding: 20px 16px 40px; max-width: 720px; margin: 0 auto; }
        .mdash__skel { background: var(--surface-recessed); border-radius: 8px; margin-bottom: 8px; animation: mp-skel 1.4s infinite; }
        @keyframes mp-skel { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }

        .mdash__greet { margin-bottom: 20px; }
        .mdash__name { font-size: 26px; font-weight: 700; letter-spacing: -0.022em; color: var(--color-ink); margin: 0; line-height: 1.1; }
        .mdash__status { font-size: 14px; color: var(--text-secondary); margin: 4px 0 0; font-weight: 400; }
        .mdash__date { color: var(--text-muted); }

        .mdash__actions { display: flex; flex-direction: column; gap: 10px; margin-bottom: 26px; }

        .mdash__block { margin-bottom: 22px; }
        .mdash__block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .mdash__block-title { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--color-ink); margin: 0; }
        .mdash__link { display: inline-flex; align-items: center; gap: 2px; font-size: 13px; font-weight: 500; color: var(--text-secondary); background: none; border: none; cursor: pointer; }
        .mdash__link:hover { color: var(--color-ink); }

        .mdash__orders { display: flex; flex-direction: column; gap: 8px; }
        .mdash__order { display: flex; align-items: center; gap: 10px; width: 100%; padding: 14px 16px; background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-card); cursor: pointer; font-family: var(--font-text); text-align: left; transition: border-color var(--transition-fast), transform var(--transition-fast); }
        .mdash__order:hover { border-color: #d2d2d7; transform: translateY(-1px); }
        .mdash__order-main { flex: 1; min-width: 0; }
        .mdash__order-client { font-size: 15px; font-weight: 600; color: var(--color-ink); line-height: 1.2; }
        .mdash__order-moto { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
        .mdash__order-code { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
        .mdash__order-arrow { color: var(--text-muted); flex-shrink: 0; }

        .mdash__stats { display: flex; align-items: stretch; background: var(--surface-card); border: 1px solid var(--border-color); border-radius: 18px; padding: 4px 0; margin-bottom: 10px; }
        .mdash__stat { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 14px 6px; background: none; border: none; cursor: pointer; font-family: var(--font-text); transition: background var(--transition-fast); border-radius: 12px; }
        .mdash__stat:hover { background: var(--surface-recessed); }
        .mdash__stat-val { display: inline-flex; align-items: center; gap: 5px; font-size: 25px; font-weight: 700; color: var(--color-ink); line-height: 1; letter-spacing: -0.02em; }
        .mdash__stat-val--success { color: var(--success); }
        .mdash__stat-val--brand { color: var(--brand-primary); }
        .mdash__stat-val--warning { color: var(--warning); }
        .mdash__stat-lbl { font-size: 11.5px; color: var(--text-secondary); font-weight: 500; text-align: center; line-height: 1.2; }
        .mdash__stat-sep { width: 1px; background: var(--border-color); margin: 12px 0; flex-shrink: 0; }

        .mdash__earn { display: block; width: 100%; text-align: left; margin-top: 12px; padding: 18px 20px; background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-card); cursor: pointer; font-family: var(--font-text); transition: border-color var(--transition-fast); }
        .mdash__earn:hover { border-color: #d2d2d7; }
        .mdash__earn-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
        .mdash__earn-label { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
        .mdash__earn-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: var(--radius-pill); }
        .mdash__earn-badge.up { background: var(--success-light); color: var(--success-hover); }
        .mdash__earn-badge.down { background: var(--danger-light); color: var(--danger-hover); }
        .mdash__earn-badge.down svg { transform: rotate(180deg); }
        .mdash__earn-amount { font-size: 32px; font-weight: 700; color: var(--color-ink); line-height: 1; letter-spacing: -0.022em; }
      `}</style>
    </div>
  );
}
