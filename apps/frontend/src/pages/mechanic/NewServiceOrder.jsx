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
    UserPlus,
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
    Loader2,
    Crown,
    Send
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { saveOrderPhotos } from '../../services/photoStorageService';
import { orderRequestsService } from '../../lib/api';
import { sendDirectMessage, getOrderCreatedMessage } from '../../utils/whatsappHelper';

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
    const { user, canCreateClients, hasPermission, requiresApproval } = useAuth();
    const {
        clients,
        orders,
        findClientByPhone,
        searchClients,
        addClient,
        getClientMotorcycles,
        addMotorcycle,
        services,
        addOrder,
        addService
    } = useData();
    const toast = useToast();

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

    // Master mechanics for auxiliary flow
    const [masterMechanics, setMasterMechanics] = useState([]);
    const [selectedMaster, setSelectedMaster] = useState(null);
    const isAuxiliary = requiresApproval && requiresApproval();

    // Load master mechanics for auxiliary
    useEffect(() => {
        if (isAuxiliary) {
            loadMasterMechanics();
        }
    }, [isAuxiliary]);

    const loadMasterMechanics = async () => {
        try {
            const masters = await orderRequestsService.getMasterMechanics();
            setMasterMechanics(masters || []);
            if (masters && masters.length === 1) {
                setSelectedMaster(masters[0].id);
            }
        } catch (error) {
            console.error('Error loading master mechanics:', error);
        }
    };

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

    // State for quick client+moto creation modal
    const [showQuickClientModal, setShowQuickClientModal] = useState(false);
    const [quickClientData, setQuickClientData] = useState({
        full_name: '',
        phone: '',
        email: '',
        notes: ''
    });
    const [quickMotorcycles, setQuickMotorcycles] = useState([]);
    const [savingQuickClient, setSavingQuickClient] = useState(false);

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

    // Handle quick client creation with motorcycles
    const handleSaveQuickClient = async () => {
        if (!quickClientData.full_name.trim() || !quickClientData.phone.trim()) {
            alert('Nombre y teléfono son obligatorios');
            return;
        }

        setSavingQuickClient(true);
        try {
            // Create the client
            const newClient = await addClient({
                full_name: quickClientData.full_name.trim(),
                phone: quickClientData.phone.trim(),
                email: quickClientData.email.trim() || null,
                notes: quickClientData.notes.trim() || null,
            });

            // Create motorcycles for this client
            for (const moto of quickMotorcycles) {
                if (moto.brand && moto.model) {
                    await addMotorcycle({
                        client_id: newClient.id,
                        brand: moto.brand,
                        model: moto.model,
                        year: moto.year ? parseInt(moto.year) : null,
                        plates: moto.plates || '',
                        color: moto.color || '',
                    });
                }
            }

            // Auto-select the new client
            const motos = getClientMotorcycles(newClient.id);
            setFormData(prev => ({
                ...prev,
                selectedClient: newClient,
                clientName: newClient.full_name,
                clientPhone: newClient.phone,
                clientEmail: newClient.email || '',
                clientNotes: newClient.notes || '',
                isNewClient: false,
            }));
            setClientMotos(motos);
            setSearchPerformed(true);
            setCurrentStep(2);

            // Reset and close modal
            setQuickClientData({ full_name: '', phone: '', email: '', notes: '' });
            setQuickMotorcycles([]);
            setShowQuickClientModal(false);
        } catch (error) {
            console.error('Error creating client:', error);
            alert('Error al crear el cliente: ' + error.message);
        } finally {
            setSavingQuickClient(false);
        }
    };

    // Quick motorcycles form helpers
    const addQuickMoto = () => {
        setQuickMotorcycles(prev => [...prev, {
            id: `temp-${Date.now()}`,
            brand: '',
            model: '',
            year: new Date().getFullYear().toString(),
            plates: '',
            color: '',
        }]);
    };

    const updateQuickMoto = (index, field, value) => {
        setQuickMotorcycles(prev => prev.map((moto, i) =>
            i === index ? { ...moto, [field]: value } : moto
        ));
    };

    const removeQuickMoto = (index) => {
        setQuickMotorcycles(prev => prev.filter((_, i) => i !== index));
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

            // Calculate labor and parts totals for breakdown
            const downloadLaborTotal = formData.selectedServices.reduce((sum, svcId) => {
                const svc = services.find(s => s.id === svcId);
                return sum + (svc?.labor_cost || svc?.base_price || 0);
            }, 0) + (parseFloat(formData.customServiceLabor) || 0);

            const downloadPartsTotal = formData.selectedServices.reduce((sum, svcId) => {
                const svc = services.find(s => s.id === svcId);
                return sum + (svc?.materials_cost || 0);
            }, 0) + (parseFloat(formData.customServiceMaterials) || 0);

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
                            ${downloadPartsTotal > 0 ? `
                                <div style="margin-top: 12px; padding: 12px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px;">
                                        <span style="color: #64748b;">Mano de Obra</span>
                                        <span style="font-weight: 600; color: #334155;">${formatMXN(downloadLaborTotal)}</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; font-size: 14px;">
                                        <span style="color: #64748b;">Refacciones</span>
                                        <span style="font-weight: 600; color: #334155;">${formatMXN(downloadPartsTotal)}</span>
                                    </div>
                                </div>
                            ` : ''}
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
            let clientName = formData.selectedClient?.full_name || formData.clientName;
            let clientPhone = formData.selectedClient?.phone || formData.clientPhone;

            if (formData.isNewClient) {
                const newClient = await addClient({
                    phone: formData.clientPhone,
                    full_name: formData.clientName,
                    email: formData.clientEmail,
                    notes: formData.clientNotes,
                });
                clientId = newClient.id;
                clientName = newClient.full_name;
                clientPhone = newClient.phone;
            }

            // Create motorcycle if new
            let motoId = formData.selectedMoto?.id;
            let motoBrand = formData.selectedMoto?.brand || formData.motoData.brand;
            let motoModel = formData.selectedMoto?.model || formData.motoData.model;
            let motoPlates = formData.selectedMoto?.plates || formData.motoData.plates;

            if (formData.isNewMoto) {
                const newMoto = await addMotorcycle({
                    client_id: clientId,
                    ...formData.motoData,
                    year: parseInt(formData.motoData.year) || null,
                    mileage: parseInt(formData.motoData.mileage) || null,
                });
                motoId = newMoto.id;
                motoBrand = newMoto.brand;
                motoModel = newMoto.model;
                motoPlates = newMoto.plates;
            }

            // Build services array with labor/materials breakdown
            const orderServices = formData.selectedServices.map(svcId => {
                const svc = services.find(s => s.id === svcId);
                const labor = parseFloat(svc?.labor_cost) || 0;
                const materials = parseFloat(svc?.materials_cost) || 0;
                const base = parseFloat(svc?.base_price) || 0;
                // If labor_cost is set, use it. Otherwise use base_price as labor (legacy services)
                const effectiveLabor = labor > 0 ? labor : (materials > 0 ? 0 : base);
                return {
                    service_id: svcId,
                    name: svc?.name,
                    price: effectiveLabor + materials || base,
                    labor_cost: effectiveLabor,
                    materials_cost: materials
                };
            });

            if (formData.customService.trim()) {
                const customLabor = parseFloat(formData.customServiceLabor) || 0;
                const customMaterials = parseFloat(formData.customServiceMaterials) || 0;
                orderServices.push({
                    service_id: null,
                    name: formData.customService.trim(),
                    price: customLabor + customMaterials,
                    labor_cost: customLabor,
                    materials_cost: customMaterials
                });
            }

            // Calculate total amount and breakdowns from services
            const totalAmount = orderServices.reduce((sum, svc) => sum + (parseFloat(svc.price) || 0), 0);
            const laborTotal = orderServices.reduce((sum, svc) => sum + (parseFloat(svc.labor_cost) || 0), 0);
            const partsTotal = orderServices.reduce((sum, svc) => sum + (parseFloat(svc.materials_cost) || 0), 0);


            // ============ AUXILIARY MECHANIC FLOW ============
            if (isAuxiliary) {
                if (!selectedMaster) {
                    toast.error('Debes seleccionar un mecánico maestro para enviar la solicitud');
                    setLoading(false);
                    return;
                }

                // Create order request instead of order
                const requestData = {
                    client_id: clientId,
                    client_name: clientName,
                    client_phone: clientPhone,
                    motorcycle_id: motoId,
                    moto_brand: motoBrand,
                    moto_model: motoModel,
                    moto_plates: motoPlates,
                    services: orderServices,
                    custom_service: formData.customService,
                    customer_complaint: formData.customerComplaint,
                    damage_checks: formData.damageChecks,
                    has_advance: formData.hasAdvance,
                    advance_payment: formData.hasAdvance ? parseFloat(formData.advanceAmount) || 0 : 0,
                    payment_method: formData.hasAdvance ? formData.paymentMethod : null,
                    total_amount: totalAmount,
                };

                await orderRequestsService.create({
                    requested_by: user.id,
                    requested_to: selectedMaster,
                    order_data: requestData
                });

                toast.success('Solicitud enviada al mecánico maestro. Te notificaremos cuando sea aprobada.');
                navigate('/mechanic');
                return;
            }

            // ============ NORMAL MECHANIC FLOW ============
            const order = await addOrder({
                client_id: clientId,
                motorcycle_id: motoId,
                mechanic_id: user.id,
                mechanic_name: user.full_name,
                services: orderServices,
                custom_service: formData.customService,
                custom_service_labor: formData.customService ? (parseFloat(formData.customServiceLabor) || 0) : 0,
                custom_service_materials: formData.customService ? (parseFloat(formData.customServiceMaterials) || 0) : 0,
                customer_complaint: formData.customerComplaint,
                photos: [],
                damage_checks: formData.damageChecks,
                has_advance: formData.hasAdvance,
                advance_payment: formData.hasAdvance ? parseFloat(formData.advanceAmount) || 0 : 0,
                payment_method: formData.hasAdvance ? formData.paymentMethod : null,
                labor_total: laborTotal,
                parts_total: partsTotal,
            });

            // Save photos to localStorage
            const hasAnyPhoto = formData.entryPhotos.front || formData.entryPhotos.back || formData.entryPhotos.leftSide || formData.entryPhotos.rightSide;

            if (hasAnyPhoto) {
                const photoData = {
                    entryPhotos: formData.entryPhotos,
                    additionalPhotos: formData.additionalPhotos,
                    damageDescription: formData.damageDescription,
                    clientName: clientName,
                    clientPhone: clientPhone,
                    motoInfo: `${motoBrand} ${motoModel}`,
                    motoYear: formData.isNewMoto ? formData.motoData.year : formData.selectedMoto?.year,
                    motoPlates: motoPlates,
                    services: orderServices,
                    totalAmount,
                    laborTotal,
                    partsTotal,
                    hasAdvance: formData.hasAdvance,
                    advanceAmount: formData.advanceAmount
                };
                await saveOrderPhotos(order.id, photoData);
            }

            // === AUTO WHATSAPP: Notificar al cliente que la orden fue registrada ===
            try {
                const orderPhone = clientPhone;
                if (orderPhone) {
                    const motoInfo = `${motoBrand} ${motoModel}`;
                    const baseUrl = window.location.origin;
                    // SUSPENDIDO: enlaces de seguimiento deshabilitados temporalmente
                    // const trackingLink = order.client_link ? `${baseUrl}${order.client_link}` : null;
                    const trackingLink = null;
                    const advanceAmt = formData.hasAdvance ? (parseFloat(formData.advanceAmount) || 0) : 0;
                    const waMessage = getOrderCreatedMessage(clientName, motoInfo, order.order_number, trackingLink, {
                        services: orderServices,
                        laborTotal,
                        partsTotal,
                        totalAmount,
                        advancePayment: advanceAmt,
                        paymentMethod: formData.paymentMethod,
                        isPaid: advanceAmt >= totalAmount && totalAmount > 0,
                    });

                    console.log('📤 Enviando notificación de orden creada via WhatsApp...');
                    const waResult = await sendDirectMessage(user.id, orderPhone, waMessage, order.id);

                    if (waResult.success && waResult.automated) {
                        toast.success('Cliente notificado por WhatsApp');
                    } else {
                        console.warn('⚠️ WhatsApp no enviado:', waResult.error);
                    }
                }
            } catch (waError) {
                console.error('Error enviando WhatsApp de orden creada:', waError);
                // No bloquear la navegación por fallo de WhatsApp
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
                // Services are now optional - can skip if cost/service unknown
                return true;
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
            <div className="no-header">
                <button className="no-back-btn" onClick={() => navigate(-1)}>
                    <ArrowLeft size={20} />
                </button>
                <div className="no-header-text">
                    <h1 className="no-title">Nueva Orden</h1>
                    <span className="no-step-indicator">Paso {currentStep} de {STEPS.length}</span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="no-progress">
                <div className="no-progress-fill" style={{ width: `${(currentStep / STEPS.length) * 100}%` }} />
            </div>

            {/* Step Context */}
            <p className="no-step-context">
                {currentStep === 1 && 'Selecciona o crea un cliente'}
                {currentStep === 2 && 'Selecciona o registra la moto'}
                {currentStep === 3 && 'Servicios a realizar'}
                {currentStep === 4 && 'Documenta el estado de ingreso'}
                {currentStep === 5 && 'Información de pago'}
            </p>

            {/* Step Content */}
            <div className="step-content">
                {/* Step 1: Client */}
                {currentStep === 1 && (
                    <div className="step-client">
                        {/* Selected Client Card */}
                        {formData.selectedClient && (
                            <div className="cl-selected">
                                <div className="cl-selected-avatar">
                                    {formData.selectedClient.full_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div className="cl-selected-info">
                                    <strong>{formData.selectedClient.full_name}</strong>
                                    <span>{formData.selectedClient.phone}</span>
                                    {clientMotos.length > 0 && (
                                        <span className="cl-selected-meta">
                                            {clientMotos.length} moto{clientMotos.length > 1 ? 's' : ''} registrada{clientMotos.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <button
                                    className="cl-change-btn"
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
                                    Cambiar
                                </button>
                            </div>
                        )}

                        {/* New Client Form */}
                        {!formData.selectedClient && formData.isNewClient && (
                            <div className="cl-newform">
                                <div className="cl-newform-head">
                                    <UserPlus size={16} />
                                    <span>Nuevo Cliente</span>
                                    <button
                                        className="btn-clear"
                                        onClick={() => {
                                            setFormData(prev => ({
                                                ...prev,
                                                isNewClient: false,
                                                clientPhone: '',
                                                clientName: '',
                                            }));
                                            setSearchPerformed(false);
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
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

                        {/* Search + Client List */}
                        {!formData.selectedClient && !formData.isNewClient && (() => {
                            const query = formData.clientPhone?.trim() || '';
                            const filteredClients = query.length >= 2
                                ? searchClients(query)
                                : (clients || []).slice(0, 50);
                            const showingAll = query.length < 2;
                            // Compute order counts per client from the orders context
                            const orderCountMap = {};
                            if (typeof orders !== 'undefined' && Array.isArray(orders)) {
                                orders.forEach(o => {
                                    const cid = o.client_id || o.client?.id;
                                    if (cid) orderCountMap[cid] = (orderCountMap[cid] || 0) + 1;
                                });
                            }

                            return (
                                <>
                                    {/* Search Bar */}
                                    <div className="cl-search">
                                        <Search size={18} className="cl-search-icon" />
                                        <input
                                            type="text"
                                            className="cl-search-input"
                                            placeholder="Buscar cliente por nombre o teléfono"
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
                                        {query.length > 0 && (
                                            <button
                                                className="cl-search-clear"
                                                onClick={() => setFormData(prev => ({
                                                    ...prev,
                                                    clientPhone: '',
                                                    selectedClient: null,
                                                    isNewClient: false,
                                                }))}
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Add New Client */}
                                    {canCreateClients() && (
                                        <button
                                            className="cl-add-card"
                                            onClick={() => {
                                                setQuickClientData({ full_name: '', phone: '', email: '', notes: '' });
                                                setQuickMotorcycles([]);
                                                setShowQuickClientModal(true);
                                            }}
                                        >
                                            <Plus size={18} />
                                            <div className="cl-add-text">
                                                <span>Nuevo Cliente</span>
                                                <small>Registrar cliente nuevo</small>
                                            </div>
                                        </button>
                                    )}

                                    {/* Results count */}
                                    <div className="cl-count">
                                        {showingAll
                                            ? `${filteredClients.length} cliente${filteredClients.length !== 1 ? 's' : ''}`
                                            : `${filteredClients.length} resultado${filteredClients.length !== 1 ? 's' : ''}`
                                        }
                                    </div>

                                    {/* Client Cards */}
                                    {filteredClients.length > 0 ? (
                                        <div className="cl-cards">
                                            {filteredClients.map(client => {
                                                const motoCount = client.motorcycles?.length || 0;
                                                const orderCount = orderCountMap[client.id] || 0;
                                                const initial = client.full_name?.charAt(0)?.toUpperCase() || '?';
                                                const isFrequent = orderCount >= 3;
                                                const isNew = orderCount === 0 && motoCount === 0;
                                                return (
                                                    <button
                                                        key={client.id}
                                                        className="cl-card"
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
                                                            setCurrentStep(2);
                                                        }}
                                                    >
                                                        <div className="cl-card-avatar" data-initial={initial}>
                                                            {initial}
                                                        </div>
                                                        <div className="cl-card-body">
                                                            <div className="cl-card-top">
                                                                <span className="cl-card-name">{client.full_name}</span>
                                                                {isFrequent && <span className="cl-badge cl-badge-freq">Frecuente</span>}
                                                                {isNew && <span className="cl-badge cl-badge-new">Nuevo</span>}
                                                            </div>
                                                            <span className="cl-card-phone">{client.phone}</span>
                                                            <div className="cl-card-meta">
                                                                {motoCount > 0 && (
                                                                    <span>{motoCount} moto{motoCount > 1 ? 's' : ''}</span>
                                                                )}
                                                                {orderCount > 0 && (
                                                                    <span>{orderCount} orden{orderCount > 1 ? 'es' : ''}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <ArrowRight size={16} className="cl-card-arrow" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="cl-empty">
                                            <Search size={28} />
                                            <p>No se encontraron clientes</p>
                                            {canCreateClients() && (
                                                <button
                                                    className="cl-empty-btn"
                                                    onClick={() => {
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
                                                    <Plus size={16} />
                                                    Registrar nuevo
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
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
                                            onClick={() => {
                                                setFormData(prev => ({ ...prev, selectedMoto: moto, isNewMoto: false }));
                                                setCurrentStep(3);
                                            }}
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
                            {services.filter(s => s.is_active).map(service => {
                                const labor = parseFloat(service.labor_cost) || 0;
                                const materials = parseFloat(service.materials_cost) || 0;
                                const total = labor + materials || parseFloat(service.base_price) || 0;
                                return (
                                    <label key={service.id} className="service-item">
                                        <input
                                            type="checkbox"
                                            checked={formData.selectedServices.includes(service.id)}
                                            onChange={() => toggleService(service.id)}
                                        />
                                        <div className="service-item-content">
                                            <div className="service-item-header">
                                                <span className="service-name">{service.name}</span>
                                                <span className="service-price">{formatMXN(total)}</span>
                                            </div>
                                            {(labor > 0 || materials > 0) && (
                                                <div className="service-item-breakdown">
                                                    {labor > 0 && <span>Obra: {formatMXN(labor)}</span>}
                                                    {materials > 0 && <span>Refacc: {formatMXN(materials)}</span>}
                                                </div>
                                            )}
                                        </div>
                                        <div className="checkbox-indicator">
                                            {formData.selectedServices.includes(service.id) && <Check size={16} />}
                                        </div>
                                    </label>
                                );
                            })}
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

                        <div className="form-group" style={{ marginTop: '0.75rem' }}>
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
                            <div className="services-summary mt-lg" style={{ marginBottom: '2rem' }}>
                                <h3 className="summary-title">
                                    <DollarSign size={20} /> Resumen de Cotización
                                </h3>

                                {(() => {
                                    const totalLabor = formData.selectedServices.reduce((sum, svcId) => {
                                        const svc = services.find(s => s.id === svcId);
                                        const labor = parseFloat(svc?.labor_cost) || 0;
                                        const materials = parseFloat(svc?.materials_cost) || 0;
                                        const base = parseFloat(svc?.base_price) || 0;
                                        // If labor_cost is set, use it. Otherwise use base_price as labor (legacy services)
                                        return sum + (labor > 0 ? labor : (materials > 0 ? 0 : base));
                                    }, 0) + (parseFloat(formData.customServiceLabor) || 0);

                                    const totalMaterials = formData.selectedServices.reduce((sum, svcId) => {
                                        const svc = services.find(s => s.id === svcId);
                                        return sum + (parseFloat(svc?.materials_cost) || 0);
                                    }, 0) + (parseFloat(formData.customServiceMaterials) || 0);

                                    const grandTotal = totalLabor + totalMaterials;

                                    return (
                                        <div style={{
                                            background: 'white',
                                            borderRadius: '12px',
                                            padding: '20px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                        }}>
                                            {/* Mano de obra */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 0',
                                                borderBottom: '1px solid #f3f4f6'
                                            }}>
                                                <span style={{ fontSize: '0.95rem', color: '#374151' }}>Mano de obra</span>
                                                <span style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>{formatMXN(totalLabor)}</span>
                                            </div>

                                            {/* Refacciones */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px 0',
                                                borderBottom: '1px solid #f3f4f6'
                                            }}>
                                                <span style={{ fontSize: '0.95rem', color: '#374151' }}>Refacciones</span>
                                                <span style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937' }}>{formatMXN(totalMaterials)}</span>
                                            </div>

                                            {/* Total */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '16px 0 4px 0'
                                            }}>
                                                <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1f2937' }}>TOTAL A PAGAR</span>
                                                <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#2563eb' }}>{formatMXN(grandTotal)}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
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
                                        Kilometraje de Ingreso
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
                                        Nivel de Combustible
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
                                { key: 'front', label: 'Frontal' },
                                { key: 'back', label: 'Trasera' },
                                { key: 'leftSide', label: 'Lateral Izq.' },
                                { key: 'rightSide', label: 'Lateral Der.' },
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

                        {/* Master Mechanic Selector for Auxiliaries */}
                        {isAuxiliary && (
                            <div className="master-selector-section">
                                <div className="master-selector-header">
                                    <Crown size={20} />
                                    <div>
                                        <h4>Selecciona tu Mecánico Maestro</h4>
                                        <p>Tu solicitud será enviada para aprobación</p>
                                    </div>
                                </div>
                                <select
                                    className="form-select master-select"
                                    value={selectedMaster || ''}
                                    onChange={(e) => setSelectedMaster(e.target.value)}
                                >
                                    <option value="">-- Selecciona un maestro --</option>
                                    {masterMechanics.map(master => (
                                        <option key={master.id} value={master.id}>
                                            {master.full_name}
                                        </option>
                                    ))}
                                </select>
                                {masterMechanics.length === 0 && (
                                    <p className="no-masters-warning">
                                        <AlertCircle size={16} />
                                        No hay mecánicos maestros disponibles
                                    </p>
                                )}
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

                            <div className="summary-row" style={{ marginBottom: 'var(--spacing-sm)', fontWeight: 'bold' }}>
                                <span>Servicios:</span>
                            </div>

                            {/* List selected services from catalog */}
                            {formData.selectedServices.map(svcId => {
                                const svc = services.find(s => s.id === svcId);
                                if (!svc) return null;
                                return (
                                    <div key={svcId} style={{ paddingLeft: 'var(--spacing-md)', fontSize: '0.9rem', marginBottom: '4px' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>• {svc.name}</span>
                                    </div>
                                );
                            })}

                            {/* Show custom service if exists */}
                            {formData.customService && (
                                <div style={{ paddingLeft: 'var(--spacing-md)', fontSize: '0.9rem', marginBottom: '4px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>• {formData.customService}</span>
                                </div>
                            )}

                            <div className="divider" style={{ margin: 'var(--spacing-sm) 0' }} />

                            {/* Desglose Mano de obra y Refacciones */}
                            {(() => {
                                const totalLabor = formData.selectedServices.reduce((sum, svcId) => {
                                    const svc = services.find(s => s.id === svcId);
                                    const labor = parseFloat(svc?.labor_cost) || 0;
                                    const materials = parseFloat(svc?.materials_cost) || 0;
                                    const base = parseFloat(svc?.base_price) || 0;
                                    // If labor_cost is set, use it. Otherwise use base_price as labor (legacy services)
                                    return sum + (labor > 0 ? labor : (materials > 0 ? 0 : base));
                                }, 0) + (parseFloat(formData.customServiceLabor) || 0);

                                const totalMaterials = formData.selectedServices.reduce((sum, svcId) => {
                                    const svc = services.find(s => s.id === svcId);
                                    return sum + (parseFloat(svc?.materials_cost) || 0);
                                }, 0) + (parseFloat(formData.customServiceMaterials) || 0);

                                const grandTotal = totalLabor + totalMaterials;

                                return (
                                    <>
                                        <div className="summary-row">
                                            <span>Mano de obra:</span>
                                            <strong>{formatMXN(totalLabor)}</strong>
                                        </div>
                                        <div className="summary-row">
                                            <span>Refacciones:</span>
                                            <strong>{formatMXN(totalMaterials)}</strong>
                                        </div>
                                        <div className="summary-row" style={{ marginTop: 'var(--spacing-sm)' }}>
                                            <span style={{ fontWeight: '600' }}>Total Servicios:</span>
                                            <strong className="text-primary" style={{ fontSize: '1.25rem' }}>
                                                {formatMXN(grandTotal)}
                                            </strong>
                                        </div>
                                    </>
                                );
                            })()}

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
                                        {(() => {
                                            const totalLabor = formData.selectedServices.reduce((sum, svcId) => {
                                                const svc = services.find(s => s.id === svcId);
                                                const labor = parseFloat(svc?.labor_cost) || 0;
                                                const materials = parseFloat(svc?.materials_cost) || 0;
                                                const base = parseFloat(svc?.base_price) || 0;
                                                return sum + (labor > 0 ? labor : (materials > 0 ? 0 : base));
                                            }, 0) + (parseFloat(formData.customServiceLabor) || 0);
                                            const totalMaterials = formData.selectedServices.reduce((sum, svcId) => {
                                                const svc = services.find(s => s.id === svcId);
                                                return sum + (parseFloat(svc?.materials_cost) || 0);
                                            }, 0) + (parseFloat(formData.customServiceMaterials) || 0);
                                            return formatMXN((totalLabor + totalMaterials) - (parseFloat(formData.advanceAmount) || 0));
                                        })()}
                                    </strong>
                                </div>
                            )}

                            {/* Entry Photos Preview */}
                            {(formData.entryPhotos.front || formData.entryPhotos.back || formData.entryPhotos.leftSide || formData.entryPhotos.rightSide) && (
                                <div className="summary-photos-section">
                                    <h4 className="photos-section-title">Fotos de Ingreso</h4>
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
                                        Descargar Resumen con Fotos
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation Buttons - Steps 1-4 */}
            {currentStep < 5 && (
                <div className="step-navigation">
                    {currentStep > 1 && (
                        <button
                            className="no-nav-back"
                            onClick={prevStep}
                        >
                            <ArrowLeft size={18} />
                            Atrás
                        </button>
                    )}
                    <button
                        className="no-nav-cta"
                        onClick={nextStep}
                        disabled={!canProceed()}
                        style={{ flex: currentStep === 1 ? 1 : 2 }}
                    >
                        Continuar
                        <ArrowRight size={18} />
                    </button>
                </div>
            )}

            {/* Submit Button - Solo en paso 5 */}
            {currentStep === 5 && (
                <div className="step-navigation">
                    <button
                        className="no-nav-cta"
                        onClick={handleSubmit}
                        disabled={loading || !canProceed()}
                        style={{ flex: 1 }}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" />
                                Creando...
                            </>
                        ) : (
                            <>
                                {isAuxiliary ? (
                                    <>
                                        <Send size={20} />
                                        Enviar Solicitud
                                    </>
                                ) : (
                                    <>
                                        <Check size={20} />
                                        Crear Orden
                                    </>
                                )}
                            </>
                        )}
                    </button>
                </div>
            )}

            <style>{`
        .new-order {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          overflow: hidden;
          background: #F3F4F6;
          padding: 16px 16px 0 16px;
        }

        /* ===== HEADER ===== */
        .no-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
          flex-shrink: 0;
        }

        .no-back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: 1px solid #E5E7EB;
          background: white;
          border-radius: 10px;
          cursor: pointer;
          color: #374151;
          transition: all 0.15s;
          flex-shrink: 0;
        }

        .no-back-btn:hover {
          background: #F9FAFB;
          border-color: #D1D5DB;
        }

        .no-header-text {
          display: flex;
          flex-direction: column;
        }

        .no-title {
          font-size: 18px;
          font-weight: 700;
          color: #111827;
          margin: 0;
          line-height: 1.2;
        }

        .no-step-indicator {
          font-size: 12px;
          font-weight: 500;
          color: #9CA3AF;
          letter-spacing: 0.02em;
        }

        /* ===== PROGRESS BAR ===== */
        .no-progress {
          height: 4px;
          background: #E5E7EB;
          border-radius: 2px;
          margin-bottom: 16px;
          overflow: hidden;
        }

        .no-progress-fill {
          height: 100%;
          background: #111827;
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        /* ===== STEP CONTEXT ===== */
        .no-progress {
          flex-shrink: 0;
        }

        .no-step-context {
          font-size: 14px;
          color: #6B7280;
          margin: 0 0 12px 0;
          flex-shrink: 0;
        }

        .step-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow-y: auto;
          margin-bottom: 0;
          padding-bottom: 24px;
        }

        .step-client {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        /* ===== CLIENT STEP (cl- namespace) ===== */

        /* --- Search Bar --- */
        .cl-search {
          position: relative;
          display: flex;
          align-items: center;
          margin-bottom: 12px;
          flex-shrink: 0;
        }

        .cl-search-icon {
          position: absolute;
          left: 16px;
          color: #9CA3AF;
          pointer-events: none;
          z-index: 1;
        }

        .cl-search-input {
          width: 100%;
          height: 56px;
          padding: 0 48px 0 48px;
          font-size: 15px;
          font-family: inherit;
          color: #111827;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .cl-search-input:focus {
          outline: none;
          border-color: #111827;
          box-shadow: 0 0 0 2px rgba(17, 24, 39, 0.08);
        }

        .cl-search-input::placeholder {
          color: #9CA3AF;
        }

        .cl-search-clear {
          position: absolute;
          right: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          background: #F3F4F6;
          color: #6B7280;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .cl-search-clear:hover {
          background: #E5E7EB;
          color: #111827;
        }

        /* --- Add Client Card --- */
        .cl-add-card {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 12px 16px;
          background: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
          margin-bottom: 16px;
          color: #374151;
          flex-shrink: 0;
        }

        .cl-add-card:hover {
          background: #F3F4F6;
          border-color: #D1D5DB;
        }

        .cl-add-card svg {
          flex-shrink: 0;
          color: #6B7280;
        }

        .cl-add-text {
          display: flex;
          flex-direction: column;
          text-align: left;
        }

        .cl-add-text span {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
        }

        .cl-add-text small {
          font-size: 12px;
          color: #9CA3AF;
        }

        /* --- Results Count --- */
        .cl-count {
          font-size: 12px;
          font-weight: 500;
          color: #9CA3AF;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 0 4px 8px;
          flex-shrink: 0;
        }

        /* --- Client Cards Container --- */
        .cl-cards {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding-right: 2px;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
        }

        .cl-cards::-webkit-scrollbar {
          width: 3px;
        }

        .cl-cards::-webkit-scrollbar-thumb {
          background: #D1D5DB;
          border-radius: 3px;
        }

        .cl-cards::-webkit-scrollbar-track {
          background: transparent;
        }

        /* --- Individual Client Card --- */
        .cl-card {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 14px 16px;
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
          text-align: left;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }

        .cl-card:hover {
          border-color: #D1D5DB;
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        }

        .cl-card:active {
          transform: scale(0.995);
          background: #FAFAFA;
        }

        /* --- Card Avatar --- */
        .cl-card-avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          flex-shrink: 0;
          color: white;
          background: #6B7280;
        }

        .cl-card-avatar[data-initial="A"],
        .cl-card-avatar[data-initial="B"] { background: #4F46E5; }
        .cl-card-avatar[data-initial="C"],
        .cl-card-avatar[data-initial="D"] { background: #0284C7; }
        .cl-card-avatar[data-initial="E"],
        .cl-card-avatar[data-initial="F"] { background: #0D9488; }
        .cl-card-avatar[data-initial="G"],
        .cl-card-avatar[data-initial="H"] { background: #16A34A; }
        .cl-card-avatar[data-initial="I"],
        .cl-card-avatar[data-initial="J"] { background: #D97706; }
        .cl-card-avatar[data-initial="K"],
        .cl-card-avatar[data-initial="L"] { background: #DC2626; }
        .cl-card-avatar[data-initial="M"],
        .cl-card-avatar[data-initial="N"] { background: #7C3AED; }
        .cl-card-avatar[data-initial="O"],
        .cl-card-avatar[data-initial="P"] { background: #DB2777; }
        .cl-card-avatar[data-initial="Q"],
        .cl-card-avatar[data-initial="R"] { background: #0891B2; }
        .cl-card-avatar[data-initial="S"],
        .cl-card-avatar[data-initial="T"] { background: #1D4ED8; }
        .cl-card-avatar[data-initial="U"],
        .cl-card-avatar[data-initial="V"] { background: #9333EA; }
        .cl-card-avatar[data-initial="W"],
        .cl-card-avatar[data-initial="X"],
        .cl-card-avatar[data-initial="Y"],
        .cl-card-avatar[data-initial="Z"] { background: #EA580C; }

        /* --- Card Body --- */
        .cl-card-body {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          gap: 1px;
        }

        .cl-card-top {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .cl-card-name {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cl-card-phone {
          font-size: 12px;
          color: #6B7280;
          font-variant-numeric: tabular-nums;
        }

        .cl-card-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 2px;
        }

        .cl-card-meta span {
          font-size: 11px;
          color: #9CA3AF;
        }

        .cl-card-arrow {
          color: #D1D5DB;
          flex-shrink: 0;
          transition: transform 0.15s;
        }

        .cl-card:hover .cl-card-arrow {
          color: #9CA3AF;
          transform: translateX(2px);
        }

        /* --- Badges --- */
        .cl-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.03em;
          padding: 2px 7px;
          border-radius: 6px;
          text-transform: uppercase;
          flex-shrink: 0;
        }

        .cl-badge-freq {
          background: #ECFDF5;
          color: #059669;
        }

        .cl-badge-new {
          background: #F3F4F6;
          color: #9CA3AF;
        }

        /* --- Selected Client --- */
        .cl-selected {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: white;
          border: 2px solid #111827;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }

        .cl-selected-avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: #111827;
          color: white;
          font-size: 16px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .cl-selected-info {
          display: flex;
          flex-direction: column;
          gap: 1px;
          flex: 1;
          min-width: 0;
        }

        .cl-selected-info strong {
          font-size: 15px;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cl-selected-info > span {
          font-size: 13px;
          color: #6B7280;
        }

        .cl-selected-meta {
          font-size: 12px;
          color: #9CA3AF;
        }

        .cl-change-btn {
          padding: 6px 14px;
          border: 1px solid #E5E7EB;
          background: #F9FAFB;
          color: #374151;
          font-size: 12px;
          font-weight: 600;
          font-family: inherit;
          border-radius: 8px;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          transition: all 0.15s;
        }

        .cl-change-btn:hover {
          background: #F3F4F6;
          border-color: #D1D5DB;
          color: #111827;
        }

        /* --- New Client Form --- */
        .cl-newform {
          background: white;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .cl-newform-head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: #F3F4F6;
          border-radius: 8px;
          margin-bottom: 16px;
          color: #374151;
          font-weight: 600;
          font-size: 14px;
        }

        .cl-newform-head .btn-clear {
          margin-left: auto;
        }

        /* --- Empty State --- */
        .cl-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 40px 20px;
          color: #9CA3AF;
          text-align: center;
        }

        .cl-empty p {
          font-size: 14px;
          margin: 0;
          color: #6B7280;
        }

        .cl-empty-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: none;
          background: #111827;
          color: white;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .cl-empty-btn:hover {
          background: #1F2937;
        }

        /* Legacy styles kept for other steps */
        .btn-clear {
          margin-left: auto;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #E5E7EB;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          color: #6B7280;
          transition: all 0.15s;
        }

        .btn-clear:hover {
          background: #DC2626;
          color: white;
        }

        .input-with-icon {
          position: relative;
        }

        .input-with-icon .form-input {
          padding-left: 48px;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #9CA3AF;
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
          gap: 10px;
        }

        .service-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 16px;
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
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .service-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .service-name {
          font-weight: 600;
          font-size: 0.9375rem;
          color: #1f2937;
        }

        .service-price {
          color: var(--primary);
          font-weight: 700;
          font-size: 0.9375rem;
          white-space: nowrap;
        }

        .service-item-breakdown {
          display: flex;
          gap: 16px;
          font-size: 0.75rem;
          color: #6b7280;
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
          overflow: visible;
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
          flex-shrink: 0;
          display: flex;
          gap: 10px;
          padding: 12px 16px;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          background: white;
          border-top: 1px solid #E5E7EB;
          z-index: 100;
          box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
        }

        .no-nav-back {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #E5E7EB;
          background: white;
          color: #374151;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .no-nav-back:hover {
          background: #F9FAFB;
          border-color: #D1D5DB;
        }

        .no-nav-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex: 2;
          padding: 14px 20px;
          border: none;
          background: #111827;
          color: white;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .no-nav-cta:hover {
          background: #1F2937;
        }

        .no-nav-cta:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .step-navigation .btn {
          flex: 1;
        }

        .step-navigation .btn-primary {
          flex: 2;
        }

        /* Master Mechanic Selector */
        .master-selector-section {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(249, 115, 22, 0.05) 100%);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: var(--radius-lg);
          padding: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
        }

        .master-selector-header {
          display: flex;
          align-items: flex-start;
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-md);
          color: var(--warning);
        }

        .master-selector-header h4 {
          font-size: 1rem;
          font-weight: 600;
          margin: 0;
          color: var(--text-primary);
        }

        .master-selector-header p {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 0;
        }

        .master-select {
          width: 100%;
          padding: var(--spacing-md);
          background: var(--bg-card);
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: 1rem;
          font-weight: 500;
        }

        .master-select:focus {
          border-color: var(--warning);
          outline: none;
        }

        .no-masters-warning {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          color: var(--danger);
          font-size: 0.875rem;
          margin-top: var(--spacing-sm);
        }

        /* Quick Client Button */
        .btn-quick-client {
          background: linear-gradient(135deg, var(--secondary) 0%, #059669 100%) !important;
          color: white !important;
          border: none !important;
          padding: var(--spacing-md) !important;
          font-weight: 600;
          margin-bottom: var(--spacing-md);
        }

        .btn-quick-client:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        .search-divider {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-md);
          color: var(--text-muted);
          font-size: 0.875rem;
        }

        .search-divider::before,
        .search-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-color);
        }

        /* Quick Client Modal Styles */
        .quick-client-modal {
          max-height: 90vh;
          overflow-y: auto;
        }

        .quick-client-modal .modal-body {
          padding: var(--spacing-lg);
        }

        .form-section {
          margin-bottom: var(--spacing-lg);
        }

        .form-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-md);
        }

        .form-section-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .motos-form-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .moto-form-item {
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: var(--spacing-md);
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
          color: var(--secondary);
        }

        .empty-message {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-lg);
          color: var(--text-muted);
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          font-size: 0.875rem;
        }
      `}</style>

            {/* Quick Client Creation Modal */}
            {showQuickClientModal && (
                <div className="modal-overlay" onClick={() => setShowQuickClientModal(false)}>
                    <div className="modal modal-large quick-client-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                <UserPlus size={22} />
                                Nuevo Cliente
                            </h3>
                            <button className="modal-close" onClick={() => setShowQuickClientModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Client Info */}
                            <div className="form-section">
                                <h4 className="form-section-title">
                                    <User size={18} />
                                    Datos del Cliente
                                </h4>

                                <div className="form-group">
                                    <label className="form-label">
                                        Nombre Completo <span style={{ color: 'var(--danger)' }}>*</span>
                                    </label>
                                    <div className="input-with-icon">
                                        <User className="input-icon" size={20} />
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="Juan Pérez"
                                            value={quickClientData.full_name}
                                            onChange={e => setQuickClientData(prev => ({ ...prev, full_name: e.target.value }))}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">
                                        Teléfono <span style={{ color: 'var(--danger)' }}>*</span>
                                    </label>
                                    <div className="input-with-icon">
                                        <Phone className="input-icon" size={20} />
                                        <input
                                            type="tel"
                                            className="form-input"
                                            placeholder="10 dígitos"
                                            value={quickClientData.phone}
                                            onChange={e => setQuickClientData(prev => ({
                                                ...prev,
                                                phone: e.target.value.replace(/\D/g, '').slice(0, 10)
                                            }))}
                                            maxLength={10}
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
                                            value={quickClientData.email}
                                            onChange={e => setQuickClientData(prev => ({ ...prev, email: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Notas (opcional)</label>
                                    <textarea
                                        className="form-textarea"
                                        placeholder="Información adicional del cliente..."
                                        value={quickClientData.notes}
                                        onChange={e => setQuickClientData(prev => ({ ...prev, notes: e.target.value }))}
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
                                        onClick={addQuickMoto}
                                    >
                                        <Plus size={16} />
                                        Agregar Moto
                                    </button>
                                </div>

                                {quickMotorcycles.length === 0 ? (
                                    <div className="empty-message">
                                        <AlertCircle size={20} />
                                        <span>Sin motocicletas (puedes agregarlas después)</span>
                                    </div>
                                ) : (
                                    <div className="motos-form-list">
                                        {quickMotorcycles.map((moto, index) => (
                                            <div key={moto.id} className="moto-form-item">
                                                <div className="moto-form-header">
                                                    <span className="moto-number">Moto #{index + 1}</span>
                                                    <button
                                                        type="button"
                                                        className="btn-icon-small btn-delete"
                                                        onClick={() => removeQuickMoto(index)}
                                                        style={{
                                                            width: '28px',
                                                            height: '28px',
                                                            borderRadius: '6px',
                                                            border: 'none',
                                                            background: 'rgba(239, 68, 68, 0.1)',
                                                            color: 'var(--danger)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>

                                                <div className="grid grid-2">
                                                    <div className="form-group">
                                                        <label className="form-label">Marca *</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="Honda"
                                                            value={moto.brand}
                                                            onChange={e => updateQuickMoto(index, 'brand', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Modelo *</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="CB500X"
                                                            value={moto.model}
                                                            onChange={e => updateQuickMoto(index, 'model', e.target.value)}
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
                                                            value={moto.year}
                                                            onChange={e => updateQuickMoto(index, 'year', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Placas</label>
                                                        <input
                                                            type="text"
                                                            className="form-input"
                                                            placeholder="ABC-123"
                                                            value={moto.plates}
                                                            onChange={e => updateQuickMoto(index, 'plates', e.target.value.toUpperCase())}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="form-group">
                                                    <label className="form-label">Color</label>
                                                    <input
                                                        type="text"
                                                        className="form-input"
                                                        placeholder="Negro, Rojo..."
                                                        value={moto.color}
                                                        onChange={e => updateQuickMoto(index, 'color', e.target.value)}
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
                                onClick={() => setShowQuickClientModal(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSaveQuickClient}
                                disabled={!quickClientData.full_name.trim() || !quickClientData.phone.trim() || savingQuickClient}
                            >
                                {savingQuickClient ? (
                                    <>
                                        <Loader2 size={18} className="spinner" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Check size={18} />
                                        Crear Cliente
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
