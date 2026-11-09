import './AppointmentsV2.css';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    Calendar, Plus, User, Phone, Wrench, X, Edit2, Trash2,
    AlertCircle, Check, Globe, RefreshCw, ThumbsUp, Ban,
    Copy, MessageCircle, Link2, StickyNote, Bike, Send, CalendarOff,
    UserCheck, ClipboardList
} from 'lucide-react';
import AppointmentModal from '../../components/appointments/AppointmentModal';
import {
    WhatsAppNotice, ProposeModal, ReasonModal, BlockedDaysModal, FlowStyles, fmtLong, fmtHour,
} from '../../components/appointments/AppointmentFlowParts';
import { appointmentsService } from '../../lib/api';
import { useData } from '../../context/DataContext';

const STATUS_LABELS = {
    scheduled: 'Agendada',
    pending_external: 'Por revisar',
    proposal_sent: 'Esperando al cliente',
    confirmed: 'Confirmada',
    rejected: 'No disponible',
    cancelled: 'Cancelada',
    expired: 'Propuesta vencida',
    completed: 'Completada',
};

const STATUS_COLORS = {
    scheduled: '#d71920',
    pending_external: '#f59e0b',
    proposal_sent: '#2563eb',
    confirmed: '#22c55e',
    rejected: '#ef4444',
    cancelled: '#86868b',
    expired: '#86868b',
    completed: '#10b981',
};

// Lo que el cliente hizo y el taller aun no ha visto
const ALERT_TEXT = {
    customer_accepted: 'El cliente aceptó tu propuesta y la cita quedó confirmada',
    customer_chose: 'El cliente pidió otra fecha — revísala',
    customer_cancelled: 'El cliente canceló su cita',
    customer_declined: 'El cliente rechazó la propuesta',
    expired: 'La propuesta venció sin respuesta',
};

const EVENT_TEXT = {
    requested: 'Solicitud recibida',
    accepted: 'Aceptaste la cita',
    proposed: 'Enviaste una propuesta',
    rejected: 'Marcaste no disponible',
    cancelled: 'Cancelaste la cita',
    customer_accepted: 'El cliente aceptó',
    customer_chose: 'El cliente pidió otra fecha',
    customer_declined: 'El cliente rechazó la propuesta',
    customer_cancelled: 'El cliente canceló',
    expired: 'Venció la propuesta',
    reminder: 'Recordatorio enviado',
    wa_failed: 'No se pudo enviar WhatsApp',
};

const MX = 'America/Mexico_City';
const dayNum = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', timeZone: MX });
const monShort = (iso) => new Date(iso).toLocaleDateString('es-MX', { month: 'short', timeZone: MX });
const fmtStamp = (iso) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: MX });

// Fecha/hora LOCAL para los <input type="date|time"> de la edicion de citas internas.
const pad2 = (n) => String(n).padStart(2, '0');
const toLocalDateInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toLocalTimeInput = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// Enlace publico para que los clientes agenden solos. Cada taller con landing
// propia tiene su entrada aqui (workspace_id -> URL).
const BOOKING_LINKS = {
    'c4bca2c8-1ca2-49c0-a084-8b677439c731': { url: 'https://vc.motopartes.cloud/cita', shop: 'MOTOPARTES' },
};

