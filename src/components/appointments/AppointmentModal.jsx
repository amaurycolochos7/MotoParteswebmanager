import { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, Wrench, Plus, Search, Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function AppointmentModal({ onClose, onSave, selectedDate, clients, motorcycles, users, onAddClient }) {
    const [formData, setFormData] = useState({
        client_id: '',
        motorcycle_id: '',
        scheduled_date: selectedDate ? selectedDate.toISOString().split('T')[0] : '',
        scheduled_time: '09:00',
        estimated_duration: 60,
        assigned_mechanic_id: '', // Will be set in useEffect
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
    // Include both mechanics and admins (admins can also do mechanic work)
    const mechanics = users?.filter(u => (u.role === 'mechanic' || u.role === 'admin') && u.is_active) || [];

    // No auto-assign mechanic - let user select manually

    // Filter clients by name or phone
    const filteredClients = clients.filter(client => {
        const searchLower = clientSearch.toLowerCase();
        return (
            client.full_name.toLowerCase().includes(searchLower) ||
            (client.phone && client.phone.includes(searchLower))
        );
    });

    const handleClientChange = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        setSelectedClient(client);
        setFormData(prev => ({
            ...prev,
            client_id: clientId,
            motorcycle_id: '' // Reset motorcycle when client changes
        }));
    };

    const handleAddNewClient = () => {
        if (!newClientData.full_name.trim() || !newClientData.phone.trim()) {
            alert('Nombre y teléfono son obligatorios');
            return;
        }

        // Create new client (this should call a function from DataContext)
        const newClient = {
            id: `client-${Date.now()}`,
            ...newClientData,
            created_at: new Date().toISOString()
        };

        if (onAddClient) {
            onAddClient(newClient);
        }

        // Select the new client
        handleClientChange(newClient.id);

        // Reset form and close
        setShowNewClientForm(false);
        setNewClientData({ full_name: '', phone: '', email: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.client_id || !formData.motorcycle_id || !formData.scheduled_date || !formData.scheduled_time) {
            alert('Por favor completa todos los campos obligatorios');
            return;
        }

        // Save appointment
        onSave(formData);

        // Send WhatsApp confirmation to client
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
                // Don't block the appointment creation if WhatsApp fails
            }
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-large" onClick={e => e.stopPropagation()}>
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
                        <div className="form-grid">
                            {/* Client Search/Select */}
                            <div className="form-group form-group-full">
                                <div className="client-header">
                                    <label className="form-label">
                                        <User size={16} />
                                        Cliente *
                                    </label>
                                    <button
                                        type="button"
                                        className="btn-add-client"
                                        onClick={() => setShowNewClientForm(!showNewClientForm)}
                                    >
                                        <Plus size={16} />
                                        {showNewClientForm ? 'Cancelar' : 'Nuevo Cliente'}
                                    </button>
                                </div>

                                {showNewClientForm ? (
                                    <div className="new-client-form">
                                        <div className="new-client-grid">
                                            <div className="form-group">
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    placeholder="Nombre completo *"
                                                    value={newClientData.full_name}
                                                    onChange={e => setNewClientData(prev => ({ ...prev, full_name: e.target.value }))}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <div className="input-with-icon">
                                                    <Phone className="input-icon" size={18} />
                                                    <input
                                                        type="tel"
                                                        className="form-input"
                                                        placeholder="Teléfono *"
                                                        value={newClientData.phone}
                                                        onChange={e => setNewClientData(prev => ({ ...prev, phone: e.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <input
                                                    type="email"
                                                    className="form-input"
                                                    placeholder="Email (opcional)"
                                                    value={newClientData.email}
                                                    onChange={e => setNewClientData(prev => ({ ...prev, email: e.target.value }))}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-primary btn-sm"
                                                onClick={handleAddNewClient}
                                            >
                                                <Plus size={16} />
                                                Agregar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="input-with-icon">
                                            <Search className="input-icon" size={18} />
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="Buscar por nombre o teléfono..."
                                                value={clientSearch}
                                                onChange={e => setClientSearch(e.target.value)}
                                            />
                                        </div>
                                        <select
                                            className="form-input client-select"
                                            value={formData.client_id}
                                            onChange={e => handleClientChange(e.target.value)}
                                            required
                                        >
                                            <option value="">Seleccionar cliente...</option>
                                            {filteredClients.map(client => (
                                                <option key={client.id} value={client.id}>
                                                    {client.full_name} {client.phone && `• ${client.phone}`}
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
                                    <option value="">Seleccionar moto...</option>
                                    {clientMotorcycles.map(moto => (
                                        <option key={moto.id} value={moto.id}>
                                            {moto.brand} {moto.model} ({moto.year})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Date */}
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

                            {/* Time */}
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

                            {/* Duration */}
                            <div className="form-group">
                                <label className="form-label">Duración Estimada (min)</label>
                                <select
                                    className="form-input"
                                    value={formData.estimated_duration}
                                    onChange={e => setFormData(prev => ({ ...prev, estimated_duration: parseInt(e.target.value) }))}
                                >
                                    <option value="30">30 minutos</option>
                                    <option value="60">1 hora</option>
                                    <option value="90">1.5 horas</option>
                                    <option value="120">2 horas</option>
                                    <option value="180">3 horas</option>
                                    <option value="240">4 horas</option>
                                </select>
                            </div>

                            {/* Mechanic */}
                            <div className="form-group">
                                <label className="form-label">
                                    <Wrench size={16} />
                                    Mecánico Asignado
                                </label>
                                <select
                                    className="form-input"
                                    value={formData.assigned_mechanic_id}
                                    onChange={e => setFormData(prev => ({ ...prev, assigned_mechanic_id: e.target.value }))}
                                >
                                    <option value="">Sin asignar</option>
                                    {mechanics.map(mech => (
                                        <option key={mech.id} value={mech.id}>
                                            {mech.full_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Service Type */}
                            <div className="form-group form-group-full">
                                <label className="form-label">Tipo de Servicio</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ej: Mantenimiento preventivo, Reparación general..."
                                    value={formData.service_type}
                                    onChange={e => setFormData(prev => ({ ...prev, service_type: e.target.value }))}
                                />
                            </div>

                            {/* Notes */}
                            <div className="form-group form-group-full">
                                <label className="form-label">Notas</label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Notas adicionales sobre la cita..."
                                    value={formData.notes}
                                    onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    rows={3}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary">
                            <Calendar size={18} />
                            Agendar Cita
                        </button>
                    </div>
                </form>

                <style>{`
                    .form-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: var(--spacing-md);
                    }

                    .form-group-full {
                        grid-column: 1 / -1;
                    }

                    .form-label {
                        display: flex;
                        align-items: center;
                        gap: var(--spacing-xs);
                        font-size: 0.875rem;
                        font-weight: 600;
                        margin-bottom: var(--spacing-xs);
                    }

                    .client-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: var(--spacing-sm);
                    }

                    .btn-add-client {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 6px 12px;
                        background: var(--primary-light);
                        color: var(--primary);
                        border: none;
                        border-radius: var(--radius-md);
                        font-size: 0.8125rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all var(--transition-fast);
                    }

                    .btn-add-client:hover {
                        background: var(--primary);
                        color: white;
                    }

                    .client-select {
                        margin-top: var(--spacing-xs);
                        max-height: 200px;
                    }

                    .new-client-form {
                        padding: var(--spacing-md);
                        background: var(--bg-secondary);
                        border-radius: var(--radius-md);
                        margin-top: var(--spacing-xs);
                    }

                    .new-client-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: var(--spacing-sm);
                    }

                    .new-client-grid .form-group:nth-child(3) {
                        grid-column: 1 / -1;
                    }

                    .new-client-grid button {
                        grid-column: 1 / -1;
                    }

                    .btn-sm {
                        padding: 8px 16px;
                        font-size: 0.875rem;
                    }

                    .input-with-icon {
                        position: relative;
                        display: flex;
                        align-items: center;
                    }

                    .input-icon {
                        position: absolute;
                        left: 12px;
                        color: var(--text-muted);
                        pointer-events: none;
                    }

                    .input-with-icon .form-input {
                        padding-left: 40px;
                    }

                    @media (max-width: 640px) {
                        .form-grid {
                            grid-template-columns: 1fr;
                        }

                        .new-client-grid {
                            grid-template-columns: 1fr;
                        }

                        .new-client-grid .form-group:nth-child(3) {
                            grid-column: 1;
                        }

                        .new-client-grid button {
                            grid-column: 1;
                        }
                    }
                `}</style>
            </div>
        </div>
    );
}
