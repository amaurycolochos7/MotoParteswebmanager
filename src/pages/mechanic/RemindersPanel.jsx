import { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Bell, Send, Calendar, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { sendAutomatedMessage } from '../../utils/whatsappHelper';

export default function RemindersPanel() {
    const { clients, motorcycles, orders } = useData();
    const { canManageAppointments } = useAuth();
    const [reminders, setReminders] = useState([]);
    const [sending, setSending] = useState(null);
    const [toast, setToast] = useState(null);

    // Calculate reminders based on last service date
    useEffect(() => {
        const calculateReminders = () => {
            const now = new Date();
            const remindersList = [];

            // Group orders by client and motorcycle
            const clientMotosMap = {};

            orders.forEach(order => {
                if (order.status === 'Entregada') {
                    const key = `${order.client_id}-${order.motorcycle_id}`;

                    if (!clientMotosMap[key]) {
                        clientMotosMap[key] = {
                            client_id: order.client_id,
                            motorcycle_id: order.motorcycle_id,
                            last_service: order.created_at,
                            order_id: order.id
                        };
                    } else {
                        // Keep the most recent service
                        if (new Date(order.created_at) > new Date(clientMotosMap[key].last_service)) {
                            clientMotosMap[key].last_service = order.created_at;
                            clientMotosMap[key].order_id = order.id;
                        }
                    }
                }
            });

            // Check which ones need reminders (3 months = 90 days)
            Object.values(clientMotosMap).forEach(entry => {
                const lastService = new Date(entry.last_service);
                const daysSinceService = Math.floor((now - lastService) / (1000 * 60 * 60 * 24));

                // Send reminder after 90 days (3 months)
                if (daysSinceService >= 90) {
                    const client = clients.find(c => c.id === entry.client_id);
                    const motorcycle = motorcycles.find(m => m.id === entry.motorcycle_id);

                    if (client && motorcycle) {
                        remindersList.push({
                            id: `${entry.client_id}-${entry.motorcycle_id}`,
                            client,
                            motorcycle,
                            last_service: entry.last_service,
                            days_since_service: daysSinceService,
                            order_id: entry.order_id
                        });
                    }
                }
            });

            // Sort by days since service (oldest first)
            remindersList.sort((a, b) => b.days_since_service - a.days_since_service);

            setReminders(remindersList);
        };

        calculateReminders();
    }, [orders, clients, motorcycles]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const getMaintenanceReminderMessage = (clientName, motorcycle, daysSince) => {
        const months = Math.floor(daysSince / 30);

        return `Hola ${clientName} 👋

🔔 *Recordatorio de Mantenimiento*

🏍️ ${motorcycle}

⏰ Han pasado ${months} ${months === 1 ? 'mes' : 'meses'} desde tu último servicio.

Es momento de revisar:
✅ Cambio de aceite
✅ Revisión de frenos
✅ Ajuste de cadena
✅ Estado de llantas

📅 *Agenda tu cita y mantén tu moto en perfecto estado*

Responde este mensaje o llámanos para agendar.

_Motopartes - Cuidamos tu moto_ 🔧✨`;
    };

    const handleSendReminder = async (reminder) => {
        if (!reminder.client.phone) {
            showToast('❌ Cliente sin teléfono', 'error');
            return;
        }

        try {
            setSending(reminder.id);

            const message = getMaintenanceReminderMessage(
                reminder.client.full_name,
                `${reminder.motorcycle.brand} ${reminder.motorcycle.model}`,
                reminder.days_since_service
            );

            const result = await sendAutomatedMessage(reminder.client.phone, message);

            if (result.success && result.automated) {
                showToast('✅ Recordatorio enviado', 'success');
            } else {
                showToast('⚠️ Abre WhatsApp para enviar', 'warning');
                // Fallback to manual WhatsApp using helper
                const { generateWhatsAppLink } = await import('../../utils/whatsappHelper');
                const link = generateWhatsAppLink(reminder.client.phone, message);
                window.open(link, '_blank');
            }
        } catch (error) {
            console.error('Error sending reminder:', error);
            showToast('❌ Error al enviar', 'error');
        } finally {
            setSending(null);
        }
    };

    if (!canManageAppointments()) {
        return (
            <div className="page">
                <div className="empty-state">
                    <AlertCircle size={48} />
                    <h2>Acceso Denegado</h2>
                    <p>No tienes permiso para gestionar recordatorios</p>
                </div>
            </div>
        );
    }

    return (
        <div className="reminders-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <Bell size={28} />
                        Recordatorios Automáticos
                    </h1>
                    <p className="page-subtitle">
                        {reminders.length} cliente{reminders.length !== 1 ? 's' : ''} necesita{reminders.length !== 1 ? 'n' : ''} mantenimiento
                    </p>
                </div>
            </div>

            {/* Info Card */}
            <div className="card info-card mb-lg">
                <div className="info-icon">
                    <Calendar size={24} />
                </div>
                <div className="info-content">
                    <h3>Sistema de Recordatorios</h3>
                    <p>Se muestran clientes que no han recibido servicio en los últimos 3 meses (90 días)</p>
                </div>
            </div>

            {/* Reminders List */}
            {reminders.length === 0 ? (
                <div className="empty-state card">
                    <CheckCircle size={48} style={{ color: 'var(--success)' }} />
                    <h3>¡Todo al día!</h3>
                    <p>No hay clientes que necesiten recordatorios en este momento</p>
                </div>
            ) : (
                <div className="reminders-list">
                    {reminders.map(reminder => {
                        const months = Math.floor(reminder.days_since_service / 30);

                        return (
                            <div key={reminder.id} className="reminder-card card">
                                <div className="reminder-header">
                                    <div className="client-info">
                                        <h3 className="client-name">{reminder.client.full_name}</h3>
                                        <p className="motorcycle-info">
                                            {reminder.motorcycle.brand} {reminder.motorcycle.model} ({reminder.motorcycle.year})
                                        </p>
                                        {reminder.client.phone && (
                                            <p className="phone-info">{reminder.client.phone}</p>
                                        )}
                                    </div>
                                    <div className="reminder-badge">
                                        <Clock size={20} />
                                        <strong>{months}</strong>
                                        <span>{months === 1 ? 'mes' : 'meses'}</span>
                                    </div>
                                </div>

                                <div className="reminder-footer">
                                    <div className="last-service">
                                        <span className="label">Último servicio:</span>
                                        <span className="date">
                                            {new Date(reminder.last_service).toLocaleDateString('es-MX', {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric'
                                            })}
                                        </span>
                                    </div>

                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleSendReminder(reminder)}
                                        disabled={sending === reminder.id || !reminder.client.phone}
                                    >
                                        {sending === reminder.id ? (
                                            <>
                                                <div className="spinner-small" />
                                                Enviando...
                                            </>
                                        ) : (
                                            <>
                                                <Send size={16} />
                                                Enviar Recordatorio
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    {toast.message}
                </div>
            )}

            <style>{`
                .reminders-page {
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

                .info-card {
                    display: flex;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg);
                    background: var(--primary-light);
                    border: 1px solid var(--primary);
                }

                .info-icon {
                    width: 48px;
                    height: 48px;
                    background: var(--primary);
                    color: white;
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .info-content h3 {
                    font-size: 1rem;
                    font-weight: 600;
                    margin-bottom: 4px;
                }

                .info-content p {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .reminders-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .reminder-card {
                    padding: var(--spacing-lg);
                }

                .reminder-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-md);
                    padding-bottom: var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                }

                .client-name {
                    font-size: 1.125rem;
                    font-weight: 700;
                    margin-bottom: 4px;
                }

                .motorcycle-info {
                    font-size: 0.9375rem;
                    color: var(--text-secondary);
                    margin-bottom: 2px;
                }

                .phone-info {
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                }

                .reminder-badge {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--warning-light);
                    border: 2px solid var(--warning);
                    border-radius: var(--radius-md);
                    color: var(--warning);
                }

                .reminder-badge strong {
                    font-size: 1.5rem;
                    font-weight: 700;
                    line-height: 1;
                }

                .reminder-badge span {
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-align: center;
                }

                .reminder-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: var(--spacing-md);
                }

                .last-service {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .last-service .label {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .last-service .date {
                    font-size: 0.875rem;
                    font-weight: 600;
                }

                .spinner-small {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .toast {
                    position: fixed;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    font-weight: 600;
                    z-index: 1000;
                    animation: slideUp 0.3s ease;
                }

                .toast-success {
                    border-left: 4px solid var(--success);
                }

                .toast-error {
                    border-left: 4px solid var(--danger);
                }

                .toast-warning {
                    border-left: 4px solid var(--warning);
                }

                @keyframes slideUp {
                    from {
                        transform: translateX(-50%) translateY(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(-50%) translateY(0);
                        opacity: 1;
                    }
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-2xl);
                }

                .empty-state h3 {
                    font-size: 1.25rem;
                    font-weight: 600;
                }

                .empty-state p {
                    color: var(--text-secondary);
                    text-align: center;
                }
            `}</style>
        </div>
    );
}
