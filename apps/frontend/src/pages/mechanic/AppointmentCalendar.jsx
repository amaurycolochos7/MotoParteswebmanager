import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    Calendar, Plus, User, Phone, Clock, Wrench, X, Edit2, Trash2,
    AlertCircle, Check, Globe, Filter, RefreshCw, ThumbsUp, ThumbsDown
} from 'lucide-react';
import AppointmentModal from '../../components/appointments/AppointmentModal';
import { appointmentsService } from '../../lib/api';
import { useData } from '../../context/DataContext';

const STATUS_LABELS = {
    scheduled: 'Agendada',
    pending_external: 'Pendiente web',
    confirmed: 'Confirmada',
    rejected: 'Rechazada',
    cancelled: 'Cancelada',
    completed: 'Completada',
};

const STATUS_COLORS = {
    scheduled: '#2563eb',
    pending_external: '#f59e0b',
    confirmed: '#22c55e',
    rejected: '#ef4444',
    cancelled: '#94a3b8',
    completed: '#10b981',
};

function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function AppointmentCalendar() {
    const { clients = [], motorcycles = [], users = [], addClient } = useData();
    const { user, canManageAppointments } = useAuth();

    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all' | 'external' | 'internal'
    const [showList, setShowList] = useState(false);
    const [showNewModal, setShowNewModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedApt, setSelectedApt] = useState(null);
    const [editMode, setEditMode] = useState('edit');
    const [editData, setEditData] = useState({});
    const [cancelReason, setCancelReason] = useState('');
    const [actionLoading, setActionLoading] = useState(null);

    const loadAppointments = useCallback(async () => {
        setLoading(true);
        try {
            const data = await appointmentsService.getAll();
            setAppointments(Array.isArray(data) ? data : []);
        } catch {
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    const HIDDEN = new Set(['cancelled', 'completed', 'rejected']);

    const allActive = appointments
        .filter(a => !HIDDEN.has(a.status))
        .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

    const externalPending = appointments.filter(a => a.status === 'pending_external');

    const filtered = filter === 'external'
        ? appointments.filter(a => a.source === 'external' && !HIDDEN.has(a.status))
        : filter === 'internal'
            ? appointments.filter(a => a.source !== 'external' && !HIDDEN.has(a.status))
            : allActive;

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

    const handleConfirm = async (apt) => {
        setActionLoading(apt.id + '_confirm');
        try {
            await appointmentsService.confirm(apt.id);
            await loadAppointments();
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (apt) => {
        setActionLoading(apt.id + '_reject');
        try {
            await appointmentsService.reject(apt.id);
            await loadAppointments();
        } finally {
            setActionLoading(null);
        }
    };

    const handleSaveNew = async (data) => {
        try {
            await appointmentsService.create({ ...data, created_by: user.id, status: 'scheduled' });
            setShowNewModal(false);
            await loadAppointments();
        } catch { /* modal muestra error */ }
    };

    const openEdit = (apt) => {
        setSelectedApt(apt);
        const d = new Date(apt.scheduled_date);
        setEditData({
            scheduled_date: d.toISOString().slice(0, 10),
            scheduled_time: d.toTimeString().slice(0, 5),
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
            await loadAppointments();
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancel = async () => {
        if (!cancelReason.trim()) return;
        setActionLoading('cancel');
        try {
            await appointmentsService.update(selectedApt.id, {
                status: 'cancelled',
                notes: cancelReason.trim(),
            });
            setShowEditModal(false);
            await loadAppointments();
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
            await loadAppointments();
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="appointments-page">
            {!showList ? (
                <div className="main-screen">
                    <div className="welcome-header">
                        <Calendar size={64} className="welcome-icon" />
                        <h1 className="welcome-title">Citas</h1>
                        <p className="welcome-subtitle">
                            {allActive.length} cita{allActive.length !== 1 ? 's' : ''} activa{allActive.length !== 1 ? 's' : ''}
                        </p>
                        {externalPending.length > 0 && (
                            <div className="external-alert" onClick={() => { setFilter('external'); setShowList(true); }}>
                                <Globe size={16} />
                                <strong>{externalPending.length}</strong> cita{externalPending.length !== 1 ? 's' : ''} desde la web — toca para revisar
                            </div>
                        )}
                    </div>

                    <div className="main-buttons">
                        <button className="btn-main" onClick={() => { setFilter('all'); setShowList(true); }}>
                            <Calendar size={20} />
                            Ver Citas Activas
                        </button>
                        {externalPending.length > 0 && (
                            <button className="btn-main btn-warning" onClick={() => { setFilter('external'); setShowList(true); }}>
                                <Globe size={20} />
                                Citas del Sitio Web
                                <span className="btn-badge">{externalPending.length}</span>
                            </button>
                        )}
                        <button className="btn-main btn-new" onClick={() => setShowNewModal(true)}>
                            <Plus size={20} />
                            Agendar Nueva Cita
                        </button>
                    </div>
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
                            <button className="btn-icon" onClick={loadAppointments} title="Actualizar">
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Filtros */}
                    <div className="filter-tabs">
                        {[
                            { key: 'all', label: 'Todas' },
                            { key: 'external', label: 'Del sitio web', badge: externalPending.length },
                            { key: 'internal', label: 'Internas' },
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

                    <button className="btn-new-appointment" onClick={() => setShowNewModal(true)}>
                        <Plus size={20} /> Agendar Nueva Cita
                    </button>

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
                                const isPendingExternal = apt.status === 'pending_external';

                                return (
                                    <div key={apt.id} className={`appointment-card ${isExternal ? 'is-external' : ''} ${isPendingExternal ? 'is-pending' : ''}`}>
                                        {/* Barra izquierda de fecha */}
                                        <div className="apt-date-badge" style={{ background: isPendingExternal ? '#f59e0b' : undefined }}>
                                            <div className="badge-day">{new Date(apt.scheduled_date).getDate()}</div>
                                            <div className="badge-month-year">
                                                {new Date(apt.scheduled_date).toLocaleDateString('es-MX', { month: 'short' })}
                                            </div>
                                            <div className="badge-time">{fmtTime(apt.scheduled_date)}</div>
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
                                                    <Phone size={13} /> {phone}
                                                </div>
                                            )}
                                            {apt.service_type && (
                                                <div className="apt-meta">
                                                    <Wrench size={13} /> {apt.service_type}
                                                </div>
                                            )}
                                            {moto && (
                                                <div className="apt-meta">🏍️ {moto.brand} {moto.model}</div>
                                            )}
                                            <div className="apt-status-chip" style={{ background: (STATUS_COLORS[apt.status] || '#64748b') + '22', color: STATUS_COLORS[apt.status] || '#64748b' }}>
                                                {STATUS_LABELS[apt.status] || apt.status}
                                            </div>

                                            {/* Botones Confirmar/Rechazar para citas externas pendientes */}
                                            {isPendingExternal && (
                                                <div className="apt-actions">
                                                    <button
                                                        className="btn-confirm"
                                                        disabled={!!actionLoading}
                                                        onClick={() => handleConfirm(apt)}
                                                    >
                                                        {actionLoading === apt.id + '_confirm'
                                                            ? '...'
                                                            : <><ThumbsUp size={14} /> Confirmar</>
                                                        }
                                                    </button>
                                                    <button
                                                        className="btn-reject"
                                                        disabled={!!actionLoading}
                                                        onClick={() => handleReject(apt)}
                                                    >
                                                        {actionLoading === apt.id + '_reject'
                                                            ? '...'
                                                            : <><ThumbsDown size={14} /> Rechazar</>
                                                        }
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Botón editar (solo si no es externa pendiente) */}
                                        {!isPendingExternal && (
                                            <button className="apt-edit-btn" onClick={() => openEdit(apt)}>
                                                <Edit2 size={16} />
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
                                    <p className="text-secondary" style={{ marginBottom: '1rem' }}>¿Cancelar esta cita?</p>
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

            <style>{`
                .appointments-page { min-height: calc(100vh - 120px); padding-bottom: 80px; }

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
                    background: linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);
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
                    background: linear-gradient(135deg, var(--primary) 0%, #2563eb 100%);
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

                .apt-date-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 72px; padding: var(--spacing-md) var(--spacing-sm); background: linear-gradient(135deg,#2563eb,#1d4ed8); color: white; flex-shrink: 0; text-align: center; }
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

                @media (max-width: 768px) {
                    .main-buttons { max-width: 100%; }
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
            `}</style>
        </div>
    );
}
