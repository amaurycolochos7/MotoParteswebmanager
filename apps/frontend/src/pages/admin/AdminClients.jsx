import { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
    Search,
    Plus,
    Edit2,
    Trash2,
    Phone,
    Mail,
    Bike,
    User,
    X,
    Save
} from 'lucide-react';


export default function AdminClients() {
    const { clients, orders, addClient, updateClient, deleteClient, loading } = useData();
    const { user, hasPermission } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [confirmModal, setConfirmModal] = useState(null);
    const [deletingClient, setDeletingClient] = useState(null);
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        email: '',
        notes: ''
    });

    const canEdit = hasPermission('canEditClients');
    const canDelete = hasPermission('canDeleteClients');

    // Filtrar clientes
    const filteredClients = useMemo(() => {
        if (!searchTerm) return clients;
        const search = searchTerm.toLowerCase();
        return clients.filter(client =>
            client.full_name?.toLowerCase().includes(search) ||
            client.phone?.includes(searchTerm) ||
            client.email?.toLowerCase().includes(search)
        );
    }, [clients, searchTerm]);

    const handleOpenModal = (client = null) => {
        if (client) {
            setEditingClient(client);
            setFormData({
                full_name: client.full_name || '',
                phone: client.phone || '',
                email: client.email || '',
                notes: client.notes || ''
            });
        } else {
            setEditingClient(null);
            setFormData({ full_name: '', phone: '', email: '', notes: '' });
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingClient(null);
        setFormData({ full_name: '', phone: '', email: '', notes: '' });
    };

    const handleSave = async () => {
        if (!formData.full_name.trim() || !formData.phone.trim()) {
            alert('Nombre y teléfono son requeridos');
            return;
        }

        try {
            if (editingClient) {
                await updateClient(editingClient.id, formData);
            } else {
                await addClient(formData, user?.id);
            }
            handleCloseModal();
        } catch (error) {
            alert('Error al guardar: ' + error.message);
        }
    };

    const handleDelete = (client) => {
        // Verificar si el cliente tiene órdenes
        const clientOrders = orders?.filter(o => o.client_id === client.id) || [];

        if (clientOrders.length > 0) {
            setConfirmModal({
                title: 'No se puede eliminar',
                message: `El cliente ${client.full_name} tiene ${clientOrders.length} orden${clientOrders.length > 1 ? 'es' : ''} asociada${clientOrders.length > 1 ? 's' : ''}. Elimina las órdenes primero antes de eliminar el cliente.`,
                type: 'error',
                onConfirm: () => setConfirmModal(null),
                singleButton: true
            });
            return;
        }

        setConfirmModal({
            title: 'Eliminar Cliente',
            message: `¿Estás seguro de eliminar a ${client.full_name}?`,
            type: 'danger',
            onConfirm: () => confirmDelete(client.id)
        });
    };

    const confirmDelete = async (clientId) => {
        setDeletingClient(clientId);
        setConfirmModal(null);

        try {
            // Pequeño delay para mostrar la animación
            await new Promise(resolve => setTimeout(resolve, 300));
            await deleteClient(clientId);
        } catch (error) {
            // Mostrar error en modal en lugar de alert
            setConfirmModal({
                title: 'Error al Eliminar',
                message: error.message || 'No se pudo eliminar el cliente. Verifica que no tenga órdenes asociadas.',
                type: 'error',
                onConfirm: () => setConfirmModal(null),
                singleButton: true
            });
        } finally {
            setDeletingClient(null);
        }
    };

    if (loading) {
        return (
            <div className="loading-overlay" style={{ position: 'relative', minHeight: 400 }}>
                <div className="spinner spinner-lg"></div>
                <p>Cargando usuarios...</p>
            </div>
        );
    }

    return (
        <div className="admin-clients">
            {/* Header con búsqueda */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Clientes</h1>
                    <p className="page-subtitle">
                        {filteredClients.length} cliente{filteredClients.length !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>

            {/* Barra de búsqueda */}
            <div className="search-bar">
                <Search size={20} />
                <input
                    type="text"
                    placeholder="Buscar cliente por nombre, teléfono o email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Lista de clientes */}
            <div className="clients-grid">
                {filteredClients.map(client => (
                    <div
                        key={client.id}
                        className="client-card"
                        data-deleting={deletingClient === client.id ? "true" : "false"}
                    >
                        <div className="client-header">
                            <div className="client-avatar">
                                <User size={24} />
                            </div>
                            <div className="client-info">
                                <h3 className="client-name">{client.full_name}</h3>
                                <div className="client-contact">
                                    <Phone size={14} />
                                    {client.phone}
                                </div>
                                {client.email && (
                                    <div className="client-contact">
                                        <Mail size={14} />
                                        {client.email}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sección de motocicletas */}
                        {client.motorcycles && client.motorcycles.length > 0 && (
                            <div className="client-motos">
                                <h4><Bike size={14} /> Motocicletas ({client.motorcycles.length})</h4>
                                <div className="motos-list">
                                    {client.motorcycles.slice(0, 2).map(moto => (
                                        <div key={moto.id} className="moto-tag">
                                            {moto.brand} {moto.model}
                                        </div>
                                    ))}
                                    {client.motorcycles.length > 2 && (
                                        <div className="moto-tag more">
                                            +{client.motorcycles.length - 2} más
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Notas */}
                        {client.notes && (
                            <div className="client-notes">
                                {client.notes}
                            </div>
                        )}

                        {/* Acciones */}
                        <div className="client-actions">
                            {canEdit && (
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleOpenModal(client)}
                                >
                                    <Edit2 size={16} />
                                    Editar
                                </button>
                            )}
                            {canDelete && (
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleDelete(client)}
                                    disabled={deletingClient === client.id}
                                >
                                    <Trash2 size={16} />
                                    {deletingClient === client.id ? 'Eliminando...' : 'Eliminar'}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h3>
                            <button className="modal-close" onClick={handleCloseModal}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">
                                    Nombre completo <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.full_name}
                                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    Teléfono <span className="required">*</span>
                                </label>
                                <input
                                    type="tel"
                                    className="form-input"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notas</label>
                                <textarea
                                    className="form-input"
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    rows="3"
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={handleCloseModal}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                <Save size={18} />
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación */}
            {confirmModal && (
                <div className="modal-overlay confirm-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="modal modal-confirm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{confirmModal.title}</h3>
                        </div>
                        <div className="modal-body">
                            <p style={{ whiteSpace: 'pre-line' }}>{confirmModal.message}</p>
                            {confirmModal.showOrdersLink && (
                                <a
                                    href="/admin/orders"
                                    className="btn btn-secondary mt-md"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    Ver Órdenes →
                                </a>
                            )}
                        </div>
                        <div className="modal-footer">
                            {!confirmModal.singleButton && (
                                <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>
                                    Cancelar
                                </button>
                            )}
                            <button
                                className={`btn btn-${confirmModal.type || 'primary'}`}
                                onClick={confirmModal.onConfirm}
                            >
                                {confirmModal.singleButton ? 'Entendido' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }

                .search-bar {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    background: var(--bg-card);
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-radius: var(--radius-lg);
                    margin-bottom: var(--spacing-lg);
                    border: 1px solid var(--border-color);
                }

                .search-bar input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    font-size: 0.9375rem;
                    outline: none;
                }

                .clients-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: var(--spacing-lg);
                }

                .client-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                    box-shadow: var(--shadow-sm);
                    border: 1px solid var(--border-color);
                    transition: transform 0.2s, box-shadow 0.2s;
                }

                .client-card:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--shadow-md);
                }

                .client-header {
                    display: flex;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-md);
                    padding-bottom: var(--spacing-md);
                    border-bottom: 1px solid var(--border-light);
                }

                .client-avatar {
                    width: 48px;
                    height: 48px;
                    min-width: 48px;
                    background: var(--primary-light);
                    color: var(--primary);
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .client-info {
                    flex: 1;
                    min-width: 0;
                }

                .client-name {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0 0 4px 0;
                }

                .client-contact {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .client-motos {
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-light);
                }

                .client-motos h4 {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    margin-bottom: var(--spacing-sm);
                }

                .motos-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: var(--spacing-xs);
                }

                .moto-tag {
                    background: var(--bg-hover);
                    padding: 4px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .moto-tag.more {
                    background: var(--primary-light);
                    color: var(--primary);
                }

                .client-notes {
                    margin-top: var(--spacing-md);
                    font-size: 0.8125rem;
                    color: var(--text-muted);
                    font-style: italic;
                }

                .client-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-light);
                }

                @media (max-width: 640px) {
                    .clients-grid {
                        grid-template-columns: 1fr;
                    }
                }

                /* Animaciones */
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }

                @keyframes scaleIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }

                @keyframes slideOut {
                    from {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(-20px);
                    }
                }

                .modal-overlay {
                    animation: fadeIn 0.2s ease-out;
                }

                .modal {
                    animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .confirm-overlay {
                    backdrop-filter: blur(4px);
                    background: rgba(0, 0, 0, 0.5);
                }

                .modal-confirm {
                    max-width: 420px;
                }

                .client-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .client-card[data-deleting="true"] {
                    animation: slideOut 0.3s ease-out forwards;
                    pointer-events: none;
                }

                .btn {
                    transition: all 0.2s ease;
                }

                .btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
                }

                .btn:active:not(:disabled) {
                    transform: translateY(0);
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }

                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
