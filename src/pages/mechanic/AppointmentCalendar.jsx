import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Calendar, Plus, User, Phone, Clock, Wrench, X, Edit2, Trash2, AlertCircle, Check } from 'lucide-react';
import AppointmentModal from '../../components/appointments/AppointmentModal';

export default function AppointmentCalendar() {
    const { appointments = [], clients = [], motorcycles = [], addAppointment, addClient, updateAppointment } = useData();
    const { user, users = [], canManageAppointments } = useAuth();


    const [showList, setShowList] = useState(false);
    const [showNewAppointmentModal, setShowNewAppointmentModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [editMode, setEditMode] = useState('edit'); // 'edit' or 'cancel'
    const [editData, setEditData] = useState({});
    const [cancelReason, setCancelReason] = useState('');

    // Filter pending appointments (con protección para undefined)
    const pendingAppointments = (appointments || [])
        .filter(apt => apt.status !== 'cancelled' && apt.status !== 'completed')
        .sort((a, b) => {
            const dateA = new Date(a.scheduled_date + 'T' + a.scheduled_time);
            const dateB = new Date(b.scheduled_date + 'T' + b.scheduled_time);
            return dateA - dateB;
        });

    const handleSaveNewAppointment = (appointmentData) => {
        const created = addAppointment({
            ...appointmentData,
            created_by: user.id,
            status: 'scheduled'
        });

        if (created) {
            setShowNewAppointmentModal(false);
        }
    };

    const openEditModal = (appointment) => {
        setSelectedAppointment(appointment);
        setEditData({
            scheduled_date: appointment.scheduled_date,
            scheduled_time: appointment.scheduled_time
        });
        setEditMode('edit');
        setCancelReason('');
        setShowEditModal(true);
    };

    const handleUpdateAppointment = async () => {
        if (!editData.scheduled_date || !editData.scheduled_time) {
            alert('Fecha y hora son obligatorias');
            return;
        }

        // Update appointment
        updateAppointment(selectedAppointment.id, {
            scheduled_date: editData.scheduled_date,
            scheduled_time: editData.scheduled_time,
            updated_at: new Date().toISOString(),
            updated_by: user.id
        });

        // Send WhatsApp notification
        const client = clients.find(c => c.id === selectedAppointment.client_id);
        const motorcycle = motorcycles.find(m => m.id === selectedAppointment.motorcycle_id);

        if (client && client.phone) {
            const { sendAutomatedMessage } = await import('../../utils/whatsappHelper');

            const newDate = new Date(editData.scheduled_date + 'T' + editData.scheduled_time);
            const oldDate = new Date(selectedAppointment.scheduled_date + 'T' + selectedAppointment.scheduled_time);

            const dateFormatted = newDate.toLocaleDateString('es-MX', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const timeFormatted = newDate.toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const message = `Hola ${client.full_name} 👋

📅 *Cambio de Cita - Motopartes*

Tu cita ha sido reprogramada:

🏍️ *Motocicleta:* ${motorcycle.brand} ${motorcycle.model}

⏰ *Nueva fecha y hora:*
📆 ${dateFormatted}
🕒 ${timeFormatted}

📍 *Motopartes - Tu taller de confianza*

Por favor confirma tu asistencia. Si tienes alguna duda, contáctanos.

¡Gracias por tu comprensión! 🙏`;

            try {
                await sendAutomatedMessage(client.phone, message);
                console.log('✅ Notificación de cambio enviada');
            } catch (error) {
                console.error('Error enviando notificación:', error);
            }
        }

        setShowEditModal(false);
        setSelectedAppointment(null);
    };

    const handleCancelAppointment = async () => {
        if (!cancelReason.trim()) {
            alert('Debes ingresar un motivo de cancelación');
            return;
        }

        // Update appointment as cancelled
        updateAppointment(selectedAppointment.id, {
            status: 'cancelled',
            cancellation_reason: cancelReason.trim(),
            cancelled_at: new Date().toISOString(),
            cancelled_by: user.id
        });

        // Send WhatsApp notification
        const client = clients.find(c => c.id === selectedAppointment.client_id);
        const motorcycle = motorcycles.find(m => m.id === selectedAppointment.motorcycle_id);

        if (client && client.phone) {
            const { sendAutomatedMessage } = await import('../../utils/whatsappHelper');

            const message = `Hola ${client.full_name} 👋

❌ *Cancelación de Cita - Motopartes*

Lamentamos informarte que tu cita ha sido cancelada:

🏍️ *Motocicleta:* ${motorcycle.brand} ${motorcycle.model}

📝 *Motivo:* ${cancelReason.trim()}

📍 *Motopartes - Tu taller de confianza*

Puedes contactarnos para reprogramar tu cita cuando desees.

Disculpa las molestias. 🙏`;

            try {
                await sendAutomatedMessage(client.phone, message);
                console.log('✅ Notificación de cancelación enviada');
            } catch (error) {
                console.error('Error enviando notificación:', error);
            }
        }

        setShowEditModal(false);
        setSelectedAppointment(null);
        setCancelReason('');
    };

    return (
        <div className="appointments-page">
            {/* Main Screen - Just One Button */}
            {!showList ? (
                <div className="main-screen">
                    <div className="welcome-header">
                        <Calendar size={64} className="welcome-icon" />
                        <h1 className="welcome-title">Citas</h1>
                        <p className="welcome-subtitle">
                            {pendingAppointments.length} cita{pendingAppointments.length !== 1 ? 's' : ''} pendiente{pendingAppointments.length !== 1 ? 's' : ''}
                        </p>
                    </div>

                    <div className="main-buttons">
                        <button
                            className="btn-main"
                            onClick={() => setShowList(true)}
                        >
                            <Calendar size={20} />
                            Ver Citas Programadas
                        </button>

                        <button
                            className="btn-main btn-new"
                            onClick={() => setShowNewAppointmentModal(true)}
                        >
                            <Plus size={20} />
                            Agendar Nueva Cita
                        </button>
                    </div>
                </div>
            ) : (
                /* Appointments List View */
                <div className="list-view">
                    {/* Header with back button */}
                    <div className="list-header">
                        <button
                            className="btn-back"
                            onClick={() => setShowList(false)}
                        >
                            ← Volver
                        </button>
                        <div className="list-title">
                            <h2>Citas Programadas</h2>
                            <p>{pendingAppointments.length} cita{pendingAppointments.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>

                    {/* New Appointment Button */}
                    <button
                        className="btn-new-appointment"
                        onClick={() => setShowNewAppointmentModal(true)}
                    >
                        <Plus size={20} />
                        Agendar Nueva Cita
                    </button>

                    {/* Appointments List */}
                    {pendingAppointments.length === 0 ? (
                        <div className="empty-state">
                            <Calendar size={64} style={{ opacity: 0.3 }} />
                            <h3>No hay citas programadas</h3>
                            <p className="text-secondary">Las citas aparecerán aquí</p>
                        </div>
                    ) : (
                        <div className="appointments-list">
                            {pendingAppointments.map(apt => {
                                const client = clients.find(c => c.id === apt.client_id);
                                const motorcycle = motorcycles.find(m => m.id === apt.motorcycle_id);
                                const mechanic = users.find(u => u.id === apt.assigned_mechanic_id);
                                const aptDate = new Date(apt.scheduled_date + 'T' + apt.scheduled_time);

                                return (
                                    <div
                                        key={apt.id}
                                        className="appointment-card"
                                        onClick={() => openEditModal(apt)}
                                    >
                                        <div className="apt-date-badge">
                                            <div className="badge-day">{aptDate.getDate()}</div>
                                            <div className="badge-month-year">
                                                {aptDate.toLocaleDateString('es-MX', { month: 'short' })}
                                                <Clock size={12} style={{ marginLeft: 4 }} />
                                                {apt.scheduled_time}
                                            </div>
                                        </div>

                                        <div className="apt-info">
                                            <div className="apt-client">
                                                <User size={16} />
                                                <strong>{client?.full_name || 'Desconocido'}</strong>
                                            </div>
                                            {client?.phone && (
                                                <div className="apt-phone">
                                                    <Phone size={14} />
                                                    {client.phone}
                                                </div>
                                            )}
                                            {motorcycle && (
                                                <div className="apt-moto">
                                                    🏍️ {motorcycle.brand} {motorcycle.model} ({motorcycle.year})
                                                </div>
                                            )}
                                            {mechanic && (
                                                <div className="apt-mechanic">
                                                    <Wrench size={14} />
                                                    {mechanic.full_name}
                                                </div>
                                            )}
                                        </div>

                                        <div className="apt-arrow">
                                            →
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* New Appointment Modal */}
            {showNewAppointmentModal && (
                <AppointmentModal
                    onClose={() => setShowNewAppointmentModal(false)}
                    onSave={handleSaveNewAppointment}
                    onAddClient={addClient}
                    selectedDate={new Date()}
                    clients={clients}
                    motorcycles={motorcycles}
                    users={users}
                />
            )}

            {/* Edit/Cancel Modal */}
            {showEditModal && selectedAppointment && (
                <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editMode === 'edit' ? <Edit2 size={20} /> : <AlertCircle size={20} />}
                                {editMode === 'edit' ? 'Modificar Cita' : 'Cancelar Cita'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowEditModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Mode Selector */}
                            <div className="mode-selector">
                                <button
                                    className={`mode-btn ${editMode === 'edit' ? 'active' : ''}`}
                                    onClick={() => setEditMode('edit')}
                                >
                                    <Edit2 size={16} />
                                    Modificar
                                </button>
                                <button
                                    className={`mode-btn ${editMode === 'cancel' ? 'active' : ''}`}
                                    onClick={() => setEditMode('cancel')}
                                >
                                    <Trash2 size={16} />
                                    Cancelar
                                </button>
                            </div>

                            {editMode === 'edit' ? (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Nueva Fecha</label>
                                        <input
                                            type="date"
                                            className="form-input"
                                            value={editData.scheduled_date}
                                            onChange={e => setEditData({ ...editData, scheduled_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Nueva Hora</label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            value={editData.scheduled_time}
                                            onChange={e => setEditData({ ...editData, scheduled_time: e.target.value })}
                                        />
                                    </div>
                                    <p className="text-secondary" style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
                                        ℹ️ El cliente recibirá un mensaje de WhatsApp con los nuevos cambios
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-secondary mb-md">
                                        ¿Estás seguro de cancelar esta cita?
                                    </p>
                                    <div className="form-group">
                                        <label className="form-label">Motivo de Cancelación *</label>
                                        <textarea
                                            className="form-textarea"
                                            placeholder="Ej: El cliente no puede asistir..."
                                            value={cancelReason}
                                            onChange={e => setCancelReason(e.target.value)}
                                            rows={4}
                                            autoFocus
                                        />
                                    </div>
                                    <p className="text-secondary" style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
                                        ℹ️ El cliente recibirá un mensaje de WhatsApp con el motivo de la cancelación
                                    </p>
                                </>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button
                                className="btn btn-outline"
                                onClick={() => setShowEditModal(false)}
                            >
                                Cerrar
                            </button>
                            <button
                                className={`btn ${editMode === 'edit' ? 'btn-primary' : 'btn-danger'}`}
                                onClick={editMode === 'edit' ? handleUpdateAppointment : handleCancelAppointment}
                            >
                                {editMode === 'edit' ? (
                                    <><Check size={18} /> Guardar Cambios</>
                                ) : (
                                    <><Trash2 size={18} /> Confirmar Cancelación</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .appointments-page {
                    min-height: calc(100vh - 120px);
                    padding-bottom: 80px;
                }

                /* Main Screen - Redesigned */
                .main-screen {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 70vh;
                    gap: var(--spacing-xl);
                    padding: var(--spacing-xl);
                }

                .welcome-header {
                    text-align: center;
                    animation: fadeInUp 0.6s ease;
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .welcome-icon {
                    color: var(--primary);
                    margin-bottom: var(--spacing-md);
                    filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.3));
                }

                .welcome-title {
                    font-size: 2.25rem;
                    font-weight: 800;
                    margin-bottom: var(--spacing-sm);
                    background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .welcome-subtitle {
                    color: var(--text-secondary);
                    font-size: 1.125rem;
                    font-weight: 500;
                }

                .main-buttons {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                    width: 100%;
                    max-width: 420px;
                    animation: fadeIn 0.8s ease 0.2s both;
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                .btn-main {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-lg) var(--spacing-xl);
                    background: linear-gradient(135deg, var(--primary) 0%, #2563eb 100%);
                    color: white;
                    border: none;
                    border-radius: var(--radius-lg);
                    font-size: 1.0625rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all var(--transition-normal);
                    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.25);
                    overflow: hidden;
                }

                .btn-main::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    transition: left 0.5s;
                }

                .btn-main:hover::before {
                    left: 100%;
                }

                .btn-main:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 24px rgba(59, 130, 246, 0.35);
                }

                .btn-main:active {
                    transform: translateY(0);
                }

                .btn-main.btn-new {
                    background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
                    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.25);
                }

                .btn-main.btn-new:hover {
                    box-shadow: 0 6px 24px rgba(16, 185, 129, 0.35);
                }

                /* List View - Redesigned */
                .list-view {
                    animation: slideIn 0.3s ease;
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateX(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                .list-header {
                    margin-bottom: var(--spacing-lg);
                    padding-bottom: var(--spacing-md);
                    border-bottom: 2px solid var(--border-color);
                }

                .btn-back {
                    background: var(--bg-secondary);
                    border: none;
                    color: var(--primary);
                    font-size: 0.9375rem;
                    font-weight: 600;
                    cursor: pointer;
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-md);
                    transition: all var(--transition-fast);
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }

                .btn-back:hover {
                    background: var(--bg-tertiary);
                    transform: translateX(-4px);
                }

                .list-title h2 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    margin-bottom: 4px;
                    color: var(--text-primary);
                }

                .list-title p {
                    color: var(--text-secondary);
                    font-size: 0.9375rem;
                }

                .btn-new-appointment {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: linear-gradient(135deg, var(--success) 0%, #059669 100%);
                    color: white;
                    border: none;
                    border-radius: var(--radius-lg);
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    margin-bottom: var(--spacing-xl);
                    transition: all var(--transition-fast);
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
                }

                .btn-new-appointment:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.3);
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-lg);
                    padding: var(--spacing-2xl);
                    text-align: center;
                    background: var(--bg-secondary);
                    border-radius: var(--radius-xl);
                    border: 2px dashed var(--border-color);
                }

                .empty-state h3 {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin: 0;
                    color: var(--text-primary);
                }

                .appointments-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-lg);
                }

                .appointment-card {
                    display: flex;
                    align-items: stretch;
                    gap: var(--spacing-md);
                    padding: 0;
                    background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-card) 100%);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    cursor: pointer;
                    transition: all var(--transition-normal);
                    overflow: hidden;
                    position: relative;
                }

                .appointment-card::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 4px;
                    background: linear-gradient(180deg, var(--primary) 0%, #8b5cf6 100%);
                }

                .appointment-card:hover {
                    border-color: var(--primary);
                    transform: translateX(4px);
                    box-shadow: 0 8px 24px rgba(59, 130, 246, 0.15);
                }

                .apt-date-badge {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-width: 90px;
                    padding: var(--spacing-md);
                    background: linear-gradient(135deg, var(--primary) 0%, #2563eb 100%);
                    color: white;
                    flex-shrink: 0;
                }

                .badge-day {
                    font-size: 2.25rem;
                    font-weight: 800;
                    line-height: 1;
                    margin-bottom: 4px;
                }

                .badge-month-year {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    opacity: 0.9;
                }

                .apt-info {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                }

                .apt-client {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 1.0625rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .apt-phone,
                .apt-moto,
                .apt-mechanic {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .apt-arrow {
                    display: flex;
                    align-items: center;
                    padding: 0 var(--spacing-md);
                    font-size: 1.5rem;
                    color: var(--text-muted);
                    flex-shrink: 0;
                }

                /* Edit Modal */
                .mode-selector {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-lg);
                    padding: 4px;
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-md);
                }

                .mode-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-md);
                    background: transparent;
                    border: none;
                    border-radius: var(--radius-sm);
                    font-size: 0.9375rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .mode-btn.active {
                    background: var(--bg-primary);
                    color: var(--primary);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }

                .mb-md {
                    margin-bottom: var(--spacing-md);
                }

                @media (max-width: 768px) {
                    .welcome-title {
                        font-size: 1.875rem;
                    }

                    .main-buttons {
                        max-width: 100%;
                        padding: 0 var(--spacing-md);
                    }

                    .btn-main {
                        font-size: 1rem;
                        padding: var(--spacing-md) var(--spacing-lg);
                    }

                    .appointment-card {
                        flex-direction: row;
                    }

                    .apt-date-badge {
                        min-width: 70px;
                        padding: var(--spacing-sm);
                    }

                    .badge-day {
                        font-size: 1.75rem;
                    }

                    .badge-month-year {
                        font-size: 0.6875rem;
                    }
                }
            `}</style>
        </div>
    );
}
