import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Calendar, Plus, User, Phone, Wrench, X, Edit2, Trash2,
    AlertCircle, Check, Globe, RefreshCw, ThumbsUp, Ban,
    Copy, MessageCircle, Link2, StickyNote, Bike, Send, CalendarOff
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
    customer_accepted: 'El cliente aceptó tu propuesta y la cita quedó confirmada ✓',
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
    const { user, activeWorkspace } = useAuth();
    const bookingLink = BOOKING_LINKS[activeWorkspace?.id] || null;

    const [actionError, setActionError] = useState('');
    const [notice, setNotice] = useState(null);           // resultado del ultimo envio por WhatsApp
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');          // 'all' | 'external' | 'internal' | 'closed'
    const [showList, setShowList] = useState(false);
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

    const active = appointments.filter(a => !HIDDEN.has(a.status)).sort((a, b) => new Date(effDate(a)) - new Date(effDate(b)));
    const closed = appointments.filter(a => HIDDEN.has(a.status)).sort((a, b) => new Date(b.scheduled_date) - new Date(a.scheduled_date));
    const toReview = appointments.filter(a => a.status === 'pending_external');
    const alerts = appointments.filter(a => a.shop_alert);
    const attention = new Set([...toReview, ...alerts].map(a => a.id)).size;

    const filtered = filter === 'external'
        ? active.filter(a => a.source === 'external')
        : filter === 'internal'
            ? active.filter(a => a.source !== 'external')
            : filter === 'closed'
                ? closed
                : active;

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
                    <div className="list-header">
                        <button className="btn-back" onClick={() => setShowList(false)}>← Volver</button>
                        <div className="list-title-row">
                            <div className="list-title">
                                <h2>Citas</h2>
                                <p>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</p>
                            </div>
                            <button className="btn-icon" onClick={() => loadAppointments()} title="Actualizar">
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Filtros */}
                    <div className="filter-tabs">
                        {[
                            { key: 'all', label: 'Todas' },
                            { key: 'external', label: 'Del sitio web', badge: attention },
                            { key: 'internal', label: 'Internas' },
                            { key: 'closed', label: 'Cerradas' },
                        ].map(f => (
                            <button
                                key={f.key}
                                className={`filter-tab ${filter === f.key ? 'active' : ''}`}
                                onClick={() => setFilter(f.key)}
                            >
                                {f.label}
                                {f.badge > 0 && <span className="tab-badge">{f.badge}</span>}
                            </button>
                        ))}
                    </div>

                    {notices}

                    <button className="btn-new-appointment" onClick={() => setShowNewModal(true)}>
                        <Plus size={20} /> Agendar Nueva Cita
                    </button>

                    {bookingLink && <BookingLinkCard link={bookingLink} />}

                    {loading ? (
                        <div className="empty-state"><RefreshCw size={32} style={{ opacity: 0.3 }} /><p>Cargando...</p></div>
                    ) : filtered.length === 0 ? (
                        <div className="empty-state">
                            <Calendar size={56} style={{ opacity: 0.3 }} />
                            <h3>Sin citas</h3>
                            <p className="text-secondary">No hay citas en este filtro</p>
                        </div>
                    ) : (
                        <div className="appointments-list">
                            {filtered.map(apt => {
                                const name = clientName(apt);
                                const phone = clientPhone(apt);
                                const moto = motorcycles.find(m => m.id === apt.motorcycle_id);
                                const isExternal = apt.source === 'external';
                                const st = apt.status;
                                const date = effDate(apt);
                                const color = STATUS_COLORS[st] || '#6e6e73';
                                const alertEvent = apt.shop_alert ? (apt.events || []).find(e => ALERT_TEXT[e.type]) : null;
                                const busy = !!actionLoading;
                                const canFlow = isExternal && !['cancelled', 'completed'].includes(st);

                                return (
                                    <div key={apt.id} className={`appointment-card ${isExternal ? 'is-external' : ''} ${st === 'pending_external' ? 'is-pending' : ''}`}>
                                        {/* Barra izquierda de fecha */}
                                        <div className="apt-date-badge" style={{ background: ['pending_external', 'proposal_sent'].includes(st) ? color : undefined }}>
                                            <div className="badge-day">{dayNum(date)}</div>
                                            <div className="badge-month-year">{monShort(date)}</div>
                                            <div className="badge-time">{fmtHour(date)}</div>
                                        </div>

                                        {/* Contenido */}
                                        <div className="apt-info">
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

                                            <div className="apt-status-chip" style={{ background: color + '22', color }}>
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

            <style>{`                .appointments-page { min-height: calc(100vh - 120px); padding-bottom: 80px; }

                .main-screen {
                    display: flex; flex-direction: column; align-items: center;
                    justify-content: center; min-height: 70vh;
                    gap: var(--spacing-xl); padding: var(--spacing-xl);
                }
                .welcome-header { text-align: center; animation: fadeInUp 0.6s ease; }
                @keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
                .welcome-icon { color: var(--primary); margin-bottom: var(--spacing-md); filter: drop-shadow(0 4px 12px rgba(59,130,246,.3)); }
                .welcome-title {
                    font-size: 2.25rem; font-weight: 800; margin-bottom: var(--spacing-sm);
                    background: linear-gradient(135deg,#d71920 0%,#8b5cf6 100%);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
                }
                .welcome-subtitle { color: var(--text-secondary); font-size: 1.125rem; font-weight: 500; }

                .external-alert {
                    margin-top: var(--spacing-md); display: inline-flex; align-items: center; gap: 6px;
                    background: #fef3c7; color: #92400e; border: 1px solid #fbbf24;
                    border-radius: var(--radius-full); padding: 6px 14px; font-size: 0.875rem;
                    cursor: pointer; font-weight: 600; transition: all 0.2s;
                }
                .external-alert:hover { background: #fde68a; }

                .main-buttons { display: flex; flex-direction: column; gap: var(--spacing-md); width: 100%; max-width: 420px; }
                .btn-main {
                    position: relative; display: flex; align-items: center; justify-content: center;
                    gap: var(--spacing-sm); padding: var(--spacing-lg) var(--spacing-xl);
                    background: linear-gradient(135deg, var(--primary) 0%, #d71920 100%);
                    color: white; border: none; border-radius: var(--radius-lg);
                    font-size: 1.0625rem; font-weight: 600; cursor: pointer;
                    transition: all 0.2s; box-shadow: 0 4px 16px rgba(59,130,246,.25);
                }
                .btn-main:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(59,130,246,.35); }
                .btn-main.btn-new { background: linear-gradient(135deg,#22c55e,#059669); box-shadow: 0 4px 16px rgba(16,185,129,.25); }
                .btn-main.btn-new:hover { box-shadow: 0 6px 24px rgba(16,185,129,.35); }
                .btn-main.btn-warning { background: linear-gradient(135deg,#f59e0b,#d97706); box-shadow: 0 4px 16px rgba(245,158,11,.25); }
                .btn-badge { background: white; color: #92400e; border-radius: 999px; padding: 1px 8px; font-size: 0.8rem; font-weight: 700; margin-left: 6px; }

                .list-view { animation: slideIn 0.3s ease; }
                @keyframes slideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
                .list-header { margin-bottom: var(--spacing-lg); padding-bottom: var(--spacing-md); border-bottom: 2px solid var(--border-color); }
                .list-title-row { display: flex; align-items: flex-end; justify-content: space-between; }
                .btn-back { background: transparent; border: none; color: var(--primary); font-size: 0.9375rem; font-weight: 600; cursor: pointer; padding: var(--spacing-sm) 0; margin-bottom: var(--spacing-sm); display: inline-flex; align-items: center; gap: 4px; transition: 0.15s; }
                .btn-back:hover { transform: translateX(-4px); }
                .list-title h2 { font-size: 1.75rem; font-weight: 700; margin-bottom: 4px; color: var(--text-primary); }
                .list-title p { color: var(--text-secondary); font-size: 0.9375rem; margin: 0; }
                .btn-icon { background: transparent; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 8px; cursor: pointer; display: flex; align-items: center; color: var(--text-secondary); transition: 0.15s; }
                .btn-icon:hover { background: var(--bg-hover); color: var(--primary); }

                .filter-tabs { display: flex; gap: var(--spacing-sm); margin-bottom: var(--spacing-lg); flex-wrap: wrap; }
                .filter-tab { padding: 6px 16px; border: 1.5px solid var(--border-color); background: white; border-radius: var(--radius-full); font-size: 0.875rem; font-weight: 600; cursor: pointer; color: var(--text-secondary); transition: 0.15s; display: flex; align-items: center; gap: 6px; }
                .filter-tab.active { border-color: var(--primary); background: var(--primary); color: white; }
                .tab-badge { background: #ef4444; color: white; border-radius: 999px; padding: 1px 7px; font-size: 0.75rem; }
                .filter-tab.active .tab-badge { background: white; color: var(--primary); }

                .btn-new-appointment { width: 100%; display: flex; align-items: center; justify-content: center; gap: var(--spacing-sm); padding: var(--spacing-md) var(--spacing-lg); background: linear-gradient(135deg,#22c55e,#059669); color: white; border: none; border-radius: var(--radius-lg); font-size: 1rem; font-weight: 600; cursor: pointer; margin-bottom: var(--spacing-xl); transition: 0.15s; box-shadow: 0 4px 12px rgba(16,185,129,.2); }
                .btn-new-appointment:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(16,185,129,.3); }

                .empty-state { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-lg); padding: var(--spacing-2xl); text-align: center; background: var(--bg-hover); border-radius: var(--radius-xl); border: 2px dashed var(--border-color); }
                .empty-state h3 { font-size: 1.25rem; font-weight: 600; margin: 0; }

                .appointments-list { display: flex; flex-direction: column; gap: var(--spacing-md); }

                .appointment-card { display: flex; align-items: stretch; background: white; border: 1.5px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; transition: 0.2s; }
                .appointment-card.is-external { border-color: #fbbf24; }
                .appointment-card.is-pending { border-color: #f59e0b; box-shadow: 0 0 0 2px #fef3c7; }
                .appointment-card:hover { box-shadow: var(--shadow-md); }

                .apt-date-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 72px; padding: var(--spacing-md) var(--spacing-sm); background: linear-gradient(135deg,#d71920,#a90f16); color: white; flex-shrink: 0; text-align: center; }
                .badge-day { font-size: 1.875rem; font-weight: 800; line-height: 1; }
                .badge-month-year { font-size: 0.7rem; text-transform: uppercase; font-weight: 700; opacity: 0.9; margin-top: 2px; }
                .badge-time { font-size: 0.75rem; font-weight: 600; margin-top: 4px; opacity: 0.85; }

                .apt-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: var(--spacing-md); }
                .apt-client-row { display: flex; align-items: center; gap: 6px; font-size: 1rem; font-weight: 700; color: var(--text-primary); flex-wrap: wrap; }
                .badge-web { display: inline-flex; align-items: center; gap: 3px; background: #fef3c7; color: #92400e; border: 1px solid #fbbf24; border-radius: 999px; padding: 1px 8px; font-size: 0.7rem; font-weight: 700; }
                .apt-meta { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; color: var(--text-secondary); }
                .apt-status-chip { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 0.72rem; font-weight: 700; margin-top: 4px; width: fit-content; }

                .apt-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
                .btn-confirm { display: flex; align-items: center; gap: 5px; padding: 6px 14px; background: #22c55e; color: white; border: none; border-radius: var(--radius-md); font-size: 0.8125rem; font-weight: 700; cursor: pointer; transition: 0.15s; }
                .btn-confirm:hover { background: #16a34a; }
                .btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
                .btn-reject { display: flex; align-items: center; gap: 5px; padding: 6px 14px; background: #ef4444; color: white; border: none; border-radius: var(--radius-md); font-size: 0.8125rem; font-weight: 700; cursor: pointer; transition: 0.15s; }
                .btn-reject:hover { background: #dc2626; }
                .btn-reject:disabled { opacity: 0.6; cursor: not-allowed; }

                .apt-edit-btn { display: flex; align-items: center; justify-content: center; padding: 0 var(--spacing-md); color: var(--text-muted); background: transparent; border: none; cursor: pointer; transition: 0.15s; flex-shrink: 0; }
                .apt-edit-btn:hover { color: var(--primary); background: var(--bg-hover); }

                .mode-selector { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: var(--spacing-lg); padding: 4px; background: var(--bg-hover); border-radius: var(--radius-md); }
                .mode-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: var(--spacing-sm) var(--spacing-md); background: transparent; border: none; border-radius: var(--radius-sm); font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: 0.15s; }
                .mode-btn.active { background: white; color: var(--primary); box-shadow: 0 2px 8px rgba(0,0,0,.1); }

                .apt-phone { color: inherit; text-decoration: none; border-bottom: 1px dotted currentColor; }
                .apt-phone:hover { color: #16a34a; }
                .apt-notes { align-items: flex-start; }
                .apt-notes svg { margin-top: 2px; flex-shrink: 0; }
                .apt-notes span { white-space: pre-line; overflow-wrap: anywhere; }
                .apt-error { width: 100%; max-width: 420px; background: #fef2f2; color: #b91c1c; border: 1px solid #fca5a5; border-radius: var(--radius-md); padding: 10px 14px; font-size: 0.875rem; font-weight: 600; margin-bottom: var(--spacing-md); }

                .booking-card { width: 100%; max-width: 420px; background: white; border: 1.5px dashed var(--border-color); border-radius: var(--radius-lg); padding: var(--spacing-md); display: flex; flex-direction: column; gap: 10px; margin-bottom: var(--spacing-xl); }
                .booking-head { display: flex; gap: 10px; align-items: flex-start; color: var(--text-primary); }
                .booking-head svg { color: var(--primary); margin-top: 2px; flex-shrink: 0; }
                .booking-head strong { display: block; font-size: 0.95rem; }
                .booking-head span { display: block; font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; line-height: 1.4; }
                .booking-url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; background: var(--bg-hover); border-radius: var(--radius-md); padding: 8px 10px; overflow-wrap: anywhere; user-select: all; }
                .booking-phone { width: 100%; border: 1.5px solid var(--border-color); border-radius: var(--radius-md); padding: 8px 10px; font-size: 0.875rem; background: white; color: var(--text-primary); }
                .booking-actions { display: flex; gap: 8px; flex-wrap: wrap; }
                .booking-btn { flex: 1 1 140px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border-radius: var(--radius-md); border: 1.5px solid var(--border-color); background: white; color: var(--text-primary); font-size: 0.875rem; font-weight: 700; cursor: pointer; transition: 0.15s; }
                .booking-btn:hover { background: var(--bg-hover); }
                .booking-btn.wa { background: #25d366; border-color: #25d366; color: white; }
                .booking-btn.wa:hover { background: #1ebe5b; }
                .list-view .booking-card { max-width: none; margin-bottom: var(--spacing-lg); }

                @media (max-width: 768px) {
                    .main-buttons { max-width: 100%; }
                    .booking-card, .apt-error { max-width: 100%; }
                    .btn-main { font-size: 1rem; padding: var(--spacing-md) var(--spacing-lg); }
                }

                .btn-ghost-danger {
                    background: transparent;
                    color: var(--danger, #ef4444);
                    border: none;
                    font-size: 0.8125rem;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-radius: var(--radius-md);
                }
                .btn-ghost-danger:hover {
                    background: rgba(239, 68, 68, 0.1);
                }
            
                .btn-main.btn-dark { background: linear-gradient(135deg,#3f3f46,#18181b); box-shadow: 0 4px 16px rgba(24,24,27,.25); }
            `}</style>
        </div>
    );
}
