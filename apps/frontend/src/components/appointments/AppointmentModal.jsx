import { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, Wrench, Plus, Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function AppointmentModal({ onClose, onSave, selectedDate, clients, motorcycles, users, onAddClient }) {
    const [formData, setFormData] = useState({
        client_id: '',
        motorcycle_id: '',
        scheduled_date: selectedDate ? selectedDate.toISOString().split('T')[0] : '',
        scheduled_time: '09:00',
        estimated_duration: 60,
        assigned_mechanic_id: '',
        service_type: '',
        notes: ''
    });

    const [selectedClient, setSelectedClient] = useState(null);
    const [clientSearch, setClientSearch] = useState('');
    const [showNewClientForm, setShowNewClientForm] = useState(false);
    const [newClientData, setNewClientData] = useState({
        full_name: '',
        phone: '',
        email: ''
    });

    const clientMotorcycles = selectedClient
        ? motorcycles.filter(m => m.client_id === selectedClient.id)
        : [];

    const { user } = useAuth();
    // Only show mechanics (not admin), with role label
    const mechanics = users?.filter(u => u.role === 'mechanic' && u.is_active) || [];
    console.log('[AppointmentModal] All users:', users);
    console.log('[AppointmentModal] Filtered mechanics:', mechanics.map(m => ({ name: m.full_name, role: m.role, is_active: m.is_active, is_master: m.is_master_mechanic })));

    // Filter clients by search term
    const filteredClients = clientSearch.trim()
        ? clients.filter(client => {
            const searchLower = clientSearch.toLowerCase();
            return (
                client.full_name.toLowerCase().includes(searchLower) ||
                (client.phone && client.phone.includes(searchLower))
            );
        })
        : clients;

    const handleClientSelect = (clientId) => {
        console.log('[AppointmentModal] handleClientSelect:', clientId);
        const client = clients.find(c => c.id === clientId);
        console.log('[AppointmentModal] Found client:', client);
        console.log('[AppointmentModal] All motorcycles:', motorcycles);
        console.log('[AppointmentModal] Client motorcycles:', motorcycles.filter(m => m.client_id === clientId));
        setSelectedClient(client);
        setFormData(prev => ({
            ...prev,
            client_id: clientId,
            motorcycle_id: ''
        }));
    };

    const handleAddNewClient = () => {
        if (!newClientData.full_name.trim() || !newClientData.phone.trim()) {
            alert('Nombre y teléfono son obligatorios');
            return;
        }

        const newClient = {
            id: `client-${Date.now()}`,
            ...newClientData,
            created_at: new Date().toISOString()
        };

        if (onAddClient) {
            onAddClient(newClient);
        }

        handleClientSelect(newClient.id);
        setShowNewClientForm(false);
        setNewClientData({ full_name: '', phone: '', email: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.client_id || !formData.motorcycle_id || !formData.scheduled_date || !formData.scheduled_time) {
            alert('Por favor completa todos los campos obligatorios');
            return;
        }

        onSave(formData);

        const client = clients.find(c => c.id === formData.client_id);
        const motorcycle = motorcycles.find(m => m.id === formData.motorcycle_id);
        const mechanic = mechanics.find(m => m.id === formData.assigned_mechanic_id);

        if (client && client.phone) {
            const { sendAutomatedMessage } = await import('../../utils/whatsappHelper');

            const appointmentDate = new Date(formData.scheduled_date + 'T' + formData.scheduled_time);
            const dateFormatted = appointmentDate.toLocaleDateString('es-MX', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const timeFormatted = appointmentDate.toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const message = `Hola ${client.full_name} 👋

📅 *Cita Confirmada - Motopartes*

✅ Tu cita ha sido agendada exitosamente

🏍️ *Motocicleta:* ${motorcycle.brand} ${motorcycle.model} (${motorcycle.year})
📆 *Fecha:* ${dateFormatted}
🕒 *Hora:* ${timeFormatted}
⏱️ *Duración estimada:* ${formData.estimated_duration} minutos
${mechanic ? `👨‍🔧 *Mecánico:* ${mechanic.full_name}
` : ''}${formData.service_type ? `🔧 *Servicio:* ${formData.service_type}
` : ''}
📍 *Motopartes - Tu taller de confianza*

${formData.notes ? `📝 *Notas:* ${formData.notes}

` : ''}Te esperamos puntualmente. Si necesitas reprogramar, contáctanos con anticipación.

¡Gracias por confiar en nosotros! 🙏`;

            try {
                await sendAutomatedMessage(client.phone, message);
                console.log('✅ Confirmación de cita enviada por WhatsApp');
            } catch (error) {
                console.error('Error enviando confirmación:', error);
            }
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal appointment-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">
                        <Calendar size={20} />
                        Nueva Cita
                    </h3>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        {/* Client Selection */}
                        <div className="form-group">
                            <div className="form-label-row">
                                <label className="form-label">
                                    <User size={16} />
                                    Cliente *
                                </label>
                                <button
                                    type="button"
                                    className="btn-link"
                                    onClick={() => setShowNewClientForm(!showNewClientForm)}
                                >
                                    <Plus size={14} />
                                    {showNewClientForm ? 'Cancelar' : 'Nuevo'}
                                </button>
                            </div>

                            {showNewClientForm ? (
                                <div className="new-client-form">
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Nombre completo *"
                                        value={newClientData.full_name}
                                        onChange={e => setNewClientData(prev => ({ ...prev, full_name: e.target.value }))}
                                    />
                                    <input
                                        type="tel"
                                        className="form-input"
                                        placeholder="Teléfono *"
                                        value={newClientData.phone}
                                        onChange={e => setNewClientData(prev => ({ ...prev, phone: e.target.value }))}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={handleAddNewClient}
                                    >
                                        Agregar Cliente
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Filtrar por nombre o teléfono..."
                                        value={clientSearch}
                                        onChange={e => setClientSearch(e.target.value)}
                                    />
                                    <select
                                        className="form-input"
                                        value={formData.client_id}
                                        onChange={e => handleClientSelect(e.target.value)}
                                        required
                                    >
                                        <option value="">-- Seleccionar cliente --</option>
                                        {filteredClients.map(client => (
                                            <option key={client.id} value={client.id}>
                                                {client.full_name} • {client.phone || 'Sin teléfono'}
                                            </option>
                                        ))}
                                    </select>
                                </>
                            )}
                        </div>

                        {/* Motorcycle */}
                        <div className="form-group">
                            <label className="form-label">Motocicleta *</label>
                            <select
                                className="form-input"
                                value={formData.motorcycle_id}
                                onChange={e => setFormData(prev => ({ ...prev, motorcycle_id: e.target.value }))}
                                disabled={!selectedClient}
                                required
                            >
                                <option value="">
                                    {selectedClient
                                        ? (clientMotorcycles.length > 0 ? '-- Seleccionar moto --' : 'Sin motos registradas')
                                        : 'Primero selecciona un cliente'}
                                </option>
                                {clientMotorcycles.map(moto => (
                                    <option key={moto.id} value={moto.id}>
                                        {moto.brand} {moto.model} ({moto.year})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Date & Time Row */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">
                                    <Calendar size={16} />
                                    Fecha *
                                </label>
                                <input
                                    type="date"
                                    className="form-input"
                                    value={formData.scheduled_date}
                                    onChange={e => setFormData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    <Clock size={16} />
                                    Hora *
                                </label>
                                <input
                                    type="time"
                                    className="form-input"
                                    value={formData.scheduled_time}
                                    onChange={e => setFormData(prev => ({ ...prev, scheduled_time: e.target.value }))}
                                    required
                                />
                            </div>
                        </div>

                        {/* Duration & Mechanic Row */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Duración</label>
                                <select
                                    className="form-input"
                                    value={formData.estimated_duration}
                                    onChange={e => setFormData(prev => ({ ...prev, estimated_duration: parseInt(e.target.value) }))}
                                >
                                    <option value="30">30 min</option>
                                    <option value="60">1 hora</option>
                                    <option value="90">1.5 hrs</option>
                                    <option value="120">2 hrs</option>
                                    <option value="180">3 hrs</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    <Wrench size={16} />
                                    Mecánico
                                </label>
                                <select
                                    className="form-input"
                                    value={formData.assigned_mechanic_id}
                                    onChange={e => setFormData(prev => ({ ...prev, assigned_mechanic_id: e.target.value }))}
                                >
                                    <option value="">Sin asignar</option>
                                    {mechanics.map(mech => {
                                        const roleLabel = mech.is_master_mechanic ? '👨‍🔧 Maestro' : '🔧 Auxiliar';
                                        return (
                                            <option key={mech.id} value={mech.id}>
                                                {mech.full_name} ({roleLabel})
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>

                        {/* Service Type */}
                        <div className="form-group">
                            <label className="form-label">Tipo de Servicio</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Ej: Mantenimiento preventivo..."
                                value={formData.service_type}
                                onChange={e => setFormData(prev => ({ ...prev, service_type: e.target.value }))}
                            />
                        </div>

                        {/* Notes */}
                        <div className="form-group">
                            <label className="form-label">Notas</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Notas adicionales..."
                                value={formData.notes}
                                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                rows={2}
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary">
                            <Calendar size={16} />
                            Agendar Cita
                        </button>
                    </div>
                </form>

                <style>{`
                    .appointment-modal {
                        width: 100%;
                        max-width: 500px;
                        max-height: 90vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .appointment-modal .modal-body {
                        flex: 1;
                        overflow-y: auto;
                        padding: var(--spacing-md);
                    }

                    .appointment-modal .modal-footer {
                        flex-shrink: 0;
                        display: flex;
                        gap: var(--spacing-sm);
                        padding: var(--spacing-md);
                        border-top: 1px solid var(--border-color);
                        background: var(--bg-primary);
                    }

                    .appointment-modal .modal-footer .btn {
                        flex: 1;
                    }

                    .form-label-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: var(--spacing-xs);
                    }

                    .form-label {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 0.875rem;
                        font-weight: 600;
                        margin-bottom: var(--spacing-xs);
                    }

                    .form-label-row .form-label {
                        margin-bottom: 0;
                    }

                    .btn-link {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        background: none;
                        border: none;
                        color: var(--primary);
                        font-size: 0.8125rem;
                        font-weight: 600;
                        cursor: pointer;
                        padding: 4px 8px;
                        border-radius: var(--radius-sm);
                    }

                    .btn-link:hover {
                        background: var(--primary-light);
                    }

                    .form-group {
                        margin-bottom: var(--spacing-md);
                    }

                    .form-row {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: var(--spacing-sm);
                    }

                    .form-row .form-group {
                        margin-bottom: var(--spacing-md);
                    }

                    .new-client-form {
                        display: flex;
                        flex-direction: column;
                        gap: var(--spacing-sm);
                        padding: var(--spacing-md);
                        background: var(--bg-secondary);
                        border-radius: var(--radius-md);
                    }

                    .btn-sm {
                        padding: 8px 16px;
                        font-size: 0.875rem;
                    }

                    @media (max-width: 640px) {
                        .appointment-modal {
                            max-height: 85vh;
                            margin: 10px;
                        }

                        .appointment-modal .modal-body {
                            max-height: calc(85vh - 140px);
                        }

                        .form-row {
                            grid-template-columns: 1fr 1fr;
                            gap: var(--spacing-xs);
                        }
                    }
                `}</style>
            </div>
        </div>
    );
}
