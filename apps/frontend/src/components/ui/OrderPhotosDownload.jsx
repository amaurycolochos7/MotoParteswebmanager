// OrderPhotosDownload - Componente para mostrar fotos guardadas y descargar resumen
import { useState, useEffect } from 'react';
import { Download, Camera, Loader2, ImageIcon, Trash2 } from 'lucide-react';
import { getOrderPhotos, deleteOrderPhotos } from '../../services/photoStorageService';

export default function OrderPhotosDownload({ orderId, order, showAsButton = false }) {
    const [photos, setPhotos] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (orderId) {
            const savedPhotos = getOrderPhotos(orderId);
            setPhotos(savedPhotos);
        }
    }, [orderId]);

    // If no photos, still show button but disabled when showAsButton is true
    const hasPhotos = photos !== null;

    const formatMXN = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    const handleDownload = async () => {
        setDownloading(true);

        try {
            // Fetch photos fresh at download time to ensure we have latest data
            const freshPhotos = getOrderPhotos(orderId);
            console.log('📥 Fotos para descarga:', freshPhotos ? 'Encontradas' : 'No hay fotos guardadas');

            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = `
                position: fixed;
                top: 0;
                left: -9999px;
                width: 1200px;
                background: #ffffff;
                padding: 0;
                z-index: 9999;
                font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            `;

            // Use freshPhotos data if available, otherwise use order data
            const clientName = freshPhotos?.clientName || order?.client?.full_name || 'N/A';
            const clientPhone = freshPhotos?.clientPhone || order?.client?.phone || '';
            const motoInfo = freshPhotos?.motoInfo || `${order?.motorcycle?.brand || ''} ${order?.motorcycle?.model || ''}` || 'N/A';
            const motoYear = freshPhotos?.motoYear || order?.motorcycle?.year || '';
            const motoPlates = freshPhotos?.motoPlates || order?.motorcycle?.plates || '';
            const services = freshPhotos?.services || order?.services || [];
            const totalAmount = freshPhotos?.totalAmount || order?.total_amount || 0;
            const damageDescription = freshPhotos?.damageDescription || '';
            const entryPhotos = freshPhotos?.entryPhotos || {};
            const additionalPhotos = freshPhotos?.additionalPhotos || [];

            // Get labor and parts breakdown from saved photos or order
            const laborTotal = freshPhotos?.laborTotal || order?.labor_total || 0;
            const partsTotal = freshPhotos?.partsTotal || order?.parts_total || 0;

            console.log('📸 Entry photos disponibles:', Object.keys(entryPhotos).filter(k => entryPhotos[k]).length);

            const servicesList = services.map(svc =>
                `<div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px;">
                    <span style="color: #1e293b;">${svc.name || 'Servicio'}</span>
                    <span style="font-weight: 700; color: #1e293b;">${formatMXN(svc.price || 0)}</span>
                </div>`
            ).join('');

            // Create breakdown section if there's materials cost
            const breakdownSection = partsTotal > 0 ? `
                <div style="margin-top: 8px; padding: 10px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                        <span style="color: #64748b;">Mano de Obra</span>
                        <span style="font-weight: 600; color: #334155;">${formatMXN(laborTotal)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 12px;">
                        <span style="color: #64748b;">Refacciones</span>
                        <span style="font-weight: 600; color: #334155;">${formatMXN(partsTotal)}</span>
                    </div>
                </div>
            ` : '';

            tempContainer.innerHTML = `
                <!-- HEADER PREMIUM - Fondo Blanco Profesional -->
                <div style="background: white; border-bottom: 4px solid #dc2626;">
                    <div style="padding: 28px 40px; display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 20px;">
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
                            <div style="background: #1a1a2e; color: white; padding: 12px 20px; border-radius: 10px; display: inline-block; margin-bottom: 8px;">
                                <span style="font-size: 11px; opacity: 0.7; display: block;">ORDEN DE SERVICIO</span>
                                <span style="font-size: 22px; font-weight: 900; letter-spacing: 1px;">${order?.order_number || 'N/A'}</span>
                            </div>
                            <p style="margin: 0; font-size: 13px; color: #888;">${new Date().toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        </div>
                    </div>
                </div>

                <!-- CONTENIDO PRINCIPAL -->
                <div style="display: grid; grid-template-columns: 380px 1fr; min-height: 400px;">
                    
                    <!-- PANEL IZQUIERDO -->
                    <div style="background: #fafafa; padding: 32px; border-right: 2px solid #e5e5e5;">
                        
                        <div style="margin-bottom: 28px;">
                            <p style="margin: 0 0 8px 0; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Cliente</p>
                            <p style="margin: 0; font-size: 22px; font-weight: 700; color: #1a1a2e;">${clientName}</p>
                            ${clientPhone ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${clientPhone}</p>` : ''}
                        </div>

                        <div style="margin-bottom: 28px;">
                            <p style="margin: 0 0 8px 0; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Vehículo</p>
                            <p style="margin: 0; font-size: 22px; font-weight: 700; color: #1a1a2e;">${motoInfo}</p>
                            <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">${motoYear ? `${motoYear}` : ''} ${motoPlates ? `• ${motoPlates}` : ''}</p>
                        </div>

                        <div style="background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; margin-bottom: 20px;">
                            <div style="padding: 14px 20px; background: #dc2626;">
                                <p style="margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: white;">Servicios</p>
                            </div>
                            <div style="padding: 16px 20px;">
                                ${servicesList}
                                ${breakdownSection}
                                <div style="display: flex; justify-content: space-between; padding: 16px 0 0 0; margin-top: 12px; border-top: 2px solid #1a1a2e;">
                                    <span style="font-size: 16px; font-weight: 800; color: #1a1a2e;">TOTAL</span>
                                    <span style="font-size: 22px; font-weight: 900; color: #dc2626;">${formatMXN(totalAmount)}</span>
                                </div>
                            </div>
                        </div>

                        ${damageDescription ? `
                            <div style="background: #fffbeb; border: 1px solid #fcd34d; padding: 16px; border-radius: 10px;">
                                <p style="margin: 0 0 6px 0; font-size: 11px; color: #92400e; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Observaciones</p>
                                <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.5;">${damageDescription}</p>
                            </div>
                        ` : ''}
                    </div>

                    <!-- PANEL DERECHO - FOTOS -->
                    <div style="padding: 32px; background: white;">
                        <p style="margin: 0 0 20px 0; font-size: 13px; color: #888; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Registro Fotográfico</p>
                        
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                            ${entryPhotos?.front ? `
                                <div style="border-radius: 12px; overflow: hidden; aspect-ratio: 4/3; background: #f0f0f0;">
                                    <img src="${entryPhotos.front}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                            ` : ''}
                            ${entryPhotos?.back ? `
                                <div style="border-radius: 12px; overflow: hidden; aspect-ratio: 4/3; background: #f0f0f0;">
                                    <img src="${entryPhotos.back}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                            ` : ''}
                            ${entryPhotos?.leftSide ? `
                                <div style="border-radius: 12px; overflow: hidden; aspect-ratio: 4/3; background: #f0f0f0;">
                                    <img src="${entryPhotos.leftSide}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                            ` : ''}
                            ${entryPhotos?.rightSide ? `
                                <div style="border-radius: 12px; overflow: hidden; aspect-ratio: 4/3; background: #f0f0f0;">
                                    <img src="${entryPhotos.rightSide}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                            ` : ''}
                        </div>

                        ${(additionalPhotos?.length > 0) ? `
                            <div style="margin-top: 24px;">
                                <p style="margin: 0 0 12px 0; font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase;">Fotos adicionales</p>
                                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                    ${additionalPhotos.map(p => `<img src="${p}" style="width: 100px; height: 75px; object-fit: cover; border-radius: 8px;" />`).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="background: #1a1a2e; color: white; padding: 18px 40px; display: flex; justify-content: space-between; align-items: center;">
                    <p style="margin: 0; font-size: 12px; opacity: 0.7;">Documento generado automáticamente</p>
                    <p style="margin: 0; font-size: 13px; font-weight: 600;">MotoPartes Club © ${new Date().getFullYear()}</p>
                </div>
            `;

            document.body.appendChild(tempContainer);
            await new Promise(resolve => setTimeout(resolve, 800));

            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(tempContainer, {
                scale: 3, // ULTRA HD QUALITY
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff'
            });

            const link = document.createElement('a');
            link.download = `orden-${order?.order_number || orderId}-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            document.body.removeChild(tempContainer);
        } catch (e) {
            console.error('Error al descargar:', e);
            alert('❌ Error al generar la imagen');
        } finally {
            setDownloading(false);
        }
    };

    const handleDeletePhotos = () => {
        if (confirm('¿Eliminar las fotos guardadas? Esta acción no se puede deshacer.')) {
            deleteOrderPhotos(orderId);
            setPhotos(null);
        }
    };

    // Render as a simple button in quick actions
    if (showAsButton) {
        return (
            <button
                className="btn btn-outline btn-full"
                onClick={handleDownload}
                disabled={downloading}
                style={{
                    background: downloading ? '#f1f5f9' : 'white',
                    borderColor: '#2563eb',
                    color: '#2563eb'
                }}
            >
                {downloading ? (
                    <>
                        <Loader2 size={18} className="spin" />
                        Generando...
                    </>
                ) : (
                    <>
                        <Download size={18} />
                        Descargar Orden
                    </>
                )}
            </button>
        );
    }

    // Original card render (if not showAsButton)
    if (!hasPhotos) return null;

    return (
        <div className="order-photos-section" style={{ marginTop: '16px' }}>
            <div
                className="card"
                style={{
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                    border: '1px solid #bae6fd'
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        padding: '16px'
                    }}
                    onClick={() => setExpanded(!expanded)}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: '#0ea5e9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Camera size={20} color="white" />
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#0c4a6e' }}>
                                📸 Fotos de Ingreso Guardadas
                            </h4>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#0369a1' }}>
                                {Object.values(photos.entryPhotos || {}).filter(Boolean).length} fotos principales
                                {photos.additionalPhotos?.length > 0 && ` + ${photos.additionalPhotos.length} adicionales`}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                            disabled={downloading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '10px 16px',
                                background: downloading ? '#94a3b8' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: '600',
                                fontSize: '13px',
                                cursor: downloading ? 'wait' : 'pointer',
                                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
                            }}
                        >
                            {downloading ? (
                                <>
                                    <Loader2 size={16} className="spin" />
                                    Generando...
                                </>
                            ) : (
                                <>
                                    <Download size={16} />
                                    Descargar Resumen
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {expanded && (
                    <div style={{ padding: '0 16px 16px 16px' }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '8px',
                            marginBottom: '12px'
                        }}>
                            {photos.entryPhotos?.front && (
                                <div style={{ position: 'relative' }}>
                                    <img src={photos.entryPhotos.front} alt="Frontal" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px' }} />
                                    <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>FRONTAL</span>
                                </div>
                            )}
                            {photos.entryPhotos?.back && (
                                <div style={{ position: 'relative' }}>
                                    <img src={photos.entryPhotos.back} alt="Trasera" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px' }} />
                                    <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>TRASERA</span>
                                </div>
                            )}
                            {photos.entryPhotos?.leftSide && (
                                <div style={{ position: 'relative' }}>
                                    <img src={photos.entryPhotos.leftSide} alt="Lat. Izq" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px' }} />
                                    <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>LAT. IZQ</span>
                                </div>
                            )}
                            {photos.entryPhotos?.rightSide && (
                                <div style={{ position: 'relative' }}>
                                    <img src={photos.entryPhotos.rightSide} alt="Lat. Der" style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '8px' }} />
                                    <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>LAT. DER</span>
                                </div>
                            )}
                        </div>

                        {photos.damageDescription && (
                            <div style={{
                                background: '#fef3c7',
                                padding: '12px',
                                borderRadius: '8px',
                                marginBottom: '12px',
                                borderLeft: '4px solid #f59e0b'
                            }}>
                                <p style={{ margin: 0, fontSize: '12px', color: '#92400e' }}>
                                    <strong>⚠️ Daños:</strong> {photos.damageDescription}
                                </p>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleDeletePhotos}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '6px 12px',
                                    background: 'transparent',
                                    color: '#ef4444',
                                    border: '1px solid #fecaca',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                <Trash2 size={12} />
                                Eliminar fotos
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
