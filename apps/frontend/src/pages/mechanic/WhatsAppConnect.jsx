import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { whatsappBotService } from '../../lib/api';
import { QRCodeSVG } from 'qrcode.react';
import {
    Smartphone,
    RefreshCw,
    CheckCircle,
    AlertCircle,
    Loader,
    LogOut
} from 'lucide-react';

export default function WhatsAppConnect() {
    const { user } = useAuth();
    const [status, setStatus] = useState('loading'); // loading, disconnected, qr, connected
    const [qrCode, setQrCode] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [error, setError] = useState(null);
    const pollInterval = useRef(null);

    // Initial load
    useEffect(() => {
        checkStatus();
        return () => stopPolling();
    }, []);

    // Start polling when in QR mode
    useEffect(() => {
        if (status === 'qr' || status === 'loading') {
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
                // Not connected, try to get QR
                const qrRes = await whatsappBotService.getQR(user.id);
                if (qrRes.qr) {
                    setQrCode(qrRes.qr);
                    setStatus('qr');
                } else {
                    setStatus('disconnected'); // Waiting for QR generation on backend
                }
            }
        } catch (err) {
            console.error('Error checking WhatsApp status:', err);
            setError('Error de conexión con el bot');
            setStatus('error');
        }
    };

    const handleRestartSession = async () => {
        // This functionality might need a backend endpoint to force restart/logout
        // For now, we just reload the status
        setStatus('loading');
        checkStatus();
    };

    return (
        <div className="whatsapp-connect-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Conectar WhatsApp</h1>
                    <p className="page-subtitle">
                        Escanea el código QR para vincular tu número y enviar mensajes automáticos.
                    </p>
                </div>
            </div>

            <div className="content-card">
                <div className="status-section">
                    {status === 'loading' && (
                        <div className="loading-state">
                            <div className="spinner spinner-lg"></div>
                            <p>Verificando estado de conexión...</p>
                        </div>
                    )}

                    {status === 'connected' && (
                        <div className="connected-state">
                            <div className="success-icon">
                                <CheckCircle size={64} />
                            </div>
                            <h3>¡WhatsApp Conectado!</h3>
                            <p>Tu sesión está activa y lista para enviar mensajes.</p>

                            <div className="session-info">
                                <div className="info-row">
                                    <span className="label">Usuario:</span>
                                    <span className="value">{sessionData?.pushname || 'Usuario de WhatsApp'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="label">Número:</span>
                                    <span className="value">{sessionData?.wid?.user || '---'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="label">Plataforma:</span>
                                    <span className="value">{sessionData?.platform || 'Web'}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {status === 'qr' && qrCode && (
                        <div className="qr-state">
                            <div className="qr-instructions">
                                <ol>
                                    <li>Abre WhatsApp en tu teléfono</li>
                                    <li>Toca Menú (⋮) o Configuración (⚙️) y selecciona <b>Dispositivos vinculados</b></li>
                                    <li>Toca en <b>Vincular un dispositivo</b></li>
                                    <li>Apunta tu teléfono hacia esta pantalla para escanear el código</li>
                                </ol>
                            </div>

                            <div className="qr-container">
                                <QRCodeSVG value={qrCode} size={256} level="L" includeMargin={true} />
                            </div>

                            <p className="qr-refresh-hint">
                                <Loader size={14} className="spin" /> Esperando escaneo...
                            </p>
                        </div>
                    )}

                    {status === 'disconnected' && !qrCode && (
                        <div className="disconnected-state">
                            <AlertCircle size={48} className="text-warning" />
                            <h3>Iniciando Sesión...</h3>
                            <p>El servidor está generando tu sesión de WhatsApp. Por favor espera un momento...</p>
                            <button className="btn btn-primary mt-md" onClick={checkStatus}>
                                <RefreshCw size={18} /> Reintentar
                            </button>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="error-state">
                            <AlertCircle size={48} className="text-danger" />
                            <h3>Error de Conexión</h3>
                            <p>{error || 'No se pudo conectar con el servicio de WhatsApp Bot.'}</p>
                            <button className="btn btn-secondary mt-md" onClick={handleRestartSession}>
                                <RefreshCw size={18} /> Reintentar
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .content-card {
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    padding: var(--spacing-xl);
                    box-shadow: var(--shadow-sm);
                    border: 1px solid var(--border-color);
                    max-width: 600px;
                    margin: 0 auto;
                    min-height: 400px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .status-section {
                    width: 100%;
                    text-align: center;
                }

                .loading-state {
                    color: var(--text-secondary);
                }

                .connected-state {
                    color: var(--success);
                }

                .success-icon {
                    margin-bottom: var(--spacing-lg);
                    color: var(--success);
                }
                
                .session-info {
                    margin-top: var(--spacing-lg);
                    background: var(--bg-hover);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    text-align: left;
                }
                
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    padding: var(--spacing-xs) 0;
                    border-bottom: 1px solid var(--border-light);
                }
                
                .info-row:last-child {
                    border-bottom: none;
                }
                
                .info-row .label {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }
                
                .info-row .value {
                    font-weight: 500;
                    color: var(--text-primary);
                }

                .qr-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-lg);
                }
                
                .qr-container {
                    background: white;
                    padding: var(--spacing-md);
                    border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-md);
                }

                .qr-instructions {
                    text-align: left;
                    background: var(--bg-hover);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    width: 100%;
                }
                
                .qr-instructions ol {
                    padding-left: var(--spacing-lg);
                    margin: 0;
                    color: var(--text-secondary);
                    font-size: 0.9375rem;
                }
                
                .qr-instructions li {
                    margin-bottom: var(--spacing-xs);
                }

                .qr-refresh-hint {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-muted);
                    font-size: 0.875rem;
                }
                
                .spin {
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                
                .text-warning { color: var(--warning); }
                .text-danger { color: var(--danger); }
            `}</style>
        </div>
    );
}
