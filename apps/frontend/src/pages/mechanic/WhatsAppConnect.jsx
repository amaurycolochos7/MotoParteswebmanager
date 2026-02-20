import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { whatsappBotService } from '../../lib/api';
import {
    Smartphone,
    RefreshCw,
    CheckCircle,
    AlertCircle,
    Loader,
    LogOut,
    Phone,
    User,
    Monitor,
    Wifi,
    Shield
} from 'lucide-react';

export default function WhatsAppConnect() {
    const { user } = useAuth();
    const [status, setStatus] = useState('loading');
    const [qrCode, setQrCode] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [error, setError] = useState(null);
    const pollInterval = useRef(null);

    useEffect(() => {
        checkStatus();
        return () => stopPolling();
    }, []);

    useEffect(() => {
        if (status === 'qr' || status === 'loading' || status === 'disconnected') {
            startPolling();
        } else {
            stopPolling();
        }
        return () => stopPolling();
    }, [status]);

    const stopPolling = () => {
        if (pollInterval.current) {
            clearInterval(pollInterval.current);
            pollInterval.current = null;
        }
    };

    const startPolling = () => {
        if (pollInterval.current) return;
        pollInterval.current = setInterval(checkStatus, 3000);
    };

    const checkStatus = async () => {
        try {
            const statusRes = await whatsappBotService.getSessionStatus(user.id);
            if (statusRes.isConnected) {
                setStatus('connected');
                setSessionData(statusRes);
                setQrCode(null);
            } else {
                if (statusRes.exists === false) {
                    await whatsappBotService.startSession(user.id);
                    setStatus('disconnected');
                    return;
                }
                const qrRes = await whatsappBotService.getQR(user.id);
                if (qrRes.qr) {
                    setQrCode(qrRes.qr);
                    setStatus('qr');
                } else {
                    setStatus('disconnected');
                }
            }
        } catch (err) {
            console.error('Error checking WhatsApp status:', err);
            setError('Error de conexión con el bot');
            setStatus('error');
        }
    };

    const handleRestartSession = async () => {
        setStatus('loading');
        await whatsappBotService.logoutSession(user.id);
        checkStatus();
    };

    // Format phone number for display: 521234567890 → +52 1 234 567 890
    const formatPhone = (num) => {
        if (!num) return null;
        const s = String(num);
        if (s.length >= 10) {
            // Mexican format: country(2) + number(10)
            const country = s.slice(0, s.length - 10);
            const rest = s.slice(s.length - 10);
            return `+${country} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
        }
        return `+${s}`;
    };

    const phoneFormatted = formatPhone(sessionData?.phoneNumber);

    return (
        <div className="whatsapp-connect-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Conectar WhatsApp</h1>
                    <p className="page-subtitle">
                        Vincula tu número para enviar mensajes automáticos a tus clientes.
                    </p>
                </div>
            </div>

            <div className="wa-card">
                {status === 'loading' && (
                    <div className="wa-loading">
                        <div className="spinner spinner-lg"></div>
                        <p>Verificando conexión...</p>
                    </div>
                )}

                {status === 'connected' && (
                    <div className="wa-connected">
                        {/* Header con gradiente verde */}
                        <div className="wa-header-connected">
                            <div className="wa-header-icon">
                                <CheckCircle size={40} strokeWidth={2.5} />
                            </div>
                            <div className="wa-header-badge">
                                <Wifi size={12} /> Activo
                            </div>
                        </div>

                        <div className="wa-connected-body">
                            <h3 className="wa-title">WhatsApp Conectado</h3>
                            <p className="wa-subtitle">Sesión activa y lista para enviar mensajes</p>

                            {/* Número de teléfono prominente */}
                            {phoneFormatted && (
                                <div className="wa-phone-display">
                                    <Phone size={20} />
                                    <span className="wa-phone-number">{phoneFormatted}</span>
                                </div>
                            )}

                            {/* Info grid */}
                            <div className="wa-info-grid">
                                <div className="wa-info-item">
                                    <div className="wa-info-icon">
                                        <User size={16} />
                                    </div>
                                    <div className="wa-info-content">
                                        <span className="wa-info-label">Usuario</span>
                                        <span className="wa-info-value">{sessionData?.pushname || 'WhatsApp'}</span>
                                    </div>
                                </div>

                                <div className="wa-info-item">
                                    <div className="wa-info-icon">
                                        <Monitor size={16} />
                                    </div>
                                    <div className="wa-info-content">
                                        <span className="wa-info-label">Plataforma</span>
                                        <span className="wa-info-value">{sessionData?.platform || 'Web'}</span>
                                    </div>
                                </div>

                                <div className="wa-info-item">
                                    <div className="wa-info-icon">
                                        <Shield size={16} />
                                    </div>
                                    <div className="wa-info-content">
                                        <span className="wa-info-label">Estado</span>
                                        <span className="wa-info-value wa-status-active">Conectado</span>
                                    </div>
                                </div>
                            </div>

                            <button className="wa-logout-btn" onClick={handleRestartSession}>
                                <LogOut size={16} /> Cerrar Sesión
                            </button>
                        </div>
                    </div>
                )}

                {status === 'qr' && qrCode && (
                    <div className="wa-qr">
                        <div className="wa-qr-header">
                            <Smartphone size={28} />
                            <h3>Escanea el código QR</h3>
                        </div>

                        <div className="wa-qr-steps">
                            <ol>
                                <li>Abre <b>WhatsApp</b> en tu teléfono</li>
                                <li>Ve a <b>Dispositivos vinculados</b></li>
                                <li>Toca <b>Vincular un dispositivo</b></li>
                                <li>Escanea este código QR</li>
                            </ol>
                        </div>

                        <div className="wa-qr-box">
                            <img src={qrCode} alt="WhatsApp QR" />
                        </div>

                        <div className="wa-qr-waiting">
                            <Loader size={14} className="spin" /> Esperando escaneo...
                        </div>
                    </div>
                )}

                {status === 'disconnected' && !qrCode && (
                    <div className="wa-disconnected">
                        <Loader size={40} className="spin text-primary" />
                        <h3>Iniciando sesión...</h3>
                        <p>Preparando tu sesión de WhatsApp. Esto puede tomar un momento...</p>
                        <button className="btn btn-outline mt-md" onClick={checkStatus}>
                            <RefreshCw size={16} /> Verificar estado
                        </button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="wa-error">
                        <AlertCircle size={40} />
                        <h3>Error de Conexión</h3>
                        <p>{error || 'No se pudo conectar con el bot.'}</p>
                        <button className="btn btn-outline mt-md" onClick={handleRestartSession}>
                            <RefreshCw size={16} /> Reintentar
                        </button>
                    </div>
                )}
            </div>

            <style>{`
                .wa-card {
                    max-width: 480px;
                    margin: 0 auto;
                    background: var(--bg-card);
                    border-radius: 16px;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.08);
                    border: 1px solid var(--border-color);
                    overflow: hidden;
                    min-height: 360px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                /* ─── Connected State ─── */
                .wa-connected {
                    width: 100%;
                }

                .wa-header-connected {
                    background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                    padding: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    color: white;
                }

                .wa-header-icon {
                    width: 72px;
                    height: 72px;
                    background: rgba(255,255,255,0.2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(8px);
                }

                .wa-header-badge {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    background: rgba(255,255,255,0.25);
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    backdrop-filter: blur(6px);
                }

                .wa-connected-body {
                    padding: 24px;
                    text-align: center;
                }

                .wa-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin: 0 0 4px;
                }

                .wa-subtitle {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                    margin: 0 0 16px;
                }

                .wa-phone-display {
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
                    padding: 12px 20px;
                    border-radius: 12px;
                    margin-bottom: 20px;
                    border: 1px solid #a5d6a7;
                }

                .wa-phone-display svg {
                    color: #2e7d32;
                    flex-shrink: 0;
                }

                .wa-phone-number {
                    font-size: 1.125rem;
                    font-weight: 700;
                    color: #1b5e20;
                    letter-spacing: 0.5px;
                    font-variant-numeric: tabular-nums;
                }

                /* Dark mode support */
                [data-theme="dark"] .wa-phone-display {
                    background: linear-gradient(135deg, rgba(37, 211, 102, 0.15) 0%, rgba(18, 140, 126, 0.15) 100%);
                    border-color: rgba(37, 211, 102, 0.3);
                }

                [data-theme="dark"] .wa-phone-display svg {
                    color: #69f0ae;
                }

                [data-theme="dark"] .wa-phone-number {
                    color: #b9f6ca;
                }

                .wa-info-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 0;
                    text-align: left;
                    border: 1px solid var(--border-color);
                    border-radius: 10px;
                    overflow: hidden;
                    margin-bottom: 20px;
                }

                .wa-info-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--border-color);
                }

                .wa-info-item:last-child {
                    border-bottom: none;
                }

                .wa-info-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-hover);
                    color: var(--text-secondary);
                    flex-shrink: 0;
                }

                .wa-info-content {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                }

                .wa-info-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .wa-info-value {
                    font-size: 0.9375rem;
                    font-weight: 500;
                    color: var(--text-primary);
                }

                .wa-status-active {
                    color: #25D366 !important;
                    font-weight: 600 !important;
                }

                .wa-logout-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                    border-radius: 8px;
                    border: 1px solid var(--danger, #e53935);
                    background: transparent;
                    color: var(--danger, #e53935);
                    font-size: 0.875rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .wa-logout-btn:hover {
                    background: var(--danger, #e53935);
                    color: white;
                }

                /* ─── Loading State ─── */
                .wa-loading {
                    text-align: center;
                    padding: 40px;
                    color: var(--text-secondary);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 16px;
                }

                /* ─── QR State ─── */
                .wa-qr {
                    width: 100%;
                    padding: 24px;
                    text-align: center;
                }

                .wa-qr-header {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    margin-bottom: 16px;
                    color: var(--text-primary);
                }

                .wa-qr-header h3 {
                    margin: 0;
                }

                .wa-qr-steps {
                    text-align: left;
                    background: var(--bg-hover);
                    padding: 16px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }

                .wa-qr-steps ol {
                    padding-left: 20px;
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    line-height: 1.6;
                }

                .wa-qr-box {
                    background: white;
                    padding: 16px;
                    border-radius: 12px;
                    display: inline-block;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.1);
                }

                .wa-qr-box img {
                    width: 240px;
                    height: 240px;
                    display: block;
                }

                .wa-qr-waiting {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    margin-top: 16px;
                    color: var(--text-muted);
                    font-size: 0.875rem;
                }

                /* ─── Disconnected / Error ─── */
                .wa-disconnected, .wa-error {
                    text-align: center;
                    padding: 40px 24px;
                    color: var(--text-secondary);
                }

                .wa-disconnected h3, .wa-error h3 {
                    color: var(--text-primary);
                    margin: 12px 0 8px;
                }

                .wa-error svg {
                    color: var(--danger);
                }

                .text-primary { color: var(--primary) !important; }

                .btn-outline {
                    background: transparent;
                    border: 1px solid var(--border-color);
                    padding: 8px 16px;
                    border-radius: 8px;
                    color: var(--text-primary);
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.875rem;
                    transition: all 0.2s;
                }

                .btn-outline:hover {
                    background: var(--bg-hover);
                }

                .spin {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
