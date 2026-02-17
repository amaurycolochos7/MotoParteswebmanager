// PaymentReceiptDownload - Genera y descarga imagen de comprobante de pago
// PROFESSIONAL DESIGN: Clean, formal, no emojis
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export async function generatePaymentReceipt(payment, autoDownload = true) {
    const formatMXN = (amount) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    // Format date: "21 de diciembre de 2025"
    const formatDateOnly = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-MX', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    };

    // Format time: "02:27 a.m."
    const formatTimeOnly = (dateString) => {
        return new Date(dateString).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const formatShortDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const masterName = payment.master?.full_name || payment.master_name || 'Mecánico Maestro';
    const auxiliaryName = payment.auxiliary?.full_name || payment.auxiliary_name || 'Mecánico Auxiliar';
    const ordersList = payment.orders_summary || [];
    const commissionRate = payment.commission_percentage || 50;

    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: -9999px;
        width: 700px;
        background: #ffffff;
        padding: 0;
        z-index: 9999;
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', Arial, sans-serif;
    `;

    // Generate order rows if available
    const ordersRows = ordersList.length > 0
        ? ordersList.map((order, idx) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 16px 20px; font-size: 14px; font-weight: 600; color: #1a1a2e;">${order.order_number || `ORD-${String(idx + 1).padStart(3, '0')}`}</td>
                <td style="padding: 16px 20px; font-size: 14px; color: #4a5568;">${order.motorcycle || '—'}</td>
                <td style="padding: 16px 20px; font-size: 14px; font-weight: 700; text-align: right; color: #10b981;">${formatMXN(order.commission || 0)}</td>
            </tr>
        `).join('')
        : '';

    tempContainer.innerHTML = `
        <!-- HEADER PROFESIONAL -->
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); padding: 40px; position: relative; overflow: hidden;">
            <!-- Logo watermark background -->
            <div style="position: absolute; right: -20px; top: 50%; transform: translateY(-50%); opacity: 0.08;">
                <img src="/logo-motopartes.png" style="width: 200px; height: auto;" onerror="this.style.display='none'" />
            </div>
            
            <div style="display: flex; align-items: flex-start; justify-content: space-between; position: relative; z-index: 1;">
                <div>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="width: 56px; height: 56px; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <div>
                            <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
                                COMPROBANTE DE PAGO
                            </h1>
                            <p style="margin: 6px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.7); letter-spacing: 0.3px;">
                                Documento válido como constancia de pago
                            </p>
                        </div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); padding: 20px 28px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.15);">
                        <span style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1.5px; display: block; margin-bottom: 6px;">Monto Total</span>
                        <span style="font-size: 36px; font-weight: 900; color: #10b981;">${formatMXN(payment.total_amount)}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- PARTES INVOLUCRADAS -->
        <div style="padding: 32px 40px; background: #fafbfc; border-bottom: 1px solid #e2e8f0;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <span style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600;">Pagado por</span>
                    </div>
                    <div style="background: white; padding: 20px 24px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a2e;">${masterName}</p>
                        <p style="margin: 6px 0 0 0; font-size: 13px; color: #64748b; font-weight: 500;">Mecánico Maestro</p>
                    </div>
                </div>
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600;">Recibido por</span>
                    </div>
                    <div style="background: white; padding: 20px 24px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
                        <p style="margin: 0; font-size: 20px; font-weight: 700; color: #1a1a2e;">${auxiliaryName}</p>
                        <p style="margin: 6px 0 0 0; font-size: 13px; color: #64748b; font-weight: 500;">Mecánico Auxiliar</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- FECHAS - Formato mejorado: fecha arriba, hora abajo -->
        <div style="padding: 24px 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; background: white; border-bottom: 1px solid #e2e8f0;">
            <div>
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Fecha de Emisión</span>
                </div>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #334155;">${formatDateOnly(payment.created_at)}</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #64748b;">${formatTimeOnly(payment.created_at)}</p>
            </div>
            <div>
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span style="font-size: 11px; color: #10b981; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Fecha de Aceptación</span>
                </div>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #10b981;">${formatDateOnly(payment.responded_at || payment.created_at)}</p>
                <p style="margin: 4px 0 0 0; font-size: 14px; color: #059669;">${formatTimeOnly(payment.responded_at || payment.created_at)}</p>
            </div>
        </div>

        <!-- DETALLE DE ÓRDENES (si existen) -->
        ${ordersList.length > 0 ? `
        <div style="padding: 32px 40px; background: white;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#334155" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.5px;">
                    Detalle de Servicios Realizados
                </h3>
            </div>
            <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
                <thead>
                    <tr style="background: #1a1a2e;">
                        <th style="padding: 16px 20px; text-align: left; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 0.8px;">Folio</th>
                        <th style="padding: 16px 20px; text-align: left; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 0.8px;">Unidad</th>
                        <th style="padding: 16px 20px; text-align: right; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.9); text-transform: uppercase; letter-spacing: 0.8px;">Tu Ganancia</th>
                    </tr>
                </thead>
                <tbody>
                    ${ordersRows}
                </tbody>
            </table>
        </div>
        ` : `
        <div style="padding: 32px 40px; background: white;">
            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border: 1px solid #a7f3d0; border-radius: 12px; padding: 28px 32px;">
                <div style="display: flex; align-items: flex-start; gap: 16px;">
                    <div style="width: 40px; height: 40px; background: #10b981; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <div>
                        <p style="margin: 0 0 8px 0; color: #166534; font-size: 15px; font-weight: 700;">
                            Pago correspondiente al período de trabajo indicado
                        </p>
                        <p style="margin: 0; color: #15803d; font-size: 13px; line-height: 1.6;">
                            El detalle completo de las órdenes realizadas puede consultarse en la sección 
                            "Historial de Órdenes" del panel de control del sistema.
                        </p>
                    </div>
                </div>
            </div>
        </div>
        `}

        <!-- RESUMEN FINANCIERO -->
        <div style="margin: 0 40px 32px 40px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-radius: 16px; padding: 28px 32px; border: 2px solid #e2e8f0;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                <span style="font-size: 15px; color: #475569; font-weight: 500;">Mano de obra generada:</span>
                <span style="font-size: 17px; font-weight: 700; color: #1e293b;">${formatMXN(payment.labor_amount)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0;">
                <span style="font-size: 15px; color: #475569; font-weight: 500;">Porcentaje de comisión:</span>
                <span style="font-size: 17px; font-weight: 700; color: #1e293b;">${commissionRate}%</span>
            </div>
            <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius: 12px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 18px; font-weight: 700; color: rgba(255,255,255,0.9);">GANANCIA NETA:</span>
                <span style="font-size: 32px; font-weight: 900; color: white;">${formatMXN(payment.total_amount)}</span>
            </div>
        </div>

        ${payment.notes ? `
        <div style="margin: 0 40px 32px 40px; padding: 20px 24px; background: #fffbeb; border-radius: 12px; border-left: 4px solid #f59e0b;">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <path d="M14 2v6h6"></path>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                <div>
                    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px;">Observaciones</p>
                    <p style="margin: 0; font-size: 14px; color: #78350f; line-height: 1.5;">${payment.notes}</p>
                </div>
            </div>
        </div>
        ` : ''}

        <!-- FOOTER PROFESIONAL -->
        <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 24px 40px; position: relative; overflow: hidden;">
            <!-- Logo watermark -->
            <div style="position: absolute; left: 40px; top: 50%; transform: translateY(-50%); opacity: 0.1;">
                <img src="/logo-motopartes.png" style="width: 80px; height: auto;" onerror="this.style.display='none'" />
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1;">
                <div>
                    <p style="margin: 0; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9);">
                        MotoPartes Club
                    </p>
                    <p style="margin: 4px 0 0 0; font-size: 11px; color: rgba(255,255,255,0.5);">
                        Sistema de Gestión de Servicios
                    </p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0; font-size: 11px; color: rgba(255,255,255,0.5);">
                        Generado: ${new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(tempContainer);
    await new Promise(resolve => setTimeout(resolve, 600));

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(tempContainer, {
        scale: 3, // Alta calidad
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
    });

    document.body.removeChild(tempContainer);

    if (autoDownload) {
        const link = document.createElement('a');
        const safeAuxName = auxiliaryName.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
        link.download = `Comprobante-Pago-${safeAuxName}-${formatShortDate(payment.created_at).replace(/\s/g, '-')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    return canvas.toDataURL('image/png');
}

export default function PaymentReceiptDownload({ payment, size = 'normal' }) {
    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            await generatePaymentReceipt(payment, true);
        } catch (error) {
            console.error('Error generating receipt:', error);
            alert('Error al generar comprobante');
        } finally {
            setDownloading(false);
        }
    };

    if (size === 'small') {
        return (
            <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    background: downloading ? '#94a3b8' : 'var(--success)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: downloading ? 'wait' : 'pointer'
                }}
            >
                {downloading ? (
                    <Loader2 size={14} className="spinner" />
                ) : (
                    <Download size={14} />
                )}
                {downloading ? 'Generando...' : 'Descargar'}
            </button>
        );
    }

    return (
        <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn btn-success"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                padding: '14px',
                marginTop: '12px'
            }}
        >
            {downloading ? (
                <>
                    <Loader2 size={18} className="spinner" />
                    Generando comprobante...
                </>
            ) : (
                <>
                    <Download size={18} />
                    Descargar Comprobante
                </>
            )}
        </button>
    );
}
