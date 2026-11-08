import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileText, ClipboardList, ArrowRight, Bike, CalendarClock, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { appointmentsService, quotationsService } from '../../lib/api';
import { Panel, Chip, Stat, Skeleton, StatusChip, EmptyState } from '../../components/ui';
import CommissionCard from '../../components/dashboard/CommissionCard';
import './Dashboard.css';

const WEEKDAY = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function whenLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const t = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (sameDay) return `Hoy ${t}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Mañana ${t}`;
  return `${d.getDate()} ${MONTH[d.getMonth()].slice(0, 3)} ${t}`;
}

export default function MechanicDashboard() {
  const navigate = useNavigate();
  const { user, isManager, teamRole } = useAuth();
  const { orders, loading } = useData();

  // Cotizaciones por autorizar
  const [pendingQuotes, setPendingQuotes] = useState(0);
  useEffect(() => {
    let off = false;
    quotationsService.getAll().then(({ data }) => {
      if (off || !Array.isArray(data)) return;
      setPendingQuotes(data.filter((q) => ['pendiente', 'enviada'].includes((q.status || '').toLowerCase())).length);
    }).catch(() => {});
    return () => { off = true; };
  }, []);

  // Citas por revisar (bandeja del usuario; si aun no existe la ruta, cae a la lista general)
  const [pendingAppts, setPendingAppts] = useState([]);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await appointmentsService.inbox();
        if (!off) setPendingAppts(r.pending || []);
      } catch {
        try {
          const all = await appointmentsService.getAll();
          const mine = (Array.isArray(all) ? all : []).filter((a) => a.status === 'pending_external' && (isManager || a.assigned_mechanic_id === user?.id));
          if (!off) setPendingAppts(mine);
        } catch { /* sin citas */ }
      }
    })();
    return () => { off = true; };
  }, [user?.id, isManager]);

  const myActive = useMemo(
    () => (orders || []).filter((o) => o.mechanic_id === user?.id && !o.status?.is_terminal),
    [orders, user],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const mine = (orders || []).filter((o) => o.mechanic_id === user?.id);
    const nameOf = (o) => (o.status?.name || '').toLowerCase();
    const ready = myActive.filter((o) => nameOf(o).includes('lista') || nameOf(o).includes('entregar')).length;
    const soon = new Date(now); soon.setDate(soon.getDate() + 2);
    return {
      inProcess: myActive.length - ready,
      ready,
      authorized: myActive.filter((o) => nameOf(o).includes('autorizada')).length,
      deliveryDue: myActive.filter((o) => o.estimated_delivery_at && new Date(o.estimated_delivery_at) <= soon).length,
      finishedToday: mine.filter((o) => o.status?.is_terminal && new Date(o.updated_at || o.created_at) >= todayStart).length,
    };
  }, [orders, user, myActive]);

  const now = new Date();
  const dateLong = `${WEEKDAY[now.getDay()]} ${now.getDate()} de ${MONTH[now.getMonth()]}`;
  const first = user?.full_name?.split(' ')[0] || 'equipo';

  if (loading) {
    return (
      <div className="dx">
        <Skeleton w="38%" h={30} /><Skeleton w="22%" h={14} style={{ marginTop: 10 }} />
        <div className="dx-grid" style={{ marginTop: 20 }}>
          <div className="dx-main"><Skeleton h={180} r={12} /><Skeleton h={260} r={12} style={{ marginTop: 16 }} /></div>
          <div className="dx-side"><Skeleton h={200} r={12} /><Skeleton h={160} r={12} style={{ marginTop: 16 }} /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dx k-rise">
      <header className="k-pagehead">
        <div>
          <p className="dx-eyebrow">{dateLong}</p>
          <h1>Hola, {first}</h1>
          <p>
            {myActive.length > 0
              ? `${myActive.length} ${myActive.length === 1 ? 'orden activa' : 'órdenes activas'}`
              : 'Sin órdenes activas por ahora'}
            {pendingAppts.length > 0 && ` · ${pendingAppts.length} ${pendingAppts.length === 1 ? 'cita por revisar' : 'citas por revisar'}`}
          </p>
        </div>
        <div className="k-pagehead__actions">
          <Link className="k-btn k-btn--red" to="/mechanic/new-order"><Plus size={18} /> Nueva orden</Link>
          <Link className="k-btn k-btn--ghost" to="/mechanic/quotations/new"><FileText size={17} /> Cotización</Link>
        </div>
      </header>

      <div className="dx-grid">
        {/* Comisión: lo primero que se ve, sobre todo en celular */}
        <aside className="dx-side">
          <CommissionCard title={teamRole === 'maestro' || isManager ? 'Tu comisión' : 'Tu comisión'} />

          <Panel title="Estado del trabajo" className="dx-state">
            <div className="dx-statgrid">
              <button type="button" className="dx-statbtn" onClick={() => navigate('/mechanic/orders')}><Stat label="En proceso" value={stats.inProcess} /></button>
              <button type="button" className="dx-statbtn" onClick={() => navigate('/mechanic/orders')}><Stat label="Listas" value={stats.ready} tone="ok" /></button>
              <button type="button" className="dx-statbtn" onClick={() => navigate('/mechanic/orders')}><Stat label="Autorizadas" value={stats.authorized} /></button>
              <button type="button" className="dx-statbtn" onClick={() => navigate('/mechanic/quotations')}><Stat label="Por autorizar" value={pendingQuotes} tone={pendingQuotes ? 'warn' : 'ink'} /></button>
              <button type="button" className="dx-statbtn" onClick={() => navigate('/mechanic/orders')}><Stat label="Entregas 48 h" value={stats.deliveryDue} tone={stats.deliveryDue ? 'red' : 'ink'} /></button>
              <button type="button" className="dx-statbtn" onClick={() => navigate('/mechanic/history')}><Stat label="Cerradas hoy" value={stats.finishedToday} /></button>
            </div>
          </Panel>
        </aside>

        <section className="dx-main">
          {pendingAppts.length > 0 && (
            <Panel
              title="Citas por revisar"
              hint="Solicitudes que esperan tu respuesta"
              icon={<CalendarClock />}
              action={<Link className="dx-more" to="/mechanic/appointments">Ver todas <ArrowRight size={14} /></Link>}
              padded={false}
            >
              <ul className="dx-list">
                {pendingAppts.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <button type="button" className="dx-row" onClick={() => navigate(`/mechanic/appointments?cita=${a.id}`)}>
                      <span className="dx-row__main">
                        <strong>{a.client?.full_name || a.client_name_ext || 'Cliente'}</strong>
                        <span className="dx-row__sub"><Bike size={13} /> {a.moto_label || (a.motorcycle ? `${a.motorcycle.brand} ${a.motorcycle.model}` : 'Moto sin dato')} · {a.service_type || 'Servicio'}</span>
                      </span>
                      <span className="dx-row__side">
                        <Chip tone="red">{whenLabel(a.scheduled_date)}</Chip>
                        <ChevronRight size={16} className="dx-row__go" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title="Órdenes activas"
            icon={<ClipboardList />}
            action={myActive.length > 0 ? <Link className="dx-more" to="/mechanic/orders">Ver todas <ArrowRight size={14} /></Link> : null}
            padded={myActive.length === 0}
          >
            {myActive.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={26} />}
                title="Sin órdenes activas"
                message="Cuando recibas una moto, aparecerá aquí."
                action={<Link className="k-btn k-btn--sm" to="/mechanic/new-order"><Plus size={16} /> Nueva orden</Link>}
              />
            ) : (
              <ul className="dx-list">
                {myActive.slice(0, 7).map((o) => (
                  <li key={o.id}>
                    <button type="button" className="dx-row" onClick={() => navigate(`/mechanic/order/${o.id}`)}>
                      <span className="dx-row__main">
                        <span className="dx-folio mono">{o.order_number}</span>
                        <strong>{o.client?.full_name || 'Cliente'}</strong>
                        <span className="dx-row__sub"><Bike size={13} /> {o.motorcycle ? `${o.motorcycle.brand} ${o.motorcycle.model}` : 'Sin moto'}</span>
                      </span>
                      <span className="dx-row__side">
                        <StatusChip status={o.status?.name} />
                        <ChevronRight size={16} className="dx-row__go" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
      </div>
    </div>
  );
}
