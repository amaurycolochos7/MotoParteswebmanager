import { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import {
    Plus,
    Edit2,
    Trash2,
    X,
    Wrench,
    Tag,
    DollarSign,
    Palette,
    Save,
    AlertCircle
} from 'lucide-react';

export default function AdminSettings() {
    const dataContext = useData();

    // Defensive checks
    if (!dataContext) {
        return (
            <div className="error-message">
                <h2>Error: Contexto de datos no disponible</h2>
                <p>Por favor, recarga la página.</p>
            </div>
        );
    }

    const { statuses = [], services = [], addService, updateService, deleteService } = dataContext;

    const [activeTab, setActiveTab] = useState('services'); // 'services' or 'statuses'
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [serviceToDelete, setServiceToDelete] = useState(null);
    const [editingService, setEditingService] = useState(null);
    const [serviceForm, setServiceForm] = useState({
        name: '',
        description: '',
        price: '',
        category: 'general'
    });

    const categories = [
        { id: 'general', name: 'General' },
        { id: 'mantenimiento', name: 'Mantenimiento' },
        { id: 'reparacion', name: 'Reparación' },
        { id: 'electrico', name: 'Eléctrico' },
        { id: 'motor', name: 'Motor' },
        { id: 'suspension', name: 'Suspensión' },
        { id: 'frenos', name: 'Frenos' },
        { id: 'otros', name: 'Otros' }
    ];

    const openAddServiceModal = () => {
        setEditingService(null);
        setServiceForm({ name: '', description: '', price: '', category: 'general' });
        setShowServiceModal(true);
    };

    const openEditServiceModal = (service) => {
        setEditingService(service);
        setServiceForm({
            name: service.name,
            description: service.description || '',
            price: service.price.toString(),
            category: service.category || 'general'
        });
        setShowServiceModal(true);
    };

    const handleSaveService = () => {
        if (!serviceForm.name.trim()) {
            alert('El nombre del servicio es obligatorio');
            return;
        }

        if (!serviceForm.price || parseFloat(serviceForm.price) < 0) {
            alert('Ingresa un precio válido');
            return;
        }

        const serviceData = {
            name: serviceForm.name.trim(),
            description: serviceForm.description.trim(),
            price: parseFloat(serviceForm.price),
            category: serviceForm.category
        };

        if (editingService) {
            updateService(editingService.id, serviceData);
        } else {
            addService(serviceData);
        }

        setShowServiceModal(false);
        setServiceForm({ name: '', description: '', price: '', category: 'general' });
    };

    const handleDeleteService = (service) => {
        setServiceToDelete(service);
        setShowDeleteModal(true);
    };

    const confirmDelete = () => {
        if (serviceToDelete) {
            deleteService(serviceToDelete.id);
            setShowDeleteModal(false);
            setServiceToDelete(null);
        }
    };

    const cancelDelete = () => {
        setShowDeleteModal(false);
        setServiceToDelete(null);
    };

    // Safety check for services
    const safeServices = Array.isArray(services) ? services : [];

    // Group services by category
    const servicesByCategory = useMemo(() => {
        return safeServices.reduce((acc, service) => {
            const cat = service.category || 'general';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(service);
            return acc;
        }, {});
    }, [safeServices]);

    return (
        <div className="admin-settings-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Configuración</h1>
                    <p className="page-subtitle">Personaliza servicios y ajustes del taller</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="settings-tabs">
                <button
                    className={`tab-button ${activeTab === 'services' ? 'active' : ''}`}
                    onClick={() => setActiveTab('services')}
                >
                    <Wrench size={18} />
                    Servicios
                </button>
                <button
                    className={`tab-button ${activeTab === 'statuses' ? 'active' : ''}`}
                    onClick={() => setActiveTab('statuses')}
                >
                    <Tag size={18} />
                    Estados
                </button>
            </div>

            {/* Services Tab */}
            {activeTab === 'services' && (
                <div className="settings-content">
                    <div className="content-header">
                        <h2 className="content-title">
                            <Wrench size={20} />
                            Catálogo de Servicios
                        </h2>
                        <button className="btn btn-primary" onClick={openAddServiceModal}>
                            <Plus size={18} />
                            Nuevo Servicio
                        </button>
                    </div>

                    <div className="info-banner">
                        <AlertCircle size={18} />
                        <div>
                            <strong>Los mecánicos pueden:</strong>
                            <ul>
                                <li>Usar estos servicios predefinidos al crear órdenes</li>
                                <li>Agregar servicios personalizados sobre la marcha</li>
                                <li>Modificar precios por orden según el caso</li>
                            </ul>
                        </div>
                    </div>

                    {services.length === 0 ? (
                        <div className="empty-state card">
                            <Wrench size={48} style={{ opacity: 0.3 }} />
                            <p>No hay servicios configurados</p>
                            <button className="btn btn-primary" onClick={openAddServiceModal}>
                                <Plus size={18} />
                                Agregar Primer Servicio
                            </button>
                        </div>
                    ) : (
                        <div className="categories-list">
                            {categories.map(category => {
                                const categoryServices = servicesByCategory[category.id] || [];
                                if (categoryServices.length === 0) return null;

                                return (
                                    <div key={category.id} className="category-section">
                                        <h3 className="category-title">
                                            <Tag size={16} />
                                            {category.name}
                                            <span className="category-count">({categoryServices.length})</span>
                                        </h3>
                                        <div className="services-grid">
                                            {categoryServices.map((service, index) => (
                                                <div
                                                    key={service.id}
                                                    className="service-card card"
                                                    style={{ animationDelay: `${index * 0.05}s` }}
                                                >
                                                    <div
                                                        className="service-content"
                                                        onClick={() => openEditServiceModal(service)}
                                                    >
                                                        <div className="service-header">
                                                            <div className="service-name">{service.name}</div>
                                                            <div className="service-price">
                                                                ${(service.price || 0).toLocaleString('es-MX')}
                                                            </div>
                                                        </div>
                                                        {service.description && (
                                                            <div className="service-description">
                                                                {service.description}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="service-actions">
                                                        <button
                                                            className="btn-delete-service"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteService(service);
                                                            }}
                                                            title="Eliminar servicio"
                                                        >
                                                            <Trash2 size={18} />
                                                            <span>Eliminar</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Statuses Tab */}
            {activeTab === 'statuses' && (
                <div className="settings-content">
                    <div className="content-header">
                        <h2 className="content-title">
                            <Tag size={20} />
                            Estados de Órdenes
                        </h2>
                    </div>

                    <div className="info-banner">
                        <AlertCircle size={18} />
                        <div>
                            <strong>Estados del sistema:</strong> Los estados controlan el flujo de trabajo de las órdenes.
                            La personalización de estados estará disponible próximamente.
                        </div>
                    </div>

                    <div className="statuses-list">
                        {statuses.map((status, index) => (
                            <div key={status.id} className="status-card card">
                                <div className="status-order">#{index + 1}</div>
                                <div className="status-info">
                                    <div className="status-name">{status.name}</div>
                                    <div className="status-description">{status.description || 'Estado del sistema'}</div>
                                </div>
                                <div
                                    className="status-color-badge"
                                    style={{ background: status.color }}
                                >
                                    <Palette size={16} style={{ color: 'white' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Service Modal */}
            {showServiceModal && (
                <div className="modal-overlay" onClick={() => setShowServiceModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowServiceModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">
                                    Nombre del Servicio <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Ej: Cambio de aceite"
                                    value={serviceForm.name}
                                    onChange={e => setServiceForm(prev => ({ ...prev, name: e.target.value }))}
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Categoría</label>
                                <select
                                    className="form-input"
                                    value={serviceForm.category}
                                    onChange={e => setServiceForm(prev => ({ ...prev, category: e.target.value }))}
                                >
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">
                                    Precio Base <span className="required">*</span>
                                </label>
                                <div className="input-with-icon">
                                    <DollarSign className="input-icon" size={20} />
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="0.00"
                                        min="0"
                                        step="0.01"
                                        value={serviceForm.price}
                                        onChange={e => setServiceForm(prev => ({ ...prev, price: e.target.value }))}
                                    />
                                </div>
                                <p className="form-hint">
                                    Los mecánicos pueden ajustar este precio al agregar el servicio a una orden
                                </p>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Descripción (opcional)</label>
                                <textarea
                                    className="form-textarea"
                                    placeholder="Incluye filtro y repuestos..."
                                    rows="3"
                                    value={serviceForm.description}
                                    onChange={e => setServiceForm(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowServiceModal(false)}>
                                Cancelar
                            </button>
                            <button className="btn btn-primary" onClick={handleSaveService}>
                                <Save size={18} />
                                {editingService ? 'Guardar Cambios' : 'Crear Servicio'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="modal-overlay delete-modal-overlay" onClick={cancelDelete}>
                    <div className="modal delete-modal" onClick={e => e.stopPropagation()}>
                        <div className="delete-modal-icon">
                            <Trash2 size={40} />
                        </div>
                        <div className="delete-modal-content">
                            <h3 className="delete-modal-title">¿Eliminar Servicio?</h3>
                            <p className="delete-modal-message">
                                ¿Estás seguro de que deseas eliminar el servicio{' '}
                                <strong>"{serviceToDelete?.name}"</strong>?
                            </p>
                            <p className="delete-modal-warning">
                                Esta acción no se puede deshacer.
                            </p>
                        </div>
                        <div className="delete-modal-actions">
                            <button className="btn btn-outline" onClick={cancelDelete}>
                                Cancelar
                            </button>
                            <button className="btn btn-danger" onClick={confirmDelete}>
                                <Trash2 size={18} />
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .admin-settings-page {
                    padding-bottom: 80px;
                }

                .page-header {
                    margin-bottom: var(--spacing-lg);
                }

                .settings-tabs {
                    display: flex;
                    gap: var(--spacing-sm);
                    margin-bottom: var(--spacing-xl);
                    border-bottom: 2px solid var(--border-color);
                }

                .tab-button {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: transparent;
                    border: none;
                    border-bottom: 3px solid transparent;
                    color: var(--text-secondary);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    margin-bottom: -2px;
                }

                .tab-button:hover {
                    color: var(--primary);
                }

                .tab-button.active {
                    color: var(--primary);
                    border-bottom-color: var(--primary);
                }

                .settings-content {
                    animation: fadeIn 0.2s ease;
                }

                .content-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-lg);
                }

                .content-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1.25rem;
                    font-weight: 600;
                }

                .info-banner {
                    display: flex;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                    background: rgba(59, 130, 246, 0.1);
                    border: 1px solid rgba(59, 130, 246, 0.3);
                    border-radius: var(--radius-lg);
                    margin-bottom: var(--spacing-xl);
                    color: var(--text-primary);
                }

                .info-banner strong {
                    display: block;
                    margin-bottom: 4px;
                }

                .info-banner ul {
                    margin: 4px 0 0 20px;
                    font-size: 0.875rem;
                }

                .info-banner li {
                    margin-bottom: 2px;
                }

                .categories-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xl);
                }

                .category-section {
                    animation: slideUp 0.3s ease;
                }

                .category-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-md);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .category-count {
                    font-size: 0.875rem;
                    color: var(--text-muted);
                    font-weight: 500;
                }

                .services-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: var(--spacing-lg);
                }

                .service-card {
                    position: relative;
                    padding: 0;
                    overflow: hidden;
                    cursor: default;
                    transition: all 0.3s ease;
                    background: var(--bg-primary);
                    border: 2px solid var(--border-color);
                    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
                }

                @keyframes slideUp {
                    from {
                        transform: translateY(40px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                .service-card:hover {
                    border-color: var(--primary);
                    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.25);
                }

                .service-content {
                    padding: var(--spacing-lg);
                    cursor: pointer;
                    transition: background 0.2s ease;
                }

                .service-content:hover {
                    background: rgba(59, 130, 246, 0.03);
                }

                .service-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-sm);
                }

                .service-name {
                    font-weight: 600;
                    font-size: 1.125rem;
                    flex: 1;
                    line-height: 1.4;
                    color: var(--text-primary);
                    transition: color 0.2s ease;
                }

                .service-content:hover .service-name {
                    color: var(--primary);
                }

                .service-price {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--primary);
                    white-space: nowrap;
                    margin-left: var(--spacing-md);
                }

                .service-description {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                    margin-top: var(--spacing-md);
                    line-height: 1.6;
                }

                .service-actions {
                    display: flex;
                    justify-content: flex-end;
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-secondary);
                    border-top: 1px solid var(--border-color);
                }

                .btn-delete-service {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                    border: none;
                    border-radius: var(--radius-md);
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-delete-service:hover {
                    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);
                }

                .btn-delete-service:active {
                    transform: translateY(0);
                }

                .statuses-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .status-card {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-md);
                }

                .status-order {
                    width: 32px;
                    height: 32px;
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                    flex-shrink: 0;
                }

                .status-info {
                    flex: 1;
                }

                .status-name {
                    font-weight: 600;
                    font-size: 0.9375rem;
                    margin-bottom: 2px;
                }

                .status-description {
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .status-color-badge {
                    width: 40px;
                    height: 40px;
                    border-radius: var(--radius-md);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-2xl);
                    text-align: center;
                }

                .empty-state p {
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-md);
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Delete Modal Styles */
                .delete-modal-overlay {
                    animation: fadeInOverlay 0.25s ease;
                }

                @keyframes fadeInOverlay {
                    from {
                        opacity: 0;
                        backdrop-filter: blur(0px);
                    }
                    to {
                        opacity: 1;
                        backdrop-filter: blur(4px);
                    }
                }

                .delete-modal {
                    max-width: 450px;
                    padding: 0;
                    animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                @keyframes scaleIn {
                    from {
                        opacity: 0;
                        transform: scale(0.8) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }

                .delete-modal-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: var(--spacing-2xl) var(--spacing-xl) var(--spacing-lg);
                    background: linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%);
                    color: #ef4444;
                    animation: iconPulse 0.6s ease;
                }

                @keyframes iconPulse {
                    0%, 100% {
                        transform: scale(1);
                    }
                    25% {
                        transform: scale(0.9);
                    }
                    50% {
                        transform: scale(1.1);
                    }
                    75% {
                        transform: scale(0.95);
                    }
                }

                .delete-modal-content {
                    padding: var(--spacing-lg) var(--spacing-xl);
                    text-align: center;
                }

                .delete-modal-title {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: var(--spacing-md);
                }

                .delete-modal-message {
                    font-size: 1rem;
                    color: var(--text-secondary);
                    line-height: 1.6;
                    margin-bottom: var(--spacing-md);
                }

                .delete-modal-message strong {
                    color: var(--text-primary);
                    font-weight: 600;
                }

                .delete-modal-warning {
                    font-size: 0.875rem;
                    color: #ef4444;
                    font-weight: 500;
                }

                .delete-modal-actions {
                    display: flex;
                    gap: var(--spacing-md);
                    padding: var(--spacing-lg) var(--spacing-xl);
                    background: var(--bg-secondary);
                    border-top: 1px solid var(--border-color);
                }

                .delete-modal-actions .btn {
                    flex: 1;
                    justify-content: center;
                }

                .btn-danger {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                    border: none;
                    border-radius: var(--radius-md);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .btn-danger:hover {
                    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
                    transform: translateY(-2px);
                    box-shadow: 0 8px 16px rgba(239, 68, 68, 0.3);
                }

                .btn-danger:active {
                    transform: translateY(0);
                }
            `}</style>
        </div>
    );
}

