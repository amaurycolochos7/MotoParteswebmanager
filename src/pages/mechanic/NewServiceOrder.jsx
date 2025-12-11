import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Search,
    Plus,
    Camera,
    X,
    User,
    Phone,
    Mail,
    FileText,
    Bike,
    Wrench,
    DollarSign,
    CreditCard,
    Banknote,
    Smartphone
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

const STEPS = [
    { id: 1, title: 'Cliente', icon: User },
    { id: 2, title: 'Moto', icon: Bike },
    { id: 3, title: 'Servicios', icon: Wrench },
    { id: 4, title: 'Estado', icon: Camera },
    { id: 5, title: 'Pago', icon: DollarSign },
];

const PAYMENT_METHODS = [
    { id: 'cash', label: 'Efectivo', icon: Banknote },
    { id: 'card', label: 'Tarjeta', icon: CreditCard },
    { id: 'transfer', label: 'Transferencia', icon: Smartphone },
];

export default function NewServiceOrder() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const {
        findClientByPhone,
        addClient,
        getClientMotorcycles,
        addMotorcycle,
        services,
        addOrder
    } = useData();

    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        // Client
        clientPhone: '',
        clientName: '',
        clientEmail: '',
        clientNotes: '',
        selectedClient: null,
        isNewClient: false,

        // Motorcycle
        selectedMoto: null,
        isNewMoto: false,
        motoData: {
            brand: '',
            model: '',
            year: '',
            plates: '',
            color: '',
            mileage: '',
            notes: '',
        },

        // Services
        selectedServices: [],
        customService: '',
        customerComplaint: '',

        // Photos
        photos: [],
        damageChecks: {
            scratches: false,
            brokenPlastics: false,
            missingParts: false,
        },

        // Payment
        hasAdvance: false,
        advanceAmount: '',
        paymentMethod: 'cash',
    });

    const [clientMotos, setClientMotos] = useState([]);
    const [searchPerformed, setSearchPerformed] = useState(false);

    // Search client by phone
    const handlePhoneSearch = () => {
        if (formData.clientPhone.length < 10) return;

        const client = findClientByPhone(formData.clientPhone);
        setSearchPerformed(true);

        if (client) {
            setFormData(prev => ({
                ...prev,
                selectedClient: client,
                clientName: client.full_name,
                clientEmail: client.email || '',
                clientNotes: client.notes || '',
                isNewClient: false,
            }));
            const motos = getClientMotorcycles(client.id);
            setClientMotos(motos);
        } else {
            setFormData(prev => ({
                ...prev,
                selectedClient: null,
                isNewClient: true,
            }));
            setClientMotos([]);
        }
    };

    // Toggle service selection
    const toggleService = (serviceId) => {
        setFormData(prev => ({
            ...prev,
            selectedServices: prev.selectedServices.includes(serviceId)
                ? prev.selectedServices.filter(id => id !== serviceId)
                : [...prev.selectedServices, serviceId],
        }));
    };

    // Handle photo capture
    const handlePhotoCapture = async (e) => {
        const files = Array.from(e.target.files);

        for (const file of files) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setFormData(prev => ({
                    ...prev,
                    photos: [...prev.photos, {
                        id: Date.now() + Math.random(),
                        dataUrl: event.target.result,
                        file: file,
                    }],
                }));
            };
            reader.readAsDataURL(file);
        }
    };

    // Remove photo
    const removePhoto = (photoId) => {
        setFormData(prev => ({
            ...prev,
            photos: prev.photos.filter(p => p.id !== photoId),
        }));
    };

    // Submit order
    const handleSubmit = async () => {
        setLoading(true);

        try {
            // Create client if new
            let clientId = formData.selectedClient?.id;
            if (formData.isNewClient) {
                const newClient = addClient({
                    phone: formData.clientPhone,
                    full_name: formData.clientName,
                    email: formData.clientEmail,
                    notes: formData.clientNotes,
                });
                clientId = newClient.id;
            }

            // Create motorcycle if new
            let motoId = formData.selectedMoto?.id;
            if (formData.isNewMoto) {
                const newMoto = addMotorcycle({
                    client_id: clientId,
                    ...formData.motoData,
                    year: parseInt(formData.motoData.year) || null,
                    mileage: parseInt(formData.motoData.mileage) || null,
                });
                motoId = newMoto.id;
            }

            // Create order
            const orderServices = formData.selectedServices.map(svcId => {
                const svc = services.find(s => s.id === svcId);
                return {
                    service_id: svcId,
                    name: svc?.name,
                    price: svc?.default_price || 0,
                };
            });

            if (formData.customService.trim()) {
                orderServices.push({
                    service_id: null,
                    name: formData.customService.trim(),
                    price: 0,
                    is_custom: true,
                });
            }

            // For demo, photos are stored as data URLs (in production, upload to Google Drive)
            const photoUrls = formData.photos.map(p => ({
                url: p.dataUrl,
                uploaded_at: new Date().toISOString(),
            }));

            // Calculate total amount from services
            const totalAmount = orderServices.reduce((sum, svc) => sum + (svc.price || 0), 0);

            const order = addOrder({
                client_id: clientId,
                motorcycle_id: motoId,
                mechanic_id: user.id,
                mechanic_name: user.full_name,
                services: orderServices,
                custom_service: formData.customService,
                customer_complaint: formData.customerComplaint,
                photos: photoUrls,
                damage_checks: formData.damageChecks,
                has_advance: formData.hasAdvance,
                advance_payment: formData.hasAdvance ? parseFloat(formData.advanceAmount) || 0 : 0,
                payment_method: formData.hasAdvance ? formData.paymentMethod : null,
                total_amount: totalAmount,
            });

            navigate(`/mechanic/order/${order.id}`);
        } catch (error) {
            console.error('Error creating order:', error);
            alert('Error al crear la orden');
        } finally {
            setLoading(false);
        }
    };

    // Navigation
    const canProceed = () => {
        switch (currentStep) {
            case 1:
                return formData.selectedClient || (formData.isNewClient && formData.clientName.trim());
            case 2:
                return formData.selectedMoto || (formData.isNewMoto && formData.motoData.brand && formData.motoData.model);
            case 3:
                return formData.selectedServices.length > 0 || formData.customService.trim();
            case 4:
                return true; // Photos are optional
            case 5:
                return !formData.hasAdvance || (formData.advanceAmount && parseFloat(formData.advanceAmount) > 0);
            default:
                return true;
        }
    };

    const nextStep = () => {
        if (currentStep < 5 && canProceed()) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
        }
    };

    return (
        <div className="new-order">
            {/* Header */}
            <div className="new-order-header">
                <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}>
                    <ArrowLeft size={24} />
                </button>
                <h1>Nueva Orden de Servicio</h1>
            </div>

            {/* Progress Steps */}
            <div className="wizard-steps">
                {STEPS.map((step) => (
                    <div
                        key={step.id}
                        className={`wizard-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
                    />
                ))}
            </div>

            {/* Step Title */}
            <div className="step-header">
                <div className="step-number">{currentStep}</div>
                <div>
                    <h2 className="step-title">{STEPS[currentStep - 1].title}</h2>
                    <p className="step-subtitle">
                        {currentStep === 1 && 'Busca o registra al cliente'}
                        {currentStep === 2 && 'Selecciona o registra la moto'}
                        {currentStep === 3 && 'Servicios a realizar'}
                        {currentStep === 4 && 'Documenta el estado de la moto'}
                        {currentStep === 5 && 'Información de pago'}
                    </p>
                </div>
            </div>

            {/* Step Content */}
            <div className="step-content">
                {/* Step 1: Client */}
                {currentStep === 1 && (
                    <div className="step-client">
                        <div className="form-group">
                            <label className="form-label">Número de Teléfono</label>
                            <div className="search-input-wrapper">
                                <input
                                    type="tel"
                                    className="form-input"
                                    placeholder="10 dígitos"
                                    value={formData.clientPhone}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        clientPhone: e.target.value.replace(/\D/g, '').slice(0, 10),
                                        selectedClient: null,
                                        isNewClient: false,
                                    }))}
                                    maxLength={10}
                                />
                                <button
                                    className="btn btn-primary search-btn"
                                    onClick={handlePhoneSearch}
                                    disabled={formData.clientPhone.length < 10}
                                >
                                    <Search size={20} />
                                </button>
                            </div>
                        </div>

                        {searchPerformed && formData.selectedClient && (
                            <div className="client-found card">
                                <div className="client-found-header">
                                    <Check size={20} className="text-primary" />
                                    <span>Cliente encontrado</span>
                                </div>
                                <div className="client-info">
                                    <strong>{formData.selectedClient.full_name}</strong>
                                    <span>{formData.selectedClient.phone}</span>
                                    {formData.selectedClient.notes && (
                                        <span className="text-secondary">{formData.selectedClient.notes}</span>
                                    )}
                                </div>
                                {clientMotos.length > 0 && (
                                    <div className="client-motos-count">
                                        {clientMotos.length} moto(s) registrada(s)
                                    </div>
                                )}
                            </div>
                        )}

                        {searchPerformed && formData.isNewClient && (
                            <div className="new-client-form">
                                <div className="new-client-badge">
                                    <Plus size={16} />
                                    Nuevo Cliente
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Nombre Completo *</label>
                                    <div className="input-with-icon">
                                        <User className="input-icon" size={20} />
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Nombre del cliente"
                                            value={formData.clientName}
                                            onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Correo Electrónico (opcional)</label>
                                    <div className="input-with-icon">
                                        <Mail className="input-icon" size={20} />
                                        <input
                                            type="email"
                                            className="form-input"
                                            placeholder="email@ejemplo.com"
                                            value={formData.clientEmail}
                                            onChange={(e) => setFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Notas (opcional)</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Ej: cliente frecuente, prefiere pago con tarjeta..."
                                        value={formData.clientNotes}
                                        onChange={(e) => setFormData(prev => ({ ...prev, clientNotes: e.target.value }))}
                                        rows={2}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 2: Motorcycle */}
                {currentStep === 2 && (
                    <div className="step-moto">
                        {clientMotos.length > 0 && !formData.isNewMoto && (
                            <>
                                <p className="text-secondary mb-md">Selecciona una moto del cliente:</p>
                                <div className="moto-list">
                                    {clientMotos.map(moto => (
                                        <button
                                            key={moto.id}
                                            className={`moto-card ${formData.selectedMoto?.id === moto.id ? 'selected' : ''}`}
                                            onClick={() => setFormData(prev => ({ ...prev, selectedMoto: moto, isNewMoto: false }))}
                                        >
                                            <div className="moto-card-main">
                                                <Bike size={24} />
                                                <div>
                                                    <strong>{moto.brand} {moto.model}</strong>
                                                    <span>{moto.year} • {moto.color}</span>
                                                </div>
                                            </div>
                                            {moto.plates && <div className="moto-card-plates">{moto.plates}</div>}
                                        </button>
                                    ))}
                                </div>
                                <div className="divider" />
                            </>
                        )}

                        <button
                            className={`btn ${formData.isNewMoto ? 'btn-primary' : 'btn-outline'} btn-full`}
                            onClick={() => setFormData(prev => ({ ...prev, isNewMoto: true, selectedMoto: null }))}
                        >
                            <Plus size={20} />
                            Registrar Nueva Moto
                        </button>

                        {formData.isNewMoto && (
                            <div className="new-moto-form mt-lg">
                                <div className="grid grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Marca *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Honda, Yamaha..."
                                            value={formData.motoData.brand}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                motoData: { ...prev.motoData, brand: e.target.value }
                                            }))}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Modelo *</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="CB500X, MT-07..."
                                            value={formData.motoData.model}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                motoData: { ...prev.motoData, model: e.target.value }
                                            }))}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Año</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="2024"
                                            value={formData.motoData.year}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                motoData: { ...prev.motoData, year: e.target.value }
                                            }))}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Color</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Negro, Rojo..."
                                            value={formData.motoData.color}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                motoData: { ...prev.motoData, color: e.target.value }
                                            }))}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Placas</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="ABC-123"
                                            value={formData.motoData.plates}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                motoData: { ...prev.motoData, plates: e.target.value.toUpperCase() }
                                            }))}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Kilometraje</label>
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="15000"
                                            value={formData.motoData.mileage}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                motoData: { ...prev.motoData, mileage: e.target.value }
                                            }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Notas</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Modificaciones, detalles especiales..."
                                        value={formData.motoData.notes}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            motoData: { ...prev.motoData, notes: e.target.value }
                                        }))}
                                        rows={2}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 3: Services */}
                {currentStep === 3 && (
                    <div className="step-services">
                        <p className="text-secondary mb-md">Selecciona los servicios:</p>

                        <div className="services-list">
                            {services.filter(s => s.is_active).map(service => (
                                <label key={service.id} className="service-item">
                                    <input
                                        type="checkbox"
                                        checked={formData.selectedServices.includes(service.id)}
                                        onChange={() => toggleService(service.id)}
                                    />
                                    <div className="service-item-content">
                                        <span className="service-name">{service.name}</span>
                                        <span className="service-price">${service.default_price}</span>
                                    </div>
                                    <div className="checkbox-indicator">
                                        {formData.selectedServices.includes(service.id) && <Check size={16} />}
                                    </div>
                                </label>
                            ))}
                        </div>

                        <div className="divider" />

                        <div className="form-group">
                            <label className="form-label">Otro Servicio / Descripción Específica</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Ej: Revisión de chicote del acelerador, cambio de llanta trasera marca X..."
                                value={formData.customService}
                                onChange={(e) => setFormData(prev => ({ ...prev, customService: e.target.value }))}
                                rows={3}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">
                                <FileText size={16} />
                                ¿Qué siente la moto? (Descripción de la falla)
                            </label>
                            <textarea
                                className="form-textarea"
                                placeholder="Describe la falla o petición del cliente..."
                                value={formData.customerComplaint}
                                onChange={(e) => setFormData(prev => ({ ...prev, customerComplaint: e.target.value }))}
                                rows={3}
                            />
                        </div>

                        {/* Services Summary */}
                        {formData.selectedServices.length > 0 && (
                            <div className="services-summary card mt-lg">
                                <h3 className="card-title mb-md">Resumen de Servicios</h3>

                                {formData.selectedServices.map(svcId => {
                                    const svc = services.find(s => s.id === svcId);
                                    return (
                                        <div key={svcId} className="summary-row">
                                            <span>{svc?.name}</span>
                                            <strong className="text-primary">${svc?.default_price || 0}</strong>
                                        </div>
                                    );
                                })}

                                {formData.customService && (
                                    <div className="summary-row">
                                        <span>{formData.customService}</span>
                                        <strong className="text-muted">Por cotizar</strong>
                                    </div>
                                )}

                                <div className="divider" style={{ margin: 'var(--spacing-sm) 0' }} />

                                <div className="summary-row summary-total">
                                    <span style={{ fontSize: '1rem', fontWeight: 600 }}>Total:</span>
                                    <strong className="text-primary" style={{ fontSize: '1.375rem' }}>
                                        ${formData.selectedServices
                                            .reduce((sum, svcId) => {
                                                const svc = services.find(s => s.id === svcId);
                                                return sum + (svc?.default_price || 0);
                                            }, 0)
                                            .toLocaleString('es-MX')}
                                    </strong>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: Photos */}
                {currentStep === 4 && (
                    <div className="step-photos">
                        <div className="photo-capture-section">
                            <label className="photo-capture-btn">
                                <Camera size={32} />
                                <span>Tomar Fotos</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    multiple
                                    onChange={handlePhotoCapture}
                                    style={{ display: 'none' }}
                                />
                            </label>
                            <p className="text-secondary text-center">
                                Documenta rayones, golpes, piezas faltantes, partes rotas, etc.
                            </p>
                        </div>

                        {formData.photos.length > 0 && (
                            <div className="photo-grid">
                                {formData.photos.map(photo => (
                                    <div key={photo.id} className="photo-item">
                                        <img src={photo.dataUrl} alt="Foto de moto" />
                                        <button
                                            className="photo-item-delete"
                                            onClick={() => removePhoto(photo.id)}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="divider" />

                        <p className="form-label">Verificación rápida:</p>
                        <div className="damage-checks">
                            {[
                                { key: 'scratches', label: 'Rayones visibles' },
                                { key: 'brokenPlastics', label: 'Plásticos rotos' },
                                { key: 'missingParts', label: 'Partes faltantes' },
                            ].map(({ key, label }) => (
                                <label key={key} className="form-checkbox damage-check">
                                    <input
                                        type="checkbox"
                                        checked={formData.damageChecks[key]}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            damageChecks: { ...prev.damageChecks, [key]: e.target.checked }
                                        }))}
                                    />
                                    <span>{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 5: Payment */}
                {currentStep === 5 && (
                    <div className="step-payment">
                        <div className="advance-toggle">
                            <span>¿El cliente dejó anticipo?</span>
                            <button
                                className={`toggle ${formData.hasAdvance ? 'active' : ''}`}
                                onClick={() => setFormData(prev => ({ ...prev, hasAdvance: !prev.hasAdvance }))}
                            />
                        </div>

                        {formData.hasAdvance && (
                            <div className="advance-form">
                                <div className="form-group">
                                    <label className="form-label">Monto del Anticipo</label>
                                    <div className="input-with-icon">
                                        <DollarSign className="input-icon" size={20} />
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="0.00"
                                            value={formData.advanceAmount}
                                            onChange={(e) => setFormData(prev => ({ ...prev, advanceAmount: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Método de Pago</label>
                                    <div className="payment-methods">
                                        {PAYMENT_METHODS.map(method => (
                                            <button
                                                key={method.id}
                                                className={`payment-method ${formData.paymentMethod === method.id ? 'selected' : ''}`}
                                                onClick={() => setFormData(prev => ({ ...prev, paymentMethod: method.id }))}
                                            >
                                                <method.icon size={24} />
                                                <span>{method.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Order Summary */}
                        <div className="order-summary card mt-lg">
                            <h3 className="card-title mb-md">Resumen de la Orden</h3>

                            <div className="summary-row">
                                <span>Cliente:</span>
                                <strong>{formData.clientName || formData.selectedClient?.full_name}</strong>
                            </div>

                            <div className="summary-row">
                                <span>Moto:</span>
                                <strong>
                                    {formData.isNewMoto
                                        ? `${formData.motoData.brand} ${formData.motoData.model}`
                                        : formData.selectedMoto
                                            ? `${formData.selectedMoto.brand} ${formData.selectedMoto.model}`
                                            : '-'
                                    }
                                </strong>
                            </div>

                            <div className="summary-row">
                                <span>Servicios:</span>
                                <strong>{formData.selectedServices.length + (formData.customService ? 1 : 0)}</strong>
                            </div>

                            <div className="summary-row">
                                <span>Fotos:</span>
                                <strong>{formData.photos.length}</strong>
                            </div>

                            <div className="divider" style={{ margin: 'var(--spacing-sm) 0' }} />

                            <div className="summary-row">
                                <span>Total Servicios:</span>
                                <strong className="text-primary" style={{ fontSize: '1.25rem' }}>
                                    ${formData.selectedServices
                                        .reduce((sum, svcId) => {
                                            const svc = services.find(s => s.id === svcId);
                                            return sum + (svc?.default_price || 0);
                                        }, 0)
                                        .toLocaleString('es-MX')}
                                </strong>
                            </div>

                            {formData.hasAdvance && (
                                <div className="summary-row">
                                    <span>Anticipo:</span>
                                    <strong style={{ color: 'var(--success)' }}>
                                        -${parseFloat(formData.advanceAmount || 0).toLocaleString('es-MX')}
                                    </strong>
                                </div>
                            )}

                            <div className="summary-row highlight">
                                <span>Saldo Pendiente:</span>
                                <strong className="text-primary" style={{ fontSize: '1.25rem' }}>
                                    ${Math.max(0, formData.selectedServices
                                        .reduce((sum, svcId) => {
                                            const svc = services.find(s => s.id === svcId);
                                            return sum + (svc?.default_price || 0);
                                        }, 0) - parseFloat(formData.advanceAmount || 0)
                                    ).toLocaleString('es-MX')}
                                </strong>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation Buttons */}
            <div className="step-navigation">
                {currentStep > 1 && (
                    <button className="btn btn-outline" onClick={prevStep}>
                        <ArrowLeft size={20} />
                        Anterior
                    </button>
                )}

                {currentStep < 5 ? (
                    <button
                        className="btn btn-primary"
                        onClick={nextStep}
                        disabled={!canProceed()}
                    >
                        Siguiente
                        <ArrowRight size={20} />
                    </button>
                ) : (
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={handleSubmit}
                        disabled={loading || !canProceed()}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" />
                                Creando...
                            </>
                        ) : (
                            <>
                                <Check size={20} />
                                Crear Orden
                            </>
                        )}
                    </button>
                )}
            </div>

            <style>{`
        .new-order {
          padding-bottom: 120px;
        }

        .new-order-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
        }

        .new-order-header h1 {
          font-size: 1.25rem;
          font-weight: 600;
        }

        .step-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-xl);
        }

        .step-number {
          width: 40px;
          height: 40px;
          background: var(--primary);
          color: white;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.125rem;
        }

        .step-title {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .step-subtitle {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .step-content {
          margin-bottom: var(--spacing-xl);
        }

        /* Client Step */
        .search-input-wrapper {
          display: flex;
          gap: var(--spacing-sm);
        }

        .search-input-wrapper .form-input {
          flex: 1;
        }

        .search-btn {
          flex-shrink: 0;
        }

        .client-found {
          margin-top: var(--spacing-md);
          border-color: var(--primary);
        }

        .client-found-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-sm);
          font-weight: 500;
          color: var(--primary);
        }

        .client-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .client-motos-count {
          margin-top: var(--spacing-sm);
          padding-top: var(--spacing-sm);
          border-top: 1px solid var(--border-color);
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .new-client-form {
          margin-top: var(--spacing-lg);
        }

        .new-client-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--spacing-xs);
          background: var(--primary-light);
          color: var(--primary);
          padding: var(--spacing-xs) var(--spacing-sm);
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 600;
          margin-bottom: var(--spacing-md);
        }

        .input-with-icon {
          position: relative;
        }

        .input-with-icon .form-input {
          padding-left: 48px;
        }

        .input-icon {
          position: absolute;
          left: var(--spacing-md);
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        /* Moto Step */
        .moto-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .moto-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--spacing-md);
          background: var(--bg-card);
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
          text-align: left;
          width: 100%;
          color: inherit;
        }

        .moto-card:hover {
          border-color: var(--primary);
        }

        .moto-card.selected {
          border-color: var(--primary);
          background: rgba(0, 255, 136, 0.05);
        }

        .moto-card-main {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }

        .moto-card-main div {
          display: flex;
          flex-direction: column;
        }

        .moto-card-main span {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .moto-card-plates {
          background: var(--bg-input);
          padding: var(--spacing-xs) var(--spacing-sm);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
        }

        /* Services Step */
        .services-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .service-item {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-card);
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .service-item:hover {
          border-color: var(--primary);
        }

        .service-item:has(input:checked) {
          border-color: var(--primary);
          background: rgba(0, 255, 136, 0.05);
        }

        .service-item input {
          display: none;
        }

        .service-item-content {
          flex: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .service-name {
          font-weight: 500;
        }

        .service-price {
          color: var(--primary);
          font-weight: 600;
        }

        .checkbox-indicator {
          width: 24px;
          height: 24px;
          border: 2px solid var(--border-color);
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
        }

        .service-item:has(input:checked) .checkbox-indicator {
          background: var(--primary);
          border-color: var(--primary);
          color: var(--bg-dark);
        }

        /* Photos Step */
        .photo-capture-section {
          text-align: center;
          margin-bottom: var(--spacing-xl);
        }

        .photo-capture-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-sm);
          width: 100%;
          padding: var(--spacing-xl);
          background: linear-gradient(135deg, var(--primary), var(--primary-hover));
          color: var(--bg-dark);
          border-radius: var(--radius-lg);
          cursor: pointer;
          margin-bottom: var(--spacing-md);
          transition: all var(--transition-fast);
        }

        .photo-capture-btn:hover {
          transform: scale(1.02);
          box-shadow: var(--glow-primary);
        }

        .photo-capture-btn span {
          font-size: 1.125rem;
          font-weight: 600;
        }

        .damage-checks {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .damage-check {
          padding: var(--spacing-md);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
        }

        /* Payment Step */
        .advance-toggle {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--spacing-lg);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          margin-bottom: var(--spacing-lg);
        }

        .advance-form {
          padding: var(--spacing-lg);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
        }

        .payment-methods {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--spacing-sm);
        }

        .payment-method {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-md);
          background: var(--bg-input);
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
          color: var(--text-secondary);
        }

        .payment-method:hover {
          border-color: var(--primary);
          color: var(--primary);
        }

        .payment-method.selected {
          border-color: var(--primary);
          background: rgba(0, 255, 136, 0.1);
          color: var(--primary);
        }

        .payment-method span {
          font-size: 0.75rem;
          font-weight: 500;
        }

        /* Order Summary */
        .order-summary {
          background: var(--bg-card);
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: var(--spacing-sm) 0;
          border-bottom: 1px solid var(--border-color);
        }

        .summary-row:last-child {
          border-bottom: none;
        }

        .summary-row span {
          color: var(--text-secondary);
        }

        .summary-row.highlight {
          padding: var(--spacing-md) 0;
          margin-top: var(--spacing-sm);
        }

        /* Navigation */
        .step-navigation {
          position: sticky;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          margin: var(--spacing-lg) calc(-1 * var(--spacing-lg));
          margin-bottom: 0;
          background: var(--bg-primary);
          border-top: 1px solid var(--border-color);
          z-index: 100;
        }

        .step-navigation .btn {
          flex: 1;
        }

        .step-navigation .btn-primary {
          flex: 2;
        }
      `}</style>
        </div>
    );
}
