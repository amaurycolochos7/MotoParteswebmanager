import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Search,
    Plus,
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
    Smartphone,
    Camera,
    ImagePlus,
    AlertCircle,
    Download,
    Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { saveOrderPhotos } from '../../services/photoStorageService';

const STEPS = [
    { id: 1, title: 'Cliente', icon: User },
    { id: 2, title: 'Moto', icon: Bike },
    { id: 3, title: 'Servicios', icon: Wrench },
    { id: 4, title: 'Fotos', icon: Camera },
    { id: 5, title: 'Pago', icon: DollarSign },
];

const PAYMENT_METHODS = [
    { id: 'cash', label: 'Efectivo', icon: Banknote },
    { id: 'card', label: 'Tarjeta', icon: CreditCard },
    { id: 'transfer', label: 'Transferencia', icon: Smartphone },
];

export default function NewServiceOrder() {
    const navigate = useNavigate();
    const { user, canCreateClients, hasPermission } = useAuth();
    const {
        findClientByPhone,
        searchClients,
        addClient,
        getClientMotorcycles,
        addMotorcycle,
        services,
        addOrder,
        addService
    } = useData();

    // Format currency as Mexican Pesos
    const formatMXN = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount || 0);
    };

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
        customServiceLabor: '',
        customServiceMaterials: '',
        customerComplaint: '',

        // Photos - Documentación de ingreso
        entryPhotos: {
            front: null,      // Foto frontal (obligatoria)
            back: null,       // Foto trasera (obligatoria)
            leftSide: null,   // Lateral izquierdo (obligatoria)
            rightSide: null,  // Lateral derecho (obligatoria)
        },
        additionalPhotos: [],  // Fotos adicionales de daños
        damageDescription: '', // Descripción de daños existentes
        entryMileage: '',      // Kilometraje de ingreso
        fuelLevel: 50,         // Nivel de combustible (0-100%)

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

    // State for download loading
    const [downloading, setDownloading] = useState(false);
    const [downloadStatus, setDownloadStatus] = useState(null); // 'success' | 'error' | null

    // State for new service form
    const [showNewServiceForm, setShowNewServiceForm] = useState(false);
    const [newServiceData, setNewServiceData] = useState({
        name: '',
        labor_cost: '',
        materials_cost: ''
    });
    const [savingService, setSavingService] = useState(false);

    // Handle create new service
    const handleSaveNewService = async () => {
        if (!newServiceData.name.trim()) {
            alert('El nombre del servicio es obligatorio');
            return;
        }

        setSavingService(true);
        try {
            const laborCost = parseFloat(newServiceData.labor_cost) || 0;
            const materialsCost = parseFloat(newServiceData.materials_cost) || 0;

            await addService({
                name: newServiceData.name.trim(),
                labor_cost: laborCost,
                materials_cost: materialsCost,
                base_price: laborCost + materialsCost,
                is_active: true
            });

            // Reset form and close
            setNewServiceData({ name: '', labor_cost: '', materials_cost: '' });
            setShowNewServiceForm(false);
        } catch (error) {
            console.error('Error creating service:', error);
            alert('Error al crear el servicio');
        } finally {
            setSavingService(false);
        }
    };

    // Download order summary with photos
    const downloadOrderSummary = async () => {
        setDownloading(true);

        try {
            // Using html2canvas approach - create a temporary styled container
            // INCREASED WIDTH to 900px for better quality
            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: -9999px;
                width: 900px;
                background: white;
                padding: 0;
                z-index: 9999;
                font-family: 'Segoe UI', Arial, sans-serif;
            `;

            const clientName = formData.clientName || formData.selectedClient?.full_name || 'N/A';
            const clientPhone = formData.selectedClient?.phone || formData.clientPhone || '';
            const motoInfo = formData.isNewMoto
                ? `${formData.motoData.brand} ${formData.motoData.model}`
                : formData.selectedMoto
                    ? `${formData.selectedMoto.brand} ${formData.selectedMoto.model}`
                    : 'N/A';
            const motoYear = formData.isNewMoto ? formData.motoData.year : (formData.selectedMoto?.year || '');
            const motoPlates = formData.isNewMoto ? formData.motoData.plates : (formData.selectedMoto?.plates || '');
            const motoColor = formData.isNewMoto ? formData.motoData.color : (formData.selectedMoto?.color || '');

            const total = formData.selectedServices.reduce((sum, svcId) => {
                const svc = services.find(s => s.id === svcId);
                return sum + (svc?.base_price || 0);
            }, 0) + (parseFloat(formData.customServiceLabor) || 0) + (parseFloat(formData.customServiceMaterials) || 0);

            // Generate services list with improved styling
            const servicesList = formData.selectedServices.map(svcId => {
                const svc = services.find(s => s.id === svcId);
                return `<div style="display: flex; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid #f1f5f9; font-size: 15px;"><span style="color: #334155;">${svc?.name || 'Servicio'}</span><span style="font-weight: 700; color: #2563eb;">${formatMXN(svc?.base_price || 0)}</span></div>`;
            }).join('');

            tempContainer.innerHTML = `
                <!-- HEADER PREMIUM - Fondo Blanco Profesional -->
                <div style="background: white; border-bottom: 4px solid #dc2626;">
                    <div style="padding: 28px 40px; display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <!-- Logo en contenedor oscuro para destacar -->
                            <div style="width: 70px; height: 70px; background: #1a1a2e; border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                                <img src="/logo.png" style="height: 50px; width: auto;" onerror="this.parentElement.innerHTML='<span style=font-size:28px;color:white;font-weight:900>MP</span>'" />
                            </div>
                            <div>
                                <h1 style="margin: 0; font-size: 32px; font-weight: 900; color: #1a1a2e; letter-spacing: -1px;">
                                    MOTO<span style="color: #dc2626;">PARTES</span>
                                </h1>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 2px;">Taller de Servicio Especializado</p>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <p style="margin: 0; font-size: 13px; color: #888;">${new Date().toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                    </div>
                </div>

                <div style="padding: 30px 40px; background: #fafafa;">
                    <!-- Info Cards -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                        <div style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                            <p style="margin: 0 0 8px 0; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Cliente</p>
                            <p style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a2e;">${clientName}</p>
                            ${clientPhone ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${clientPhone}</p>` : ''}
                        </div>
                        <div style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                            <p style="margin: 0 0 8px 0; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Vehículo</p>
                            <p style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a2e;">${motoInfo}</p>
                            <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">
                                ${motoYear ? `${motoYear}` : ''} ${motoColor ? `• ${motoColor}` : ''} ${motoPlates ? `• ${motoPlates}` : ''}
                            </p>
                        </div>
                    </div>

                    <!-- Estado de Ingreso -->
                    ${(formData.entryMileage || formData.fuelLevel !== 50) ? `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
                            ${formData.entryMileage ? `
                                <div style="background: white; padding: 20px 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 16px;">
                                    <div style="width: 48px; height: 48px; background: #1a1a2e; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    </div>
                                    <div>
                                        <p style="margin: 0; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Kilometraje</p>
                                        <p style="margin: 4px 0 0 0; font-size: 24px; font-weight: 800; color: #1a1a2e;">${parseInt(formData.entryMileage).toLocaleString('es-MX')} <span style="font-size: 14px; font-weight: 600; color: #888;">km</span></p>
                                    </div>
                                </div>
                            ` : '<div></div>'}
                            <div style="background: white; padding: 20px 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                                <p style="margin: 0 0 12px 0; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Combustible</p>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-weight: 700; color: #dc2626; font-size: 12px;">E</span>
                                    <div style="flex: 1; height: 16px; background: #f0f0f0; border-radius: 8px; overflow: hidden;">
                                        <div style="height: 100%; width: ${formData.fuelLevel}%; background: linear-gradient(90deg, #dc2626, #f59e0b, #10b981); border-radius: 8px;"></div>
                                    </div>
                                    <span style="font-weight: 700; color: #10b981; font-size: 12px;">F</span>
                                    <span style="font-weight: 800; color: #1a1a2e; font-size: 18px; margin-left: 8px;">${formData.fuelLevel}%</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Servicios -->
                    <div style="background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 24px; overflow: hidden;">
                        <div style="padding: 16px 24px; background: #dc2626;">
                            <p style="margin: 0; font-size: 14px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: white;">Servicios a Realizar</p>
                        </div>
                        <div style="padding: 20px 24px;">
                            ${formData.selectedServices.map(svcId => {
                const svc = services.find(s => s.id === svcId);
                return `<div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0;"><span style="color: #444; font-size: 15px;">${svc?.name || 'Servicio'}</span><span style="font-weight: 700; color: #1a1a2e;">${formatMXN(svc?.base_price || 0)}</span></div>`;
            }).join('')}
                            ${formData.customService ? `<div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0;"><span style="color: #444; font-size: 15px;">${formData.customService}</span><span style="font-weight: 700; color: #1a1a2e;">${formatMXN((parseFloat(formData.customServiceLabor) || 0) + (parseFloat(formData.customServiceMaterials) || 0))}</span></div>` : ''}
                            <div style="display: flex; justify-content: space-between; padding: 20px 0 0 0; margin-top: 12px; border-top: 2px solid #1a1a2e;">
                                <span style="font-size: 18px; font-weight: 800; color: #1a1a2e;">TOTAL</span>
                                <span style="font-size: 24px; font-weight: 900; color: #dc2626;">${formatMXN(total)}</span>
                            </div>
                            ${formData.hasAdvance ? `
                                <div style="margin-top: 16px; padding: 12px 16px; background: #f0fdf4; border-radius: 8px;">
                                    <div style="display: flex; justify-content: space-between; font-size: 14px;">
                                        <span style="color: #166534;">Anticipo recibido</span>
                                        <span style="color: #166534; font-weight: 600;">-${formatMXN(parseFloat(formData.advanceAmount) || 0)}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 16px; font-weight: 700;">
                                        <span style="color: #1a1a2e;">Saldo pendiente</span>
                                        <span style="color: #dc2626;">${formatMXN(total - (parseFloat(formData.advanceAmount) || 0))}</span>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    ${formData.damageDescription ? `
                        <div style="background: #fffbeb; border: 1px solid #fcd34d; padding: 20px 24px; border-radius: 12px; margin-bottom: 24px;">
                            <p style="margin: 0 0 8px 0; font-size: 12px; color: #92400e; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Observaciones / Daños Previos</p>
                            <p style="margin: 0; font-size: 14px; color: #78350f; line-height: 1.6;">${formData.damageDescription}</p>
                        </div>
                    ` : ''}

                    <!-- Fotos - CUADRADAS CON ASPECT RATIO CORRECTO -->
                    <div style="margin-bottom: 24px;">
                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #888; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Registro Fotográfico</p>
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                            ${formData.entryPhotos.front ? `
                                <div style="border-radius: 8px; overflow: hidden; background: #f0f0f0; aspect-ratio: 1;">
                                    <img src="${formData.entryPhotos.front}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                            ` : ''}
                            ${formData.entryPhotos.back ? `
                                <div style="border-radius: 8px; overflow: hidden; background: #f0f0f0; aspect-ratio: 1;">
                                    <img src="${formData.entryPhotos.back}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                            ` : ''}
                            ${formData.entryPhotos.leftSide ? `
                                <div style="border-radius: 8px; overflow: hidden; background: #f0f0f0; aspect-ratio: 1;">
                                    <img src="${formData.entryPhotos.leftSide}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                            ` : ''}
                            ${formData.entryPhotos.rightSide ? `
                                <div style="border-radius: 8px; overflow: hidden; background: #f0f0f0; aspect-ratio: 1;">
                                    <img src="${formData.entryPhotos.rightSide}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    ${formData.additionalPhotos.length > 0 ? `
                        <div style="margin-bottom: 24px;">
                            <p style="margin: 0 0 12px 0; font-size: 12px; color: #888; font-weight: 600;">Fotos adicionales (daños existentes)</p>
                            <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px;">
                                ${formData.additionalPhotos.map((p) => `
                                    <div style="border-radius: 6px; overflow: hidden; aspect-ratio: 1;">
                                        <img src="${p}" style="width: 100%; height: 100%; object-fit: cover;" />
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- Footer Profesional -->
                <div style="background: #1a1a2e; color: white; padding: 20px 40px; display: flex; justify-content: space-between; align-items: center;">
                    <p style="margin: 0; font-size: 12px; opacity: 0.7;">Documento generado automáticamente</p>
                    <p style="margin: 0; font-size: 13px; font-weight: 600;">MotoPartes Club © ${new Date().getFullYear()}</p>
                </div>
            `;

            document.body.appendChild(tempContainer);

            // Wait for images to load
            await new Promise(resolve => setTimeout(resolve, 800));

            // Use html2canvas with HIGHER QUALITY
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(tempContainer, {
                scale: 3, // Increased from 2 to 3 for better quality
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            const link = document.createElement('a');
            link.download = `orden-servicio-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png', 1.0); // Maximum quality
            link.click();

            document.body.removeChild(tempContainer);

            // Mostrar animación de éxito
            setDownloadStatus('success');
            setTimeout(() => setDownloadStatus(null), 3000);
        } catch (e) {
            console.error('Error al descargar:', e);
            // Mostrar animación de error
            setDownloadStatus('error');
            setTimeout(() => setDownloadStatus(null), 3000);
        } finally {
            setDownloading(false);
        }
    };

    // Submit order
    const handleSubmit = async () => {
        setLoading(true);

        try {
            // Create client if new
            let clientId = formData.selectedClient?.id;
            if (formData.isNewClient) {
                const newClient = await addClient({
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
                const newMoto = await addMotorcycle({
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
                    price: svc?.base_price || 0,
                    labor_cost: svc?.labor_cost || 0,
                    materials_cost: svc?.materials_cost || 0
                };
            });

            if (formData.customService.trim()) {
                orderServices.push({
                    service_id: null,
                    name: formData.customService.trim(),
                    price: (parseFloat(formData.customServiceLabor) || 0) + (parseFloat(formData.customServiceMaterials) || 0),
                    labor_cost: parseFloat(formData.customServiceLabor) || 0,
                    materials_cost: parseFloat(formData.customServiceMaterials) || 0,
                    is_custom: true,
                });
            }



            // Calculate total amount from services
            const totalAmount = orderServices.reduce((sum, svc) => sum + (svc.price || 0), 0);

            const order = await addOrder({
                client_id: clientId,
                motorcycle_id: motoId,
                mechanic_id: user.id,
                mechanic_name: user.full_name,
                services: orderServices,
                custom_service: formData.customService,
                customer_complaint: formData.customerComplaint,
                photos: [], // Photos removed from UI
                damage_checks: formData.damageChecks,
                has_advance: formData.hasAdvance,
                advance_payment: formData.hasAdvance ? parseFloat(formData.advanceAmount) || 0 : 0,
                payment_method: formData.hasAdvance ? formData.paymentMethod : null,
                total_amount: totalAmount,
            });

            // Guardar fotos en localStorage para poder descargarlas después
            console.log('📸 Verificando fotos para guardar...');
            console.log('📸 entryPhotos:', {
                front: !!formData.entryPhotos.front,
                back: !!formData.entryPhotos.back,
                leftSide: !!formData.entryPhotos.leftSide,
                rightSide: !!formData.entryPhotos.rightSide
            });
            console.log('📸 order.id:', order.id);

            const hasAnyPhoto = formData.entryPhotos.front || formData.entryPhotos.back || formData.entryPhotos.leftSide || formData.entryPhotos.rightSide;
            console.log('📸 Tiene alguna foto:', hasAnyPhoto);

            if (hasAnyPhoto) {
                const photoData = {
                    entryPhotos: formData.entryPhotos,
                    additionalPhotos: formData.additionalPhotos,
                    damageDescription: formData.damageDescription,
                    clientName: formData.clientName || formData.selectedClient?.full_name,
                    clientPhone: formData.selectedClient?.phone || formData.clientPhone,
                    motoInfo: formData.isNewMoto
                        ? `${formData.motoData.brand} ${formData.motoData.model}`
                        : `${formData.selectedMoto?.brand} ${formData.selectedMoto?.model}`,
                    motoYear: formData.isNewMoto ? formData.motoData.year : formData.selectedMoto?.year,
                    motoPlates: formData.isNewMoto ? formData.motoData.plates : formData.selectedMoto?.plates,
                    services: orderServices,
                    totalAmount,
                    hasAdvance: formData.hasAdvance,
                    advanceAmount: formData.advanceAmount
                };
                console.log('📸 Guardando fotos con saveOrderPhotos...');
                const saved = saveOrderPhotos(order.id, photoData);
                console.log('📸 Resultado de guardado:', saved);
            } else {
                console.log('⚠️ No hay fotos para guardar');
            }

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
                // Las 4 fotos obligatorias deben estar tomadas
                const { front, back, leftSide, rightSide } = formData.entryPhotos;
                return front && back && leftSide && rightSide;
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
            {/* Download Status Overlay */}
            {downloadStatus && (
                <div className="download-overlay">
                    <div className={`download-status-card ${downloadStatus}`}>
                        <div className="status-icon-wrapper">
                            {downloadStatus === 'success' ? (
                                <Check size={48} strokeWidth={3} />
                            ) : (
                                <X size={48} strokeWidth={3} />
                            )}
                        </div>
                        <h3 className="status-title">
                            {downloadStatus === 'success' ? '¡Descarga Completada!' : 'Error en la Descarga'}
                        </h3>
                        <p className="status-message">
                            {downloadStatus === 'success'
                                ? 'La imagen se guardó en tu dispositivo'
                                : 'No se pudo generar la imagen. Intenta de nuevo.'}
                        </p>
                    </div>
                </div>
            )}

            <style>{`
                .download-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    animation: overlayFadeIn 0.3s ease-out;
                }

                @keyframes overlayFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .download-status-card {
                    background: white;
                    border-radius: 24px;
                    padding: 40px 50px;
                    text-align: center;
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
                    animation: cardBounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                @keyframes cardBounceIn {
                    0% { 
                        opacity: 0; 
                        transform: scale(0.5); 
                    }
                    100% { 
                        opacity: 1; 
                        transform: scale(1); 
                    }
                }

                .status-icon-wrapper {
                    width: 100px;
                    height: 100px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    animation: iconPop 0.6s ease-out 0.2s both;
                }

                @keyframes iconPop {
                    0% { transform: scale(0) rotate(-45deg); }
                    50% { transform: scale(1.2) rotate(0deg); }
                    100% { transform: scale(1) rotate(0deg); }
                }

                .download-status-card.success .status-icon-wrapper {
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    box-shadow: 0 8px 30px rgba(16, 185, 129, 0.4);
                }

                .download-status-card.error .status-icon-wrapper {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                    box-shadow: 0 8px 30px rgba(239, 68, 68, 0.4);
                }

                .status-title {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin: 0 0 8px 0;
                    color: #1e293b;
                }

                .status-message {
                    font-size: 1rem;
                    color: #64748b;
                    margin: 0;
                }
            `}</style>
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
                        {currentStep === 4 && 'Documenta el estado de ingreso'}
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
                            <label className="form-label">Buscar Cliente (nombre o teléfono)</label>
                            <div className="search-input-wrapper">
                                <Search size={20} className="search-icon-left" />
                                <input
                                    type="text"
                                    className="form-input search-with-icon"
                                    placeholder="Escribe nombre o teléfono..."
                                    value={formData.clientPhone}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setFormData(prev => ({
                                            ...prev,
                                            clientPhone: value,
                                            selectedClient: null,
                                            isNewClient: false,
                                        }));
                                        setSearchPerformed(false);
                                    }}
                                />
                            </div>

                            {/* Search Results */}
                            {formData.clientPhone.length >= 2 && !formData.selectedClient && !formData.isNewClient && (() => {
                                const results = searchClients(formData.clientPhone);
                                if (results.length > 0) {
                                    return (
                                        <div className="search-results">
                                            {results.map(client => (
                                                <button
                                                    key={client.id}
                                                    className="search-result-item"
                                                    onClick={() => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            selectedClient: client,
                                                            clientName: client.full_name,
                                                            clientPhone: client.phone,
                                                            clientEmail: client.email || '',
                                                            clientNotes: client.notes || '',
                                                            isNewClient: false,
                                                        }));
                                                        const motos = getClientMotorcycles(client.id);
                                                        setClientMotos(motos);
                                                        setSearchPerformed(true);
                                                    }}
                                                >
                                                    <User size={18} />
                                                    <div className="result-info">
                                                        <strong>{client.full_name}</strong>
                                                        <span>{client.phone}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            {/* No results - option to create new */}
                            {formData.clientPhone.length >= 3 && !formData.selectedClient && !formData.isNewClient && searchClients(formData.clientPhone).length === 0 && canCreateClients() && (
                                <button
                                    className="btn btn-outline btn-new-client"
                                    onClick={() => {
                                        // Check if it's a phone number
                                        const isPhone = /^\d{10}$/.test(formData.clientPhone.replace(/\D/g, ''));
                                        setFormData(prev => ({
                                            ...prev,
                                            isNewClient: true,
                                            clientName: isPhone ? '' : formData.clientPhone,
                                            clientPhone: isPhone ? formData.clientPhone : '',
                                        }));
                                        setSearchPerformed(true);
                                    }}
                                >
                                    <Plus size={18} />
                                    Cliente no encontrado - Registrar nuevo
                                </button>
                            )}
                        </div>

                        {searchPerformed && formData.selectedClient && (
                            <div className="client-found card">
                                <div className="client-found-header">
                                    <Check size={20} className="text-primary" />
                                    <span>Cliente seleccionado</span>
                                    <button
                                        className="btn-clear"
                                        onClick={() => {
                                            setFormData(prev => ({
                                                ...prev,
                                                selectedClient: null,
                                                clientPhone: '',
                                                isNewClient: false,
                                            }));
                                            setClientMotos([]);
                                            setSearchPerformed(false);
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
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
                                    <label className="form-label">Teléfono *</label>
                                    <div className="input-with-icon">
                                        <Phone className="input-icon" size={20} />
                                        <input
                                            type="tel"
                                            className="form-input"
                                            placeholder="10 dígitos"
                                            value={formData.clientPhone}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                clientPhone: e.target.value.replace(/\D/g, '').slice(0, 10)
                                            }))}
                                            maxLength={10}
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

                        {/* Add New Service Button - only if has permission */}
                        {hasPermission('can_create_services') && (
                            <div className="mb-md">
                                {!showNewServiceForm ? (
                                    <button
                                        className="btn btn-outline btn-sm"
                                        onClick={() => setShowNewServiceForm(true)}
                                        style={{ width: '100%', marginBottom: '1rem' }}
                                    >
                                        <Plus size={16} />
                                        Agregar Nuevo Servicio al Catálogo
                                    </button>
                                ) : (
                                    <div className="new-service-form card" style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
                                        <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9375rem', fontWeight: 600 }}>Nuevo Servicio</h4>
                                        <div className="form-group">
                                            <label className="form-label">Nombre del Servicio *</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                placeholder="Ej: Cambio de frenos traseros"
                                                value={newServiceData.name}
                                                onChange={(e) => setNewServiceData(prev => ({ ...prev, name: e.target.value }))}
                                            />
                                        </div>
                                        <div className="grid grid-2" style={{ gap: '0.75rem' }}>
                                            <div className="form-group">
                                                <label className="form-label">Mano de obra ($)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    placeholder="0.00"
                                                    value={newServiceData.labor_cost}
                                                    onChange={(e) => setNewServiceData(prev => ({ ...prev, labor_cost: e.target.value }))}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Refacción ($)</label>
                                                <input
                                                    type="number"
                                                    className="form-input"
                                                    placeholder="0.00"
                                                    value={newServiceData.materials_cost}
                                                    onChange={(e) => setNewServiceData(prev => ({ ...prev, materials_cost: e.target.value }))}
                                                />
                                            </div>
                                        </div>
                                        {(newServiceData.labor_cost || newServiceData.materials_cost) && (
                                            <p style={{ fontSize: '0.875rem', color: 'var(--primary)', marginBottom: '0.75rem' }}>
                                                Precio total: {formatMXN((parseFloat(newServiceData.labor_cost) || 0) + (parseFloat(newServiceData.materials_cost) || 0))}
                                            </p>
                                        )}
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => {
                                                    setShowNewServiceForm(false);
                                                    setNewServiceData({ name: '', labor_cost: '', materials_cost: '' });
                                                }}
                                                disabled={savingService}
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={handleSaveNewService}
                                                disabled={savingService || !newServiceData.name.trim()}
                                                style={{ flex: 1 }}
                                            >
                                                {savingService ? (
                                                    <>
                                                        <Loader2 size={16} className="spin" />
                                                        Guardando...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Check size={16} />
                                                        Guardar Servicio
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

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
                                        <span className="service-price">{formatMXN(service.base_price)}</span>
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
                            {formData.customService && (
                                <div className="mt-sm grid grid-2">
                                    <div>
                                        <label className="form-label text-sm">Mano de Obra:</label>
                                        <div className="input-with-icon">
                                            <Wrench className="input-icon" size={16} />
                                            <input
                                                type="number"
                                                className="form-input"
                                                placeholder="0.00"
                                                value={formData.customServiceLabor}
                                                onChange={(e) => setFormData(prev => ({ ...prev, customServiceLabor: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="form-label text-sm">Refacción/Material:</label>
                                        <div className="input-with-icon">
                                            <DollarSign className="input-icon" size={16} />
                                            <input
                                                type="number"
                                                className="form-input"
                                                placeholder="0.00"
                                                value={formData.customServiceMaterials}
                                                onChange={(e) => setFormData(prev => ({ ...prev, customServiceMaterials: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
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
                            <div className="services-summary mt-lg">
                                <h3 className="summary-title">
                                    <span>💰</span> Resumen de Cotización
                                </h3>

                                <div className="summary-items">
                                    {formData.selectedServices.map(svcId => {
                                        const svc = services.find(s => s.id === svcId);
                                        return (
                                            <div key={svcId} className="summary-item">
                                                <span className="item-name">{svc?.name}</span>
                                                <span className="item-price">{formatMXN(svc?.base_price)}</span>
                                            </div>
                                        );
                                    })}

                                    {formData.customService && (
                                        <div className="summary-item custom">
                                            <div className="item-details">
                                                <span className="item-name">{formData.customService}</span>
                                                <span className="item-breakdown">
                                                    M.O: {formatMXN(parseFloat(formData.customServiceLabor) || 0)} •
                                                    Ref: {formatMXN(parseFloat(formData.customServiceMaterials) || 0)}
                                                </span>
                                            </div>
                                            <span className="item-price">
                                                {formatMXN((parseFloat(formData.customServiceLabor) || 0) + (parseFloat(formData.customServiceMaterials) || 0))}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="summary-total-section">
                                    <div className="total-label">TOTAL A PAGAR</div>
                                    <div className="total-amount">
                                        {formatMXN(formData.selectedServices
                                            .reduce((sum, svcId) => {
                                                const svc = services.find(s => s.id === svcId);
                                                return sum + (svc?.base_price || 0);
                                            }, 0) + (parseFloat(formData.customServiceLabor) || 0) + (parseFloat(formData.customServiceMaterials) || 0))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 4: Photos - Documentación de Ingreso */}
                {currentStep === 4 && (
                    <div className="step-photos">
                        {/* Estado de Ingreso Section */}
                        <div className="entry-status-section">
                            <h4 className="section-subtitle">
                                <Bike size={18} />
                                Estado de Ingreso
                            </h4>

                            <div className="entry-status-grid">
                                {/* Kilometraje */}
                                <div className="form-group">
                                    <label className="form-label">
                                        🛣️ Kilometraje de Ingreso
                                    </label>
                                    <div className="input-with-suffix">
                                        <input
                                            type="number"
                                            className="form-input"
                                            placeholder="Ej: 15000"
                                            value={formData.entryMileage}
                                            onChange={(e) => setFormData(prev => ({ ...prev, entryMileage: e.target.value }))}
                                        />
                                        <span className="input-suffix">km</span>
                                    </div>
                                </div>

                                {/* Nivel de Combustible */}
                                <div className="form-group">
                                    <label className="form-label">
                                        ⛽ Nivel de Combustible
                                    </label>
                                    <div className="fuel-gauge-container">
                                        <div className="fuel-gauge">
                                            <span className="fuel-label fuel-empty">E</span>
                                            <div className="fuel-track">
                                                <div
                                                    className="fuel-fill"
                                                    style={{ width: `${formData.fuelLevel}%` }}
                                                />
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    step="5"
                                                    value={formData.fuelLevel}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, fuelLevel: parseInt(e.target.value) }))}
                                                    className="fuel-slider"
                                                />
                                            </div>
                                            <span className="fuel-label fuel-full">F</span>
                                        </div>
                                        <div className="fuel-percentage">
                                            {formData.fuelLevel}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="section-divider" />

                        {/* Photos Section */}
                        <h4 className="section-subtitle">
                            <Camera size={18} />
                            Documentación Fotográfica
                        </h4>

                        <div className="photo-instructions">
                            <AlertCircle size={20} />
                            <p>Toma las 4 fotos obligatorias de la moto antes de iniciar el servicio</p>
                        </div>

                        {/* Required Photos Grid */}
                        <div className="required-photos-grid">
                            {[
                                { key: 'front', label: 'Frontal', icon: '📸' },
                                { key: 'back', label: 'Trasera', icon: '📸' },
                                { key: 'leftSide', label: 'Lateral Izq.', icon: '📸' },
                                { key: 'rightSide', label: 'Lateral Der.', icon: '📸' },
                            ].map(photo => (
                                <div key={photo.key} className="photo-capture-card">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        id={`photo-${photo.key}`}
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        entryPhotos: {
                                                            ...prev.entryPhotos,
                                                            [photo.key]: ev.target?.result
                                                        }
                                                    }));
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    <label htmlFor={`photo-${photo.key}`} className="photo-capture-label">
                                        {formData.entryPhotos[photo.key] ? (
                                            <div className="photo-preview">
                                                <img src={formData.entryPhotos[photo.key]} alt={photo.label} />
                                                <div className="photo-overlay">
                                                    <Camera size={24} />
                                                    <span>Cambiar</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="photo-placeholder">
                                                <Camera size={32} />
                                                <span className="photo-label">{photo.label}</span>
                                                <span className="photo-hint">Toca para tomar foto</span>
                                            </div>
                                        )}
                                    </label>
                                    {formData.entryPhotos[photo.key] && (
                                        <div className="photo-check">
                                            <Check size={16} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Additional Photos Section */}
                        <div className="additional-photos-section">
                            <h4 className="section-subtitle">
                                <ImagePlus size={18} />
                                Fotos adicionales (daños, rayones, etc.)
                            </h4>

                            <div className="additional-photos-grid">
                                {formData.additionalPhotos.map((photo, index) => (
                                    <div key={index} className="additional-photo-item">
                                        <img src={photo} alt={`Adicional ${index + 1}`} />
                                        <button
                                            className="remove-photo-btn"
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    additionalPhotos: prev.additionalPhotos.filter((_, i) => i !== index)
                                                }));
                                            }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}

                                <div className="add-photo-card">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        id="additional-photo"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (ev) => {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        additionalPhotos: [...prev.additionalPhotos, ev.target?.result]
                                                    }));
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                            e.target.value = '';
                                        }}
                                    />
                                    <label htmlFor="additional-photo" className="add-photo-label">
                                        <Plus size={28} />
                                        <span>Agregar foto</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Damage Description */}
                        <div className="form-group">
                            <label className="form-label">
                                <FileText size={16} />
                                Descripción de daños existentes
                            </label>
                            <textarea
                                className="form-textarea"
                                placeholder="Ej: Cristal roto, rayón en tanque izquierdo, espejo suelto..."
                                value={formData.damageDescription}
                                onChange={(e) => setFormData(prev => ({ ...prev, damageDescription: e.target.value }))}
                                rows={3}
                            />
                        </div>

                        {/* Photo Status Summary */}
                        <div className="photo-status-summary">
                            <div className={`status-item ${formData.entryPhotos.front ? 'complete' : ''}`}>
                                {formData.entryPhotos.front ? <Check size={16} /> : <Camera size={16} />}
                                <span>Frontal</span>
                            </div>
                            <div className={`status-item ${formData.entryPhotos.back ? 'complete' : ''}`}>
                                {formData.entryPhotos.back ? <Check size={16} /> : <Camera size={16} />}
                                <span>Trasera</span>
                            </div>
                            <div className={`status-item ${formData.entryPhotos.leftSide ? 'complete' : ''}`}>
                                {formData.entryPhotos.leftSide ? <Check size={16} /> : <Camera size={16} />}
                                <span>Lat. Izq</span>
                            </div>
                            <div className={`status-item ${formData.entryPhotos.rightSide ? 'complete' : ''}`}>
                                {formData.entryPhotos.rightSide ? <Check size={16} /> : <Camera size={16} />}
                                <span>Lat. Der</span>
                            </div>
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

                            <div className="divider" style={{ margin: 'var(--spacing-sm) 0' }} />

                            <div className="summary-row">
                                <span>Total Servicios:</span>
                                <strong className="text-primary" style={{ fontSize: '1.25rem' }}>
                                    {formatMXN(formData.selectedServices
                                        .reduce((sum, svcId) => {
                                            const svc = services.find(s => s.id === svcId);
                                            return sum + (svc?.base_price || 0);
                                        }, 0) + (parseFloat(formData.customServiceLabor) || 0) + (parseFloat(formData.customServiceMaterials) || 0))}
                                </strong>
                            </div>

                            {formData.hasAdvance && (
                                <div className="summary-row">
                                    <span>Anticipo:</span>
                                    <strong className="text-success">-{formatMXN(parseFloat(formData.advanceAmount) || 0)}</strong>
                                </div>
                            )}

                            {formData.hasAdvance && (
                                <div className="summary-row summary-total highlight">
                                    <span>Restante:</span>
                                    <strong className="text-danger">
                                        {formatMXN(
                                            (formData.selectedServices.reduce((sum, svcId) => {
                                                const svc = services.find(s => s.id === svcId);
                                                return sum + (svc?.base_price || 0);
                                            }, 0) + (parseFloat(formData.customServiceLabor) || 0) + (parseFloat(formData.customServiceMaterials) || 0)) - (parseFloat(formData.advanceAmount) || 0)
                                        )}
                                    </strong>
                                </div>
                            )}

                            {/* Entry Photos Preview */}
                            {(formData.entryPhotos.front || formData.entryPhotos.back || formData.entryPhotos.leftSide || formData.entryPhotos.rightSide) && (
                                <div className="summary-photos-section">
                                    <h4 className="photos-section-title">📸 Fotos de Ingreso</h4>
                                    <div className="summary-photos-grid">
                                        {formData.entryPhotos.front && <img src={formData.entryPhotos.front} alt="Frontal" />}
                                        {formData.entryPhotos.back && <img src={formData.entryPhotos.back} alt="Trasera" />}
                                        {formData.entryPhotos.leftSide && <img src={formData.entryPhotos.leftSide} alt="Lateral Izq" />}
                                        {formData.entryPhotos.rightSide && <img src={formData.entryPhotos.rightSide} alt="Lateral Der" />}
                                    </div>

                                    {formData.additionalPhotos.length > 0 && (
                                        <div className="additional-preview">
                                            <span className="additional-label">+{formData.additionalPhotos.length} fotos adicionales</span>
                                        </div>
                                    )}

                                    {formData.damageDescription && (
                                        <div className="damage-notice">
                                            <AlertCircle size={14} />
                                            <span>{formData.damageDescription}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Download Button */}
                            <button
                                type="button"
                                className="btn btn-primary w-full"
                                onClick={downloadOrderSummary}
                                disabled={downloading}
                                style={{ marginTop: 'var(--spacing-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                {downloading ? (
                                    <>
                                        <Loader2 size={18} className="spin" />
                                        Generando imagen...
                                    </>
                                ) : (
                                    <>
                                        <Download size={18} />
                                        📥 Descargar Resumen con Fotos
                                    </>
                                )}
                            </button>
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
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon-left {
          position: absolute;
          left: var(--spacing-md);
          color: var(--text-muted);
          pointer-events: none;
        }

        .search-with-icon {
          padding-left: 44px;
        }

        .search-results {
          margin-top: var(--spacing-sm);
          background: var(--bg-card);
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .search-result-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-light);
          cursor: pointer;
          text-align: left;
          transition: all var(--transition-fast);
        }

        .search-result-item:last-child {
          border-bottom: none;
        }

        .search-result-item:hover {
          background: var(--bg-hover);
        }

        .search-result-item .result-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .search-result-item .result-info strong {
          font-size: 0.9375rem;
          color: var(--text-primary);
        }

        .search-result-item .result-info span {
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .btn-new-client {
          width: 100%;
          margin-top: var(--spacing-sm);
          justify-content: center;
        }

        .btn-clear {
          margin-left: auto;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-tertiary);
          border: none;
          border-radius: var(--radius-full);
          cursor: pointer;
          color: var(--text-muted);
          transition: all var(--transition-fast);
        }

        .btn-clear:hover {
          background: var(--danger);
          color: white;
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
          padding: var(--spacing-md);
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          margin-bottom: var(--spacing-lg);
        }

        .toggle {
          width: 52px;
          height: 32px;
          background: var(--bg-hover);
          border: 2px solid var(--border-color);
          border-radius: 999px;
          position: relative;
          cursor: pointer;
          transition: all var(--transition-fast);
          padding: 2px;
        }

        .toggle::after {
          content: '';
          display: block;
          width: 24px;
          height: 24px;
          background: white;
          border-radius: 50%;
          border: 2px solid var(--border-color);
          transition: all var(--transition-fast);
          box-shadow: var(--shadow-sm);
        }

        .toggle.active {
            background: var(--primary);
            border-color: var(--primary);
        }

        .toggle.active::after {
            transform: translateX(20px);
            border-color: var(--primary);
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
          padding: var(--spacing-lg);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
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

        /* Services Summary - Premium Design */
        .services-summary {
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }

        .summary-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          font-weight: 700;
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          color: white;
          margin: 0;
        }

        .summary-title span {
          font-size: 1.25rem;
        }

        .summary-items {
          padding: 0.5rem 0;
        }

        .summary-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem 1.25rem;
          border-bottom: 1px dashed var(--border-light);
        }

        .summary-item:last-child {
          border-bottom: none;
        }

        .summary-item .item-name {
          font-size: 0.9375rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .summary-item .item-price {
          font-size: 1rem;
          font-weight: 700;
          color: var(--primary);
        }

        .summary-item.custom {
          flex-direction: row;
          align-items: flex-start;
        }

        .summary-item .item-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
        }

        .summary-item .item-breakdown {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .summary-total-section {
          background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
          padding: 1.25rem;
          text-align: center;
        }

        .summary-total-section .total-label {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.8);
          margin-bottom: 0.25rem;
        }

        .summary-total-section .total-amount {
          font-size: 2rem;
          font-weight: 800;
          color: white;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        /* Navigation */
        .step-navigation {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          gap: var(--spacing-md);
          padding: var(--spacing-md);
          background: var(--bg-card);
          border-top: 1px solid var(--border-color);
          z-index: 100;
          box-shadow: 0 -4px 12px rgba(0,0,0,0.05);
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