function BookingLinkCard({ link }) {
    const [copied, setCopied] = useState(false);
    const [phone, setPhone] = useState('');
    const message =
        `¡Hola! 👋 Para agendar tu cita en ${link.shop} entra a este enlace, ` +
        `elige el día y la hora y llena tus datos. Es rápido y te confirmamos por WhatsApp:\n${link.url}`;
    const digits = phone.replace(/\D/g, '');
    const validPhone = digits.length === 10;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link.url);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = link.url; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const share = () => {
        const base = validPhone ? `https://wa.me/52${digits}` : 'https://wa.me/';
        window.open(`${base}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    };

    return (
        <div className="booking-card">
            <div className="booking-head">
                <Link2 size={18} />
                <div>
                    <strong>Enlace para citas en línea</strong>
                    <span>Mándalo por WhatsApp a quien quiera agendar: ellos eligen día y hora y la cita te aparece aquí.</span>
                </div>
            </div>
            <div className="booking-url">{link.url}</div>
            <input
                className="booking-phone"
                type="tel"
                inputMode="numeric"
                placeholder="WhatsApp del cliente (opcional, 10 dígitos)"
                value={phone}
                maxLength={14}
                onChange={e => setPhone(e.target.value)}
            />
            <div className="booking-actions">
                <button type="button" className="booking-btn wa" onClick={share}>
                    <MessageCircle size={16} /> {validPhone ? 'Enviar a este cliente' : 'Enviar por WhatsApp'}
                </button>
                <button type="button" className="booking-btn" onClick={copy}>
                    {copied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar enlace</>}
                </button>
            </div>
        </div>
    );
}

const HIDDEN = new Set(['cancelled', 'completed', 'rejected', 'expired']);
const effDate = (a) => (a.status === 'proposal_sent' && a.proposed_date ? a.proposed_date : a.scheduled_date);

export default function AppointmentCalendar() {
    const { clients = [], motorcycles = [], users = [], addClient } = useData();
    const { user, activeWorkspace, workspaceRole } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const bookingLink = BOOKING_LINKS[activeWorkspace?.id] || null;

    // Enlace del aviso por WhatsApp: /mechanic/appointments?cita=<id> abre esa cita.
    const citaId = searchParams.get('cita');
    const [linkedApt, setLinkedApt] = useState(null);
    const [linkError, setLinkError] = useState('');
    const openedFor = useRef(null);
    const triedFetch = useRef(null);
    // Mecanicos y auxiliares ven primero SUS citas; dueno/admin ven todas.
    const [scope, setScope] = useState(() => (['mechanic', 'auxiliary'].includes(workspaceRole) ? 'mine' : 'all'));

    const [actionError, setActionError] = useState('');
    const [notice, setNotice] = useState(null);           // resultado del ultimo envio por WhatsApp
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('review');       // 'review' | 'today' | 'upcoming' | 'all' | 'closed'
    const startedRef = useRef(false);
    const [showList, setShowList] = useState(true); // la bandeja es la pantalla principal (sin menú intermedio)
    const [showNewModal, setShowNewModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedApt, setSelectedApt] = useState(null);
    const [editMode, setEditMode] = useState('edit');
    const [editData, setEditData] = useState({});
    const [cancelReason, setCancelReason] = useState('');
    const [actionLoading, setActionLoading] = useState(null);
    const [proposeFor, setProposeFor] = useState(null);
    const [reasonFor, setReasonFor] = useState(null);     // { apt, mode: 'reject' | 'cancel' }
    const [showBlocked, setShowBlocked] = useState(false);
    const [blockedDays, setBlockedDays] = useState([]);
    const [openHistory, setOpenHistory] = useState({});

    const loadAppointments = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await appointmentsService.getAll();
            setAppointments(Array.isArray(data) ? data : []);
        } catch {
            if (!silent) setAppointments([]);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    const loadBlocked = useCallback(async () => {
        try { const rows = await appointmentsService.blockedDays(); setBlockedDays(Array.isArray(rows) ? rows : []); } catch { /* sin dias */ }
    }, []);

    useEffect(() => { loadAppointments(); loadBlocked(); }, [loadAppointments, loadBlocked]);

    // El panel se mantiene en sincronia con el cliente: se refresca solo mientras la pantalla esta visible.
    useEffect(() => {
        const t = setInterval(() => { if (!document.hidden) loadAppointments(true); }, 15000);
        return () => clearInterval(t);
    }, [loadAppointments]);

    // "Mis citas" = las asignadas a mi usuario (la API devuelve todas las del taller).
    const scoped = scope === 'mine' ? appointments.filter(a => a.assigned_mechanic_id === user?.id) : appointments;
    const active = scoped.filter(a => !HIDDEN.has(a.status)).sort((a, b) => new Date(effDate(a)) - new Date(effDate(b)));
    const closed = scoped.filter(a => HIDDEN.has(a.status)).sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date));
    const toReview = scoped.filter(a => a.status === 'pending_external');
    const alerts = scoped.filter(a => a.shop_alert);
    const attention = new Set([...toReview, ...alerts].map(a => a.id)).size;

    // Bandeja: por revisar (lo que espera respuesta), hoy y próximas.
    const needsReview = (a) => a.status === 'pending_external' || a.shop_alert;
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: MX });
    const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: MX });
    const inbox = {
        review: active.filter(needsReview),
        today: active.filter(a => !needsReview(a) && dayKey(effDate(a)) === todayKey),
        upcoming: active.filter(a => !needsReview(a) && dayKey(effDate(a)) > todayKey),
    };
    const filtered = filter === 'review' ? inbox.review
        : filter === 'today' ? active.filter(a => dayKey(effDate(a)) === todayKey)
            : filter === 'upcoming' ? active.filter(a => dayKey(effDate(a)) > todayKey)
                : filter === 'closed' ? closed
                    : active;

    // La primera vez abre en "Por revisar" si hay algo pendiente; si no, en "Hoy".
    useEffect(() => {
        if (loading || startedRef.current) return;
        startedRef.current = true;
        if (!searchParams.get('cita')) setFilter(inbox.review.length > 0 ? 'review' : (inbox.today.length > 0 ? 'today' : 'upcoming'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

    // Abrir la cita del aviso: se muestra primero en la lista, sin importar filtros.
    useEffect(() => {
        if (!citaId || loading) return undefined;
        if (openedFor.current !== citaId) { openedFor.current = citaId; setShowList(true); setFilter('all'); }
        if (appointments.some(a => a.id === citaId)) { setLinkError(''); return undefined; }
        if (triedFetch.current === citaId) return undefined;
        triedFetch.current = citaId;
        let alive = true;
        appointmentsService.get(citaId)
            .then(a => { if (alive) { setLinkedApt(a); setLinkError(''); } })
            .catch(() => { if (alive) setLinkError('No encontramos esa cita. Puede que ya no exista o que sea de otro taller.'); });
        return () => { alive = false; };
    }, [citaId, loading, appointments]);

    const pinnedApt = citaId ? (appointments.find(a => a.id === citaId) || (linkedApt?.id === citaId ? linkedApt : null)) : null;
    const listItems = pinnedApt ? [pinnedApt, ...filtered.filter(a => a.id !== citaId)] : filtered;
    const clearCita = () => { setLinkedApt(null); setLinkError(''); setSearchParams({}, { replace: true }); };

    // Crear la orden con cliente, moto y mecanico ya puestos.
    const goCreateOrder = (apt) => {
        const q = new URLSearchParams({ cita: apt.id });
        if (apt.client_id) q.set('client', apt.client_id);
        if (apt.motorcycle_id) q.set('moto', apt.motorcycle_id);
        if (apt.assigned_mechanic_id) q.set('mechanic', apt.assigned_mechanic_id);
        if (!apt.client_id) {
            if (apt.client_phone) q.set('phone', apt.client_phone);
            if (apt.client_name_ext) q.set('name', apt.client_name_ext);
        }
        navigate(`/mechanic/new-order?${q.toString()}`);
    };

    const scopeTabs = (
        <div className="scope-tabs" role="tablist" aria-label="Qué citas ver">
            <button type="button" role="tab" aria-selected={scope === 'mine'} className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>Mis citas</button>
            <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>Todas</button>
        </div>
    );

    const clientName = (apt) => {
        if (apt.client?.full_name) return apt.client.full_name;
        if (apt.client_name_ext) return apt.client_name_ext;
        const c = clients.find(c => c.id === apt.client_id);
        return c?.full_name || 'Sin nombre';
    };

    const clientPhone = (apt) => {
        if (apt.client?.phone) return apt.client.phone;
        if (apt.client_phone) return apt.client_phone;
        const c = clients.find(c => c.id === apt.client_id);
        return c?.phone || null;
    };

    // Numero para wa.me: 10 digitos de Mexico -> 52 + numero; si ya trae lada, se respeta.
    const waNumber = (raw) => {
        const d = String(raw).replace(/\D/g, '');
        return d.length === 10 ? `52${d}` : d;
    };

    // ── Acciones del flujo ───────────────────────────────────────────────
    const handleAccept = async (apt) => {
        setActionError(''); setNotice(null);
        setActionLoading(apt.id + '_accept');
        try {
            const res = await appointmentsService.accept(apt.id);
            setNotice(res?.whatsapp || null);
            await loadAppointments(true);
        } catch (e) {
            setActionError(`No se pudo aceptar la cita: ${e?.message || 'error desconocido'}`);
        } finally {
            setActionLoading(null);
        }
    };

    const submitPropose = async ({ scheduled_date, note }) => {
        const res = await appointmentsService.propose(proposeFor.id, { scheduled_date, note });
        setNotice(res?.whatsapp || null); setActionError('');
        setProposeFor(null);
        await loadAppointments(true);
    };

    const submitReason = async (reason) => {
        const { apt, mode } = reasonFor;
        const res = mode === 'reject' ? await appointmentsService.reject(apt.id, reason) : await appointmentsService.cancel(apt.id, reason);
        setNotice(res?.whatsapp || null); setActionError('');
        setReasonFor(null);
        await loadAppointments(true);
    };

    const handleSeen = async (apt) => {
        setAppointments(list => list.map(a => (a.id === apt.id ? { ...a, shop_alert: false } : a)));
        try { await appointmentsService.seen(apt.id); } catch { /* se reintenta en el siguiente refresco */ }
    };

    const handleDeleteApt = async (apt) => {
        if (!window.confirm('¿Eliminar esta cita permanentemente? No se avisa al cliente.')) return;
        setActionError('');
        try {
            await appointmentsService.remove(apt.id);
            await loadAppointments(true);
        } catch (e) {
            setActionError(`No se pudo eliminar: ${e?.message || 'error desconocido'}`);
        }
    };

    // ── Citas internas (creadas desde la app) ────────────────────────────
    const handleSaveNew = async (data) => {
        setActionError('');
        try {
            // El modal manda fecha y hora por separado; la API solo lee scheduled_date.
            const { scheduled_time, estimated_duration, ...rest } = data;
            const when = new Date(`${data.scheduled_date}T${scheduled_time || '09:00'}`);
            await appointmentsService.create({
                ...rest,
                scheduled_date: when.toISOString(),
                created_by: user.id,
                status: 'scheduled',
            });
            setShowNewModal(false);
            await loadAppointments();
        } catch (e) {
            setActionError(`No se pudo guardar la cita: ${e?.message || 'error desconocido'}`);
        }
    };

    const openEdit = (apt) => {
        setSelectedApt(apt);
        const d = new Date(apt.scheduled_date);
        setEditData({
            scheduled_date: toLocalDateInput(d),
            scheduled_time: toLocalTimeInput(d),
        });
        setEditMode('edit');
        setCancelReason('');
        setShowEditModal(true);
    };

    const handleUpdate = async () => {
        if (!editData.scheduled_date || !editData.scheduled_time) return;
        setActionLoading('update');
        try {
            await appointmentsService.update(selectedApt.id, {
                scheduled_date: new Date(`${editData.scheduled_date}T${editData.scheduled_time}`).toISOString(),
            });
            setShowEditModal(false);
            await loadAppointments(true);
        } catch (e) {
            setActionError(`No se pudo guardar el cambio: ${e?.message || 'error desconocido'}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancel = async () => {
        if (!cancelReason.trim()) return;
        setActionLoading('cancel');
        try {
            const res = await appointmentsService.cancel(selectedApt.id, cancelReason.trim());
            setNotice(res?.whatsapp || null);
            setShowEditModal(false);
            await loadAppointments(true);
        } catch (e) {
            setActionError(`No se pudo cancelar: ${e?.message || 'error desconocido'}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('¿Eliminar esta cita permanentemente?')) return;
        setActionLoading('delete');
        try {
            await appointmentsService.remove(selectedApt.id);
            setShowEditModal(false);
            await loadAppointments(true);
        } finally {
            setActionLoading(null);
        }
    };

    const notices = (
        <>
            {actionError && <div className="apt-error" role="alert">{actionError}</div>}
            <WhatsAppNotice result={notice} onClose={() => setNotice(null)} />
        </>
    );

    return (
        <div className="appointments-page">
            <FlowStyles />
            {!showList ? (
                <div className="main-screen">
                    <div className="welcome-header">
                        <Calendar size={64} className="welcome-icon" />
                        <h1 className="welcome-title">Citas</h1>
                        <p className="welcome-subtitle">
                            {active.length} cita{active.length !== 1 ? 's' : ''} activa{active.length !== 1 ? 's' : ''}
                        </p>
                        {scopeTabs}
                        {attention > 0 && (
                            <div className="external-alert" onClick={() => { setFilter('external'); setShowList(true); }}>
                                <Globe size={16} />
                                <strong>{toReview.length}</strong> por revisar
                                {alerts.length > 0 && <> · <strong>{alerts.length}</strong> respuesta{alerts.length !== 1 ? 's' : ''} de clientes</>}
                                {' '}— toca para atender
                            </div>
                        )}
                    </div>

                    {notices}

                    <div className="main-buttons">
                        <button className="btn-main" onClick={() => { setFilter('all'); setShowList(true); }}>
                            <Calendar size={20} />
                            Ver Citas Activas
                        </button>
                        {(attention > 0 || appointments.some(a => a.source === 'external' && !HIDDEN.has(a.status))) && (
                            <button className="btn-main btn-warning" onClick={() => { setFilter('external'); setShowList(true); }}>
                                <Globe size={20} />
                                Citas del Sitio Web
                                {attention > 0 && <span className="btn-badge">{attention}</span>}
                            </button>
                        )}
                        <button className="btn-main btn-new" onClick={() => setShowNewModal(true)}>
                            <Plus size={20} />
                            Agendar Nueva Cita
                        </button>
                        <button className="btn-main btn-dark" onClick={() => setShowBlocked(true)}>
                            <CalendarOff size={20} />
                            Días sin servicio
                        </button>
                    </div>

                    {bookingLink && <BookingLinkCard link={bookingLink} />}
                </div>
            ) : (
                <div className="list-view">
                    <header className="k-pagehead">
                        <div>
                            <h1>Citas</h1>
                            <p>{inbox.review.length > 0 ? `${inbox.review.length} por revisar` : 'Sin pendientes por revisar'} · {active.length} activa{active.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="k-pagehead__actions">
                            <button type="button" className="k-btn k-btn--red" onClick={() => setShowNewModal(true)}><Plus size={18} /> Agendar cita</button>
                            <button type="button" className="k-btn k-btn--ghost" onClick={() => setShowBlocked(true)}><CalendarOff size={17} /> Días sin servicio</button>
                            <button type="button" className="k-btn k-btn--ghost" onClick={() => loadAppointments()} title="Actualizar" aria-label="Actualizar"><RefreshCw size={17} /></button>
                        </div>
                    </header>

                    <div className="apt-bar">
                        {scopeTabs}
                    </div>

                    {linkError && <div className="apt-error" role="alert">{linkError} <button type="button" className="apt-pinned-close" onClick={clearCita}>Cerrar</button></div>}

                    <div className="k-tabs k-tabs--line apt-tabs" role="tablist">
                        {[
                            { key: 'review', label: 'Por revisar', count: inbox.review.length, hot: true },
                            { key: 'today', label: 'Hoy', count: active.filter(a => dayKey(effDate(a)) === todayKey).length },
                            { key: 'upcoming', label: 'Próximas', count: active.filter(a => dayKey(effDate(a)) > todayKey).length },
                            { key: 'all', label: 'Todas', count: active.length },
                            { key: 'closed', label: 'Cerradas', count: closed.length },
                        ].map(f => (
                            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={`k-tab${filter === f.key ? ' is-active' : ''}${f.hot && f.count > 0 ? ' is-hot' : ''}`} onClick={() => setFilter(f.key)}>
                                <span>{f.label}</span><span className="k-tab__count">{f.count}</span>
                            </button>
                        ))}
                    </div>

                    {notices}

                    {bookingLink && <BookingLinkCard link={bookingLink} />}

                    {loading ? (
                        <div className="empty-state"><RefreshCw size={32} style={{ opacity: 0.3 }} /><p>Cargando...</p></div>
                    ) : listItems.length === 0 ? (
                        <div className="empty-state">
                            <Calendar size={56} style={{ opacity: 0.3 }} />
                            <h3>{scope === 'mine' ? 'Sin citas para ti' : 'Sin citas'}</h3>
                            <p className="text-secondary">
                                {scope === 'mine' ? 'No tienes citas en este filtro. Revisa "Todas" para ver las del taller.' : 'No hay citas en este filtro'}
                            </p>
                        </div>
                    ) : (
                        <div className="appointments-list">
                            {listItems.map(apt => {
                                const isPinned = apt.id === citaId;
                                const name = clientName(apt);
                                const phone = clientPhone(apt);
                                const moto = motorcycles.find(m => m.id === apt.motorcycle_id);
                                const isExternal = apt.source === 'external';
                                const st = apt.status;
                                const date = effDate(apt);
                                const alertEvent = apt.shop_alert ? (apt.events || []).find(e => ALERT_TEXT[e.type]) : null;
                                const busy = !!actionLoading;
                                const canFlow = isExternal && !['cancelled', 'completed'].includes(st);

                                return (
                                    <div key={apt.id} id={`apt-${apt.id}`} className={`appointment-card ${isExternal ? 'is-external' : ''} ${st === 'pending_external' ? 'is-pending' : ''} ${isPinned ? 'is-pinned' : ''}`}>
                                        {/* Barra izquierda de fecha */}
                                        <div className={`apt-date-badge apt-date--${st}`}>
                                            <div className="badge-day">{dayNum(date)}</div>
                                            <div className="badge-month-year">{monShort(date)}</div>
                                            <div className="badge-time">{fmtHour(date)}</div>
                                        </div>

                                        {/* Contenido */}
                                        <div className="apt-info">
                                            {isPinned && (
                                                <div className="apt-pinned">
                                                    <span>Cita del aviso</span>
                                                    <button type="button" className="apt-pinned-close" onClick={clearCita}>Cerrar</button>
                                                </div>
                                            )}
                                            <div className="apt-client-row">
                                                <User size={15} />
                                                <strong>{name}</strong>
                                                {isExternal && (
                                                    <span className="badge-web">
                                                        <Globe size={11} /> Web
                                                    </span>
                                                )}
                                            </div>
                                            {phone && (
                                                <div className="apt-meta">
                                                    <Phone size={13} />
                                                    <a
                                                        className="apt-phone"
                                                        href={`https://wa.me/${waNumber(phone)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title="Abrir en WhatsApp"
                                                    >{phone}</a>
                                                </div>
                                            )}
                                            {apt.mechanic?.full_name && (
                                                <div className="apt-meta apt-mech">
                                                    <UserCheck size={13} /> Atiende: <strong>{apt.mechanic.full_name}</strong>
                                                    {apt.mechanic_requested && <span className="badge-asked">Lo pidió el cliente</span>}
                                                </div>
                                            )}
                                            {apt.service_type && (
                                                <div className="apt-meta">
                                                    <Wrench size={13} /> {apt.service_type}
                                                </div>
                                            )}
                                            {(apt.moto_label || moto) && (
                                                <div className="apt-meta">
                                                    <Bike size={13} /> {apt.moto_label || `${moto.brand} ${moto.model}`}
                                                </div>
                                            )}
                                            {apt.notes && (
                                                <div className="apt-meta apt-notes">
                                                    <StickyNote size={13} /> <span>{apt.notes}</span>
                                                </div>
                                            )}
                                            {apt.decision_note && ['rejected', 'cancelled'].includes(st) && (
                                                <div className="apt-meta apt-notes"><AlertCircle size={13} /> <span>{apt.decision_note}</span></div>
                                            )}

                                            {st === 'proposal_sent' && apt.proposed_date && (
                                                <div className="apt-proposal">
                                                    {apt.proposal_from_confirmed ? 'Cita actual' : 'Pidió'}: {fmtLong(apt.scheduled_date)} {fmtHour(apt.scheduled_date)}<br />
                                                    Propusiste: <strong>{fmtLong(apt.proposed_date)} {fmtHour(apt.proposed_date)}</strong>
                                                    {apt.proposal_expires_at && <> · vence {fmtStamp(apt.proposal_expires_at)}</>}
                                                </div>
                                            )}

                                            {alertEvent && (
                                                <div className="apt-alert">
                                                    <span>{ALERT_TEXT[alertEvent.type]}</span>
                                                    <button onClick={() => handleSeen(apt)}>Entendido</button>
                                                </div>
                                            )}

                                            <div className={`apt-status-chip apt-status--${st}`}>
                                                {STATUS_LABELS[st] || st}
                                            </div>

                                            {/* Acciones segun el estado */}
                                            {canFlow && (
                                                <div className="apt-actions">
                                                    {st === 'pending_external' && (
                                                        <button className="btn-confirm" disabled={busy} onClick={() => handleAccept(apt)}>
                                                            {actionLoading === apt.id + '_accept' ? '...' : <><ThumbsUp size={14} /> Aceptar</>}
                                                        </button>
                                                    )}
                                                    {['pending_external', 'proposal_sent', 'confirmed', 'rejected', 'expired'].includes(st) && (
                                                        <button className="btn-propose" disabled={busy} onClick={() => setProposeFor(apt)}>
                                                            <Send size={14} /> {st === 'confirmed' ? 'Proponer cambio' : st === 'proposal_sent' ? 'Cambiar propuesta' : 'Proponer otra fecha'}
                                                        </button>
                                                    )}
                                                    {st === 'pending_external' && (
                                                        <button className="btn-plain danger" disabled={busy} onClick={() => setReasonFor({ apt, mode: 'reject' })}>
                                                            <Ban size={14} /> No disponible
                                                        </button>
                                                    )}
                                                    {['proposal_sent', 'confirmed'].includes(st) && (
                                                        <button className="btn-plain danger" disabled={busy} onClick={() => setReasonFor({ apt, mode: 'cancel' })}>
                                                            <X size={14} /> Cancelar cita
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {st === 'confirmed' && (
                                                <div className="apt-actions">
                                                    <button type="button" className="btn-order" onClick={() => goCreateOrder(apt)}>
                                                        <ClipboardList size={14} /> Crear orden
                                                    </button>
                                                </div>
                                            )}

                                            {/* Historial */}
                                            {(apt.events || []).length > 0 && (
                                                <>
                                                    <button className="apt-history-toggle" onClick={() => setOpenHistory(h => ({ ...h, [apt.id]: !h[apt.id] }))}>
                                                        {openHistory[apt.id] ? 'Ocultar historial' : 'Ver historial'}
                                                    </button>
                                                    {openHistory[apt.id] && (
                                                        <ul className="apt-history">
                                                            {apt.events.map(ev => (
                                                                <li key={ev.id}>
                                                                    <b>{EVENT_TEXT[ev.type] || ev.type}</b>
                                                                    {ev.detail ? ` · ${ev.detail}` : ''} <span>({fmtStamp(ev.created_at)})</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Citas internas: editar. Citas web: eliminar */}
                                        {!isExternal && !HIDDEN.has(st) ? (
                                            <button className="apt-edit-btn" onClick={() => openEdit(apt)}>
                                                <Edit2 size={16} />
                                            </button>
                                        ) : (
                                            <button className="apt-trash" onClick={() => handleDeleteApt(apt)} title="Eliminar">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {showNewModal && (
                <AppointmentModal
                    onClose={() => setShowNewModal(false)}
                    onSave={handleSaveNew}
                    onAddClient={addClient}
                    selectedDate={new Date()}
                    clients={clients}
                    motorcycles={motorcycles}
                    users={users}
                />
            )}

            {proposeFor && (
                <ProposeModal
                    apt={proposeFor}
                    name={clientName(proposeFor)}
                    blockedDays={blockedDays}
                    onClose={() => setProposeFor(null)}
                    onSubmit={submitPropose}
                />
            )}

            {reasonFor && (
                <ReasonModal
                    title={reasonFor.mode === 'reject' ? 'No disponible' : 'Cancelar cita'}
                    intro={reasonFor.mode === 'reject'
                        ? `Se le avisa a ${clientName(reasonFor.apt)} por WhatsApp y puede elegir otra fecha desde su enlace.`
                        : `Se le avisa a ${clientName(reasonFor.apt)} por WhatsApp que la cita se cancela.`}
                    placeholder={reasonFor.mode === 'reject' ? 'Ej: Ese día no laboramos' : 'Ej: Tuvimos un imprevisto en el taller'}
                    confirmText={reasonFor.mode === 'reject' ? 'Enviar aviso' : 'Cancelar cita'}
                    danger
                    onClose={() => setReasonFor(null)}
                    onSubmit={submitReason}
                />
            )}

            {showBlocked && (
                <BlockedDaysModal
                    onClose={() => setShowBlocked(false)}
                    onChanged={(rows) => setBlockedDays(Array.isArray(rows) ? rows : [])}
                />
            )}

            {showEditModal && selectedApt && (
                <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editMode === 'edit' ? <Edit2 size={18} /> : <AlertCircle size={18} />}
                                {editMode === 'edit' ? 'Modificar Cita' : 'Cancelar Cita'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowEditModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="mode-selector">
                                <button className={`mode-btn ${editMode === 'edit' ? 'active' : ''}`} onClick={() => setEditMode('edit')}>
                                    <Edit2 size={15} /> Modificar
                                </button>
                                <button className={`mode-btn ${editMode === 'cancel' ? 'active' : ''}`} onClick={() => setEditMode('cancel')}>
                                    <Trash2 size={15} /> Cancelar
                                </button>
                            </div>
                            {editMode === 'edit' ? (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Nueva Fecha</label>
                                        <input type="date" className="form-input" value={editData.scheduled_date}
                                            onChange={e => setEditData({ ...editData, scheduled_date: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Nueva Hora</label>
                                        <input type="time" className="form-input" value={editData.scheduled_time}
                                            onChange={e => setEditData({ ...editData, scheduled_time: e.target.value })} />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-secondary" style={{ marginBottom: '1rem' }}>¿Cancelar esta cita? Se le avisa al cliente por WhatsApp.</p>
                                    <div className="form-group">
                                        <label className="form-label">Motivo *</label>
                                        <textarea className="form-textarea" rows={3} value={cancelReason}
                                            onChange={e => setCancelReason(e.target.value)}
                                            placeholder="Ej: El cliente no puede asistir..." />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowEditModal(false)}>Cerrar</button>
                            <button
                                className="btn btn-ghost-danger"
                                disabled={!!actionLoading}
                                onClick={handleDelete}
                                style={{ marginRight: 'auto' }}
                            >
                                <Trash2 size={16} /> Eliminar
                            </button>
                            <button
                                className={`btn ${editMode === 'edit' ? 'btn-primary' : 'btn-danger'}`}
                                disabled={!!actionLoading}
                                onClick={editMode === 'edit' ? handleUpdate : handleCancel}
                            >
                                {editMode === 'edit' ? <><Check size={16} /> Guardar</> : <><Trash2 size={16} /> Cancelar cita</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
