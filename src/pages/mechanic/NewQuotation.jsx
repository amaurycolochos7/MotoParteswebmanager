import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft, User, Bike, Plus, Trash2, FileText, Send } from 'lucide-react';

export default function NewQuotation() {
    const navigate = useNavigate();
    const { clients, motorcycles, services: availableServices, addQuotation } = useData();
    const { user, canManageQuotes } = useAuth();

    const [formData, setFormData] = useState({
        client_id: '',
        motorcycle_id: '',
        description: '',
        services: [],
        notes: ''
    });

    const [selectedClient, setSelectedClient] = useState(null);
    const [newService, setNewService] = useState({ name: '', price: 0 });

    const clientMotorcycles = selectedClient
        ? motorcycles.filter(m => m.client_id === selectedClient.id)
        : [];

    const handleClientChange = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        setSelectedClient(client);
        setFormData(prev => ({
            ...prev,
            client_id: clientId,
            motorcycle_id: ''
        }));
    };

    const handleAddService = () => {
        if (!newService.name.trim()) {
            alert('Ingresa el nombre del servicio');
            return;
        }

        setFormData(prev => ({
            ...prev,
            services: [...prev.services, { ...newService }]
        }));
        setNewService({ name: '', price: 0 });
    };

    const handleAddServiceFromCatalog = (service) => {
        setFormData(prev => ({
            ...prev,
            services: [...prev.services, { name: service.name, price: service.price }]
        }));
    };

    const handleRemoveService = (index) => {
        setFormData(prev => ({
            ...prev,
            services: prev.services.filter((_, i) => i !== index)
        }));
    };

    const calculateTotal = () => {
        return formData.services.reduce((sum, service) => sum + (parseFloat(service.price) || 0), 0);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!formData.client_id || !formData.motorcycle_id || formData.services.length === 0) {
            alert('Por favor completa todos los campos obligatorios y agrega al menos un servicio');
            return;
        }

        const quotationData = {
            ...formData,
            total_amount: calculateTotal(),
            created_by: user.id
        };

        const created = addQuotation(quotationData);

        if (created) {
            alert('✅ Cotización creada exitosamente');
            navigate('/mechanic/quotations');
        }
    };

    if (!canManageQuotes()) {
        return (
            <div className="page">
                <div className="empty-state">
                    <h2>Acceso Denegado</h2>
                    <p>No tienes permiso para crear cotizaciones</p>
                </div>
            </div>
        );
    }

    return (
        <div className="new-quotation-page">
            <div className="page-header">
                <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h1 className="page-title">
                        <FileText size={28} />
                        Nueva Cotización
                    </h1>
                    <p className="page-subtitle">Crea una cotización para enviar al cliente</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                {/* Client & Motorcycle */}
                <div className="card mb-lg">
                    <h3 className="section-title">Cliente y Motocicleta</h3>
                    <div className="form-grid">
                        <div className="form-group">
                            <label className="form-label">
                                <User size={16} />
                                Cliente *
                            </label>
                            <select
                                className="form-input"
                                value={formData.client_id}
                                onChange={e => handleClientChange(e.target.value)}
                                required
                            >
                                <option value="">Seleccionar cliente...</option>
                                {clients.map(client => (
                                    <option key={client.id} value={client.id}>
                                        {client.full_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">
                                <Bike size={16} />
                                Motocicleta *
                            </label>
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

                        <div className="form-group form-group-full">
                            <label className="form-label">Descripción del Trabajo</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Describe el trabajo a realizar..."
                                value={formData.description}
                                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                rows={3}
                            />
                        </div>
                    </div>
                </div>

                {/* Services from Catalog */}
                {availableServices && availableServices.length > 0 && (
                    <div className="card mb-lg">
                        <h3 className="section-title">Servicios del Catálogo</h3>
                        <div className="services-catalog">
                            {availableServices.map(service => (
                                <button
                                    key={service.id}
                                    type="button"
                                    className="catalog-service-btn"
                                    onClick={() => handleAddServiceFromCatalog(service)}
                                >
                                    <span>{service.name}</span>
                                    <strong>${service.price}</strong>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Add Custom Service */}
                <div className="card mb-lg">
                    <h3 className="section-title">Agregar Servicio Personalizado</h3>
                    <div className="add-service-form">
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Nombre del servicio..."
                            value={newService.name}
                            onChange={e => setNewService(prev => ({ ...prev, name: e.target.value }))}
                        />
                        <input
                            type="number"
                            className="form-input"
                            placeholder="Precio"
                            value={newService.price || ''}
                            onChange={e => setNewService(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                        />
                        <button type="button" className="btn btn-secondary" onClick={handleAddService}>
                            <Plus size={18} />
                            Agregar
                        </button>
                    </div>
                </div>

                {/* Services List */}
                <div className="card mb-lg">
                    <h3 className="section-title">Servicios Incluidos ({formData.services.length})</h3>

                    {formData.services.length === 0 ? (
                        <p className="empty-message">No has agregado servicios aún</p>
                    ) : (
                        <div className="services-list">
                            {formData.services.map((service, index) => (
                                <div key={index} className="service-item">
                                    <div className="service-info">
                                        <span className="service-name">{service.name}</span>
                                        <span className="service-price">${service.price.toLocaleString('es-MX')}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-icon-danger"
                                        onClick={() => handleRemoveService(index)}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}

                            <div className="total-section">
                                <strong>Total:</strong>
                                <strong className="total-amount">${calculateTotal().toLocaleString('es-MX')}</strong>
                            </div>
                        </div>
                    )}
                </div>

                {/* Notes */}
                <div className="card mb-lg">
                    <h3 className="section-title">Notas Adicionales</h3>
                    <textarea
                        className="form-textarea"
                        placeholder="Información adicional para el cliente..."
                        value={formData.notes}
                        onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        rows={3}
                    />
                </div>

                {/* Actions */}
                <div className="form-actions">
                    <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>
                        Cancelar
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={formData.services.length === 0}>
                        <FileText size={18} />
                        Crear Cotización
                    </button>
                </div>
            </form>

            <style>{`
                .new-quotation-page {
                    padding-bottom: 80px;
                }

                .page-header {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
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

                .section-title {
                    font-size: 1rem;
                    font-weight: 600;
                    margin-bottom: var(--spacing-md);
                }

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

                .services-catalog {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: var(--spacing-sm);
                }

                .catalog-service-btn {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    border: 2px solid var(--border-color);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    font-size: 0.875rem;
                }

                .catalog-service-btn:hover {
                    border-color: var(--primary);
                    background: var(--primary-light);
                }

                .catalog-service-btn strong {
                    color: var(--primary);
                }

                .add-service-form {
                    display: grid;
                    grid-template-columns: 1fr auto auto;
                    gap: var(--spacing-sm);
                }

                .services-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-sm);
                }

                .service-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-md);
                    background: var(--bg-secondary);
                    border-radius: var(--radius-md);
                }

                .service-info {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex: 1;
                    gap: var(--spacing-md);
                }

                .service-name {
                    font-weight: 500;
                }

                .service-price {
                    color: var(--primary);
                    font-weight: 600;
                }

                .btn-icon-danger {
                    width: 32px;
                    height: 32px;
                    border-radius: var(--radius-md);
                    border: none;
                    background: transparent;
                    color: var(--danger);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .btn-icon-danger:hover {
                    background: rgba(239, 68, 68, 0.1);
                }

                .total-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-lg) var(--spacing-md);
                    background: var(--primary-light);
                    border-radius: var(--radius-md);
                    margin-top: var(--spacing-md);
                }

                .total-amount {
                    font-size: 1.5rem;
                    color: var(--primary);
                }

                .empty-message {
                    text-align: center;
                    color: var(--text-secondary);
                    padding: var(--spacing-xl);
                }

                .form-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: var(--spacing-md);
                }

                @media (max-width: 640px) {
                    .form-grid {
                        grid-template-columns: 1fr;
                    }

                    .add-service-form {
                        grid-template-columns: 1fr;
                    }

                    .services-catalog {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
}
