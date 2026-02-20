import { useState, useMemo } from 'react';
import {
    Search,
    Plus,
    User,
    Phone,
    Mail,
    FileText,
    X,
    Users,
    Bike,
    Edit2,
    Trash2,
    AlertCircle,
    MessageCircle
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import WhatsAppSendModal from '../../components/ui/WhatsAppSendModal';

export default function ClientsList() {
    const { user, isAdmin, canCreateClients, canEditClients } = useAuth();
    const { clients, addClient, updateClient, deleteClient, getClientMotorcycles, addMotorcycle, updateMotorcycle, deleteMotorcycle } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        email: '',
        notes: ''
    });
    const [motorcycles, setMotorcyclesForm] = useState([]);
    const [waModalClient, setWaModalClient] = useState(null); // client for WhatsApp modal

    // Filter clients
    const filteredClients = useMemo(() => {
        if (!searchQuery.trim()) return clients;

        const query = searchQuery.toLowerCase();
        return clients.filter(client =>
            client.full_name?.toLowerCase().includes(query) ||
            client.phone?.includes(query) ||
            client.email?.toLowerCase().includes(query)
        );
    }, [clients, searchQuery]);

    const openAddModal = () => {
        setEditingClient(null);
        setFormData({ full_name: '', phone: '', email: '', notes: '' });
        setMotorcyclesForm([]);
        setShowModal(true);
    };

    const openEditModal = (client) => {
        setEditingClient(client);
        setFormData({
            full_name: client.full_name,
            phone: client.phone,
            email: client.email || '',
            notes: client.notes || ''
        });
        // Load client's motorcycles
        const clientMotos = getClientMotorcycles(client.id).map(moto => ({
            id: moto.id,
            brand: moto.brand,
            model: moto.model,
            year: moto.year,
            plates: moto.plates || '',
            color: moto.color || '',
        }));
        setMotorcyclesForm(clientMotos);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.full_name.trim() || !formData.phone.trim()) {
            alert('Nombre y teléfono son obligatorios');
            return;
        }

        try {
            if (editingClient) {
                // Update existing client
                await updateClient(editingClient.id, {
                    full_name: formData.full_name.trim(),
                    phone: formData.phone.trim(),
                    email: formData.email.trim(),
                    notes: formData.notes.trim()
                });

                // Update motorcycles
                const currentMotos = getClientMotorcycles(editingClient.id);

                // Delete removed motorcycles
                for (const moto of currentMotos) {
                    if (!motorcycles.find(m => m.id === moto.id)) {
                        await deleteMotorcycle(moto.id);
                    }
                }

                // Add/Update motorcycles
                for (const moto of motorcycles) {
                    if (moto.id && typeof moto.id === 'string' && moto.id.startsWith('moto-') && !moto.id.includes('demo')) {
                        // This check was a bit flaky in original code, relying on moto- prefix.
                        // Better check: if it comes from DB it has UUID. If it's temp it might have temp ID.
                        // Assuming getClientMotorcycles returns valid IDs.
                        // Let's stick to update logic: exists in DB?
                        // If logic was: if it was in initial list, it's update.

                        // Simplifying: we call update. DataContext update handles it.
                        await updateMotorcycle(moto.id, {
                            brand: moto.brand,
                            model: moto.model,
                            year: moto.year,
                            plates: moto.plates,
                            color: moto.color,
                        });
                    } else if (moto.id && !moto.id.toString().includes('demo') && !moto.id.toString().includes('temp')) {
                        // Valid ID implies update
                        await updateMotorcycle(moto.id, {
                            brand: moto.brand,
                            model: moto.model,
                            year: moto.year,
                            plates: moto.plates,
                            color: moto.color,
                        });
                    } else {
                        // New moto - add
                        await addMotorcycle({
                            client_id: editingClient.id,
                            brand: moto.brand,
                            model: moto.model,
                            year: moto.year,
                            plates: moto.plates,
                            color: moto.color,
                        });
                    }
                }
            } else {
                // Add new client
                const newClient = await addClient({
                    full_name: formData.full_name.trim(),
                    phone: formData.phone.trim(),
                    email: formData.email.trim(),
                    notes: formData.notes.trim()
                });

                // Add motorcycles
                if (newClient && newClient.id) {
                    for (const moto of motorcycles) {
                        if (moto.brand && moto.model) {
                            await addMotorcycle({
                                client_id: newClient.id,
                                brand: moto.brand,
                                model: moto.model,
                                year: moto.year,
                                plates: moto.plates,
                                color: moto.color,
                            });
                        }
                    }
                }
            }

            setShowModal(false);
            setFormData({ full_name: '', phone: '', email: '', notes: '' });
            setMotorcyclesForm([]);
        } catch (error) {
            console.error('Error saving client:', error);
            alert('Error al guardar: ' + error.message);
        }
    };

    const handleDelete = (client) => {
        const hasMotos = getClientMotorcycles(client.id).length > 0;
        const confirmMessage = hasMotos
            ? `¿Eliminar a ${client.full_name}?\nTambién se eliminarán ${getClientMotorcycles(client.id).length} moto(s)`
            : `¿Eliminar a ${client.full_name}?`;

        if (confirm(confirmMessage)) {
            deleteClient(client.id);
        }
    };

    const addMotoToForm = () => {
        setMotorcyclesForm(prev => [...prev, {
            id: `temp-${Date.now()}`,
            brand: '',
            model: '',
            year: new Date().getFullYear().toString(),
            plates: '',
            color: '',
        }]);
    };

    const updateMotoInForm = (index, field, value) => {
        setMotorcyclesForm(prev => prev.map((moto, i) =>
            i === index ? { ...moto, [field]: value } : moto
        ));
    };

    const removeMotoFromForm = (index) => {
        setMotorcyclesForm(prev => prev.filter((_, i) => i !== index));
    };

    const getClientMotosCount = (clientId) => {
        return getClientMotorcycles(clientId).length;
    };

    return (
        <div className="clients-page">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Clientes</h1>
                    <p className="page-subtitle">
                        {clients.length} cliente{clients.length !== 1 ? 's' : ''} registrado{clients.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    className="btn btn-primary btn-sm"
                    onClick={openAddModal}
                    disabled={!canCreateClients()}
                    style={{ display: canCreateClients() ? 'flex' : 'none' }}
                >
                    <Plus size={18} />
                    <span className="btn-text-mobile">Nuevo Cliente</span>
                </button>
            </div>

            {/* Search */}
            <div className="search-box">
                <Search size={20} className="search-icon" />
                <input
                    type="text"
                    className="search-input"
                    placeholder="Buscar por nombre, teléfono o email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                    <button
                        className="search-clear"
                        onClick={() => setSearchQuery('')}
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Clients List */}
            <div className="clients-list">
                {filteredClients.length === 0 ? (
                    <div className="empty-state card">
                        <Users size={48} style={{ opacity: 0.3 }} />
                        <h3>No se encontraron clientes</h3>
                        <p className="text-secondary">
                            {searchQuery
                                ? 'Intenta con otro término de búsqueda'
                                : 'Agrega tu primer cliente para comenzar'
                            }
                        </p>
                        {!searchQuery && (
                            <button
                                className="btn btn-primary mt-md"
                                onClick={openAddModal}
                            >
                                <Plus size={18} />
                                Agregar Cliente
                            </button>
                        )}
                    </div>
                ) : (
                    filteredClients.map(client => (
                        <div key={client.id} className="client-card card">
                            <div className="client-card-header">
                                <div className="client-avatar">
                                    <User size={24} />
                                </div>
                                <div className="client-info">
                                    <h3 className="client-name">{client.full_name}</h3>
                                    <div className="client-meta">
                                        {getClientMotosCount(client.id) > 0 && (
                                            <span className="meta-item">
                                                <Bike size={14} />
                                                {getClientMotosCount(client.id)} moto{getClientMotosCount(client.id) > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {canEditClients() && (
                                    <div className="client-actions">
                                        {client.phone && (
                                            <button
                                                className="btn-icon-small btn-whatsapp"
                                                onClick={() => setWaModalClient(client)}
                                                title="Enviar WhatsApp"
                                            >
                                                <MessageCircle size={18} />
                                            </button>
                                        )}
                                        <button
                                            className="btn-icon-small btn-edit"
                                            onClick={() => openEditModal(client)}
                                            title="Editar"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            className="btn-icon-small btn-delete"
                                            onClick={() => handleDelete(client)}
                                            title="Eliminar"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="client-details">
                                <div className="detail-item">
                                    <Phone size={16} className="detail-icon" />
                                    <span>{client.phone}</span>
                                </div>
                                {client.email && (
                                    <div className="detail-item">
                                        <Mail size={16} className="detail-icon" />
                                        <span>{client.email}</span>
                                    </div>
                                )}
                                {client.notes && (
                                    <div className="detail-item">
                                        <FileText size={16} className="detail-icon" />
                                        <span className="text-secondary">{client.notes}</span>
                                    </div>
                                )}
                            </div>

                            {getClientMotorcycles(client.id).length > 0 && (
                                <div className="client-motos">
                                    <div className="motos-label">Motocicletas:</div>
                                    {getClientMotorcycles(client.id).map(moto => (
                                        <div key={moto.id} className="moto-chip">
                                            <Bike size={14} />
                                            {moto.brand} {moto.model} ({moto.year})
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Floating Add Button */}
            <button
                className="fab-button"
                onClick={openAddModal}
                title="Agregar cliente"
            >
                <Plus size={24} />
            </button>

            {/* Add/Edit Client Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-large" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Client Info */}
                            <div className="form-section">
                                <h4 className="form-section-title">Datos del Cliente</h4>

                                <div className="form-group">
                                    <label className="form-label">
                                        Nombre Completo <span className="required">*</span>
                                    </label>
                                    <div className="input-with-icon">
                                        <User className="input-icon" size={20} />
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Juan Pérez"
                                            value={formData.full_name}
                                            onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">
                                        Teléfono <span className="required">*</span>
                                    </label>
                                    <div className="input-with-icon">
                                        <Phone className="input-icon" size={20} />
                                        <input
                                            type="tel"
                                            className="form-input"
                                            placeholder="555-123-4567"
                                            value={formData.phone}
                                            onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Email (opcional)</label>
                                    <div className="input-with-icon">
                                        <Mail className="input-icon" size={20} />
                                        <input
                                            type="email"
                                            className="form-input"
                                            placeholder="cliente@email.com"
                                            value={formData.email}
                                            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Notas (opcional)</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Información adicional del cliente..."
                                        value={formData.notes}
                                        onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                        rows={2}
                                    />
                                </div>
                            </div>

                            {/* Motorcycles Section */}
                            <div className="form-section">
                                <div className="form-section-header">
                                    <h4 className="form-section-title">
                                        <Bike size={18} />
                                        Motocicletas
                                    </h4>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={addMotoToForm}
                                    >
                                        <Plus size={16} />
                                        Agregar Moto
                                    </button>
                                </div>

                                {motorcycles.length === 0 ? (
                                    <div className="empty-message">
                                        <AlertCircle size={20} />
                                        <span>Sin motocicletas registradas</span>
                                    </div>
                                ) : (
                                    <div className="motos-form-list">
                                        {motorcycles.map((moto, index) => (
                                            <div key={moto.id} className="moto-form-item">
                                                <div className="moto-form-header">
                                                    <span className="moto-number">Moto #{index + 1}</span>
                                                    <button
                                                        type="button"
                                                        className="btn-icon-small btn-delete"
                                                        onClick={() => removeMotoFromForm(index)}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>

                                                <div className="grid grid-2">
                                                    <div className="form-group">
                                                        <label className="form-label">Marca</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="Honda"
                                                            value={moto.brand}
                                                            onChange={e => updateMotoInForm(index, 'brand', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Modelo</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="CB500X"
                                                            value={moto.model}
                                                            onChange={e => updateMotoInForm(index, 'model', e.target.value)}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-2">
                                                    <div className="form-group">
                                                        <label className="form-label">Año</label>
                                                        <input
                                                            type="number"
                                                            className="form-input"
                                                            placeholder="2023"
                                                            value={moto.year}
                                                            onChange={e => updateMotoInForm(index, 'year', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Placas</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="ABC-123"
                                                            value={moto.plates}
                                                            onChange={e => updateMotoInForm(index, 'plates', e.target.value.toUpperCase())}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Color</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        placeholder="Negro"
                                                        value={moto.color}
                                                        onChange={e => updateMotoInForm(index, 'color', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button
                                className="btn btn-outline"
                                onClick={() => setShowModal(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={!formData.full_name.trim() || !formData.phone.trim()}
                            >
                                {editingClient ? (
                                    <>
                                        <Edit2 size={18} />
                                        Guardar Cambios
                                    </>
                                ) : (
                                    <>
                                        <Plus size={18} />
                                        Crear Cliente
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .clients-page {
          padding-bottom: 80px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--spacing-lg);
        }

        .page-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .page-subtitle {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .search-box {
          position: relative;
          margin-bottom: var(--spacing-lg);
        }

        .search-icon {
          position: absolute;
          left: var(--spacing-md);
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .search-input {
          width: 100%;
          padding: var(--spacing-sm) var(--spacing-md) var(--spacing-sm) 48px;
          background: var(--bg-card);
          border: 2px solid var(--border-color);
          border-radius: var(--radius-lg);
          font-size: 0.9375rem;
          color: var(--text-primary);
          transition: all var(--transition-fast);
        }

        .search-input:focus {
          outline: none;
          border-color: var(--primary);
          background: var(--bg-primary);
        }

        .search-clear {
          position: absolute;
          right: var(--spacing-md);
          top: 50%;
          transform: translateY(-50%);
          background: var(--bg-tertiary);
          border: none;
          width: 24px;
          height: 24px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-muted);
        }

        .search-clear:hover {
          background: var(--bg-hover);
        }

        .clients-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .client-card {
          padding: var(--spacing-md);
        }

        .client-card-header {
          display: flex;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-md);
          align-items: center;
        }

        .client-avatar {
          width: 48px;
          height: 48px;
          background: var(--primary-light);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
          flex-shrink: 0;
        }

        .client-info {
          flex: 1;
          min-width: 0;
        }

        .client-name {
          font-size: 1.0625rem;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .client-meta {
          display: flex;
          gap: var(--spacing-sm);
          flex-wrap: wrap;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .client-actions {
          display: flex;
          gap: var(--spacing-xs);
          flex-shrink: 0;
        }

        .btn-icon-small {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-md);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .btn-edit {
          background: var(--secondary-light);
          color: var(--secondary);
        }

        .btn-edit:hover {
          background: var(--secondary);
          color: white;
        }

        .btn-delete {
          background: rgba(239, 68, 68, 0.1);
          color: var(--danger);
        }

        .btn-delete:hover {
          background: var(--danger);
          color: white;
        }

        .btn-whatsapp {
          background: rgba(37, 211, 102, 0.12);
          color: #25D366;
        }

        .btn-whatsapp:hover {
          background: #25D366;
          color: white;
        }

        .client-details {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
          padding: var(--spacing-md);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-sm);
        }

        .detail-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-size: 0.875rem;
        }

        .detail-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .client-motos {
          padding-top: var(--spacing-sm);
          border-top: 1px solid var(--border-color);
        }

        .motos-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-muted);
          margin-bottom: var(--spacing-xs);
        }

        .moto-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px var(--spacing-sm);
          background: var(--secondary-light);
          color: var(--secondary);
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          font-weight: 500;
          margin-right: var(--spacing-xs);
          margin-top: var(--spacing-xs);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: var(--spacing-xl);
        }

        .empty-state h3 {
          margin: var(--spacing-md) 0 var(--spacing-xs);
        }

        .required {
          color: var(--danger);
        }

        /* Floating Action Button */
        .fab-button {
          position: fixed;
          bottom: calc(70px + var(--spacing-md));
          right: var(--spacing-md);
          width: 56px;
          height: 56px;
          background: var(--primary);
          border: none;
          border-radius: var(--radius-full);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
          cursor: pointer;
          transition: all var(--transition-fast);
          z-index: 100;
        }

        .fab-button:hover {
          background: var(--primary-hover);
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
        }

        .fab-button:active {
          transform: scale(0.95);
        }

        /* Modal */
        .modal-large {
          max-width: 520px;
        }

        .form-section {
          margin-bottom: var(--spacing-lg);
          padding-bottom: var(--spacing-lg);
          border-bottom: 1px solid var(--border-color);
        }

        .form-section:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }

        .form-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-md);
        }

        .form-section-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-md);
        }

        .btn-sm {
          padding: var(--spacing-xs) var(--spacing-sm);
          font-size: 0.8125rem;
        }

        .motos-form-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .moto-form-item {
          padding: var(--spacing-md);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          border: 2px solid var(--border-color);
        }

        .moto-form-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-sm);
        }

        .moto-number {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--primary);
        }

        .empty-message {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-lg);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          color: var(--text-muted);
          font-size: 0.875rem;
        }
      `}</style>

            {/* WhatsApp Send Modal */}
            <WhatsAppSendModal
                isOpen={!!waModalClient}
                onClose={() => setWaModalClient(null)}
                phone={waModalClient?.phone || ''}
                clientName={waModalClient?.full_name || ''}
            />
        </div>
    );
}
