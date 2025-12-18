import { useState } from 'react';
import { useData } from '../../context/DataContext';
import {
    Plus,
    Edit2,
    Trash2,
    Settings,
    DollarSign,
    Tag,
    X,
    Save,
    Check
} from 'lucide-react';

export default function AdminServices() {
    const { services, addService, updateService, deleteService, loading } = useData();
    const [showModal, setShowModal] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        labor_cost: '',
        materials_cost: '',
        category: 'general',
        description: ''
    });
    const [confirmDelete, setConfirmDelete] = useState(null);

    const categories = [
        { value: 'mantenimiento', label: 'Mantenimiento' },
        { value: 'motor', label: 'Motor' },
        { value: 'frenos', label: 'Frenos' },
        { value: 'suspension', label: 'Suspensión' },
        { value: 'electrico', label: 'Eléctrico' },
        { value: 'estetico', label: 'Estético' },
        { value: 'general', label: 'General' }
    ];

    const handleOpenModal = (service = null) => {
        if (service) {
            setEditingService(service);
            setFormData({
                name: service.name || '',
                labor_cost: service.labor_cost || '',
                materials_cost: service.materials_cost || '',
                category: service.category || 'general',
                description: service.description || ''
            });
        } else {
            setEditingService(null);
            setFormData({ name: '', labor_cost: '', materials_cost: '', category: 'general', description: '' });
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingService(null);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            alert('El nombre del servicio es requerido');
            return;
        }

        const laborCost = parseFloat(formData.labor_cost) || 0;
        const materialsCost = parseFloat(formData.materials_cost) || 0;

        try {
            const serviceData = {
                name: formData.name,
                labor_cost: laborCost,
                materials_cost: materialsCost,
                base_price: laborCost + materialsCost, // Auto-calculated
                category: formData.category,
                description: formData.description
            };

            if (editingService) {
                await updateService(editingService.id, serviceData);
            } else {
                await addService(serviceData);
            }
            handleCloseModal();
        } catch (error) {
            alert('Error al guardar: ' + error.message);
        }
    };

    const handleDelete = (service) => {
        setConfirmDelete(service);
    };

    const confirmDeleteService = async () => {
        if (!confirmDelete) return;
        try {
            await deleteService(confirmDelete.id);
            setConfirmDelete(null);
        } catch (error) {
            alert('Error al eliminar: ' + error.message);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0
        }).format(amount || 0);
    };

    const getCategoryLabel = (value) => {
        return categories.find(c => c.value === value)?.label || value;
    };

    if (loading) {
        return (
            <div className="loading-overlay" style={{ position: 'relative', minHeight: 400 }}>
                <div className="spinner spinner-lg"></div>
                <p>Cargando servicios...</p>
            </div>
        );
    }

    return (
        <div className="admin-services">
            {/* Header */}
            <div className="page-header flex justify-between items-center">
                <div>
                    <h1 className="page-title">Catálogo de Servicios</h1>
                    <p className="page-subtitle">
                        {services.length} servicios disponibles
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                    <Plus size={20} />
                    Nuevo Servicio
                </button>
            </div>

            {/* Lista de servicios */}
            {services.length === 0 ? (
                <div className="card">
                    <div className="card-body">
                        <div className="empty-state">
                            <Settings size={48} className="empty-state-icon" />
                            <p className="empty-state-title">No hay servicios</p>
                            <p className="empty-state-message">
                                Crea tu primer servicio para comenzar
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="services-grid">
                    {services.map(service => (
                        <div key={service.id} className="service-card">
                            <div className="service-header">
                                <span className="category-tag">
                                    <Tag size={12} />
                                    {getCategoryLabel(service.category)}
                                </span>
                                <div className="service-actions">
                                    <button
                                        className="action-btn action-edit"
                                        onClick={() => handleOpenModal(service)}
                                        title="Editar servicio"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        className="action-btn action-delete"
                                        onClick={() => handleDelete(service)}
                                        title="Eliminar servicio"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <h3 className="service-name">{service.name}</h3>
                            {service.description && (
                                <p className="service-description">{service.description}</p>
                            )}

                            {/* Price Breakdown */}
                            <div className="service-price-breakdown">
                                <div className="breakdown-row">
                                    <span>🔧 Mano de Obra:</span>
                                    <span>{formatCurrency(service.labor_cost || 0)}</span>
                                </div>
                                <div className="breakdown-row">
                                    <span>📦 Materiales:</span>
                                    <span>{formatCurrency(service.materials_cost || 0)}</span>
                                </div>
                                <div className="breakdown-total">
                                    <span>Total:</span>
                                    <strong>{formatCurrency(service.base_price)}</strong>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
                            </h3>
                            <button className="modal-close" onClick={handleCloseModal}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">
                                    Nombre del servicio <span className="required">*</span>
                                </label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej: Cambio de aceite"
                                />
                            </div>

                            {/* Desglose de Precios */}
                            <div className="price-breakdown-section">
                                <label className="form-label section-label">💰 Desglose de Precio</label>
                                <div className="price-grid">
                                    <div className="form-group">
                                        <label className="form-label">Mano de Obra (MXN)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.labor_cost}
                                            onChange={(e) => setFormData({ ...formData, labor_cost: e.target.value })}
                                            placeholder="0"
                                            min="0"
                                        />
                                        <small className="form-hint">Trabajo del mecánico</small>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Materiales (MXN)</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            value={formData.materials_cost}
                                            onChange={(e) => setFormData({ ...formData, materials_cost: e.target.value })}
                                            placeholder="0"
                                            min="0"
                                        />
                                        <small className="form-hint">Insumos/refacciones</small>
                                    </div>
                                </div>
                                <div className="price-total-row">
                                    <span>Precio Total:</span>
                                    <strong>{formatCurrency((parseFloat(formData.labor_cost) || 0) + (parseFloat(formData.materials_cost) || 0))}</strong>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Categoría</label>
                                <select
                                    className="form-select"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                >
                                    {categories.map(cat => (
                                        <option key={cat.value} value={cat.value}>
                                            {cat.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Descripción</label>
                                <textarea
                                    className="form-textarea"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Descripción opcional del servicio..."
                                    rows={3}
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

            {/* Modal de Confirmación para Eliminar */}
            {confirmDelete && (
                <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Eliminar Servicio</h3>
                        </div>
                        <div className="modal-body">
                            <p>¿Estás seguro de eliminar el servicio <strong>{confirmDelete.name}</strong>?</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                                Cancelar
                            </button>
                            <button className="btn btn-danger" onClick={confirmDeleteService}>
                                <Trash2 size={18} />
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .services-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                    gap: var(--spacing-lg);
                }

                .service-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-lg);
                }

                .service-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-sm);
                }

                .category-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 8px;
                    background: var(--bg-hover);
                    border-radius: var(--radius-sm);
                    font-size: 0.6875rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    color: var(--text-muted);
                }

                .service-actions {
                    display: flex;
                    gap: 4px;
                }

                .service-name {
                    font-size: 1rem;
                    font-weight: 600;
                    margin: 0 0 var(--spacing-xs) 0;
                }

                .service-description {
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-md);
                }

                .service-price {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--primary);
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-light);
                }

                .action-btn {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: var(--radius-md);
                    border: none;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .action-edit {
                    background: #e0f2fe;
                    color: #0284c7;
                }

                .action-edit:hover {
                    background: #0284c7;
                    color: white;
                }

                .action-delete {
                    background: #fee2e2;
                    color: #dc2626;
                }

                .action-delete:hover {
                    background: #dc2626;
                    color: white;
                }

                .service-price-breakdown {
                    margin-top: var(--spacing-md);
                    padding-top: var(--spacing-md);
                    border-top: 1px solid var(--border-light);
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .breakdown-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .breakdown-total {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 4px;
                    padding-top: 4px;
                    border-top: 1px dashed var(--border-light);
                    font-size: 0.9375rem;
                    color: var(--primary);
                }

                /* Modal Styles */
                .price-breakdown-section {
                    background: var(--bg-hover);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                    border: 1px solid var(--border-light);
                }

                .section-label {
                    margin-bottom: var(--spacing-md);
                    color: var(--text-primary);
                    font-weight: 600;
                }

                .price-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-sm);
                }

                .price-total-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: var(--spacing-sm);
                    border-top: 1px solid var(--border-color);
                    font-size: 1.1rem;
                }

                .form-hint {
                    display: block;
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin-top: 4px;
                }

                @media (max-width: 480px) {
                    .services-grid {
                        grid-template-columns: 1fr;
                    }
                    .price-grid {
                        grid-template-columns: 1fr;
                    }
                }

                /* Delete modal */
                .modal-sm {
                    max-width: 420px;
                }

                .warning-text {
                    color: var(--danger);
                    font-size: 0.875rem;
                    margin-top: 0.5rem;
                }
            `}</style>
        </div>
    );
}
