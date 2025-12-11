import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, WifiOff, Wifi, QrCode, LogOut, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { subscribeToQR, getConnectionStatus, disconnect } from '../../services/whatsappService';

export default function WhatsAppConnection() {
    const [status, setStatus] = useState('loading'); // 'loading', 'qr', 'connected', 'disconnected', 'error'
    const [qrCode, setQrCode] = useState(null);
    const [phone, setPhone] = useState(null);
    const [eventSource, setEventSource] = useState(null);

    useEffect(() => {
        // Initial status check
        checkStatus();

        // Subscribe to QR updates
        const source = subscribeToQR(handleUpdate);
        setEventSource(source);

        // Cleanup
        return () => {
            if (source) {
                source.close();
            }
        };
    }, []);

    const checkStatus = async () => {
        const data = await getConnectionStatus();
        if (data.connected) {
            setStatus('connected');
            setPhone(data.phone);
        } else if (data.hasQR) {
            setStatus('qr');
        } else {
            setStatus('loading');
        }
    };

    const handleUpdate = (event) => {
        switch (event.type) {
            case 'loading':
                setStatus('loading');
                setQrCode(null);
                break;
            case 'qr':
                setStatus('qr');
                setQrCode(event.data);
                break;
            case 'ready':
                setStatus('connected');
                setPhone(event.phone);
                setQrCode(null);
                break;
            case 'error':
                setStatus('error');
                break;
            default:
                break;
        }
    };

    const handleDisconnect = async () => {
        if (confirm('¿Estás seguro de que quieres desconectar WhatsApp?')) {
            setStatus('loading');
            const result = await disconnect();
            if (result.success) {
                setPhone(null);
                setQrCode(null);
                // Wait for new QR
                setTimeout(() => checkStatus(), 2000);
            } else {
                alert('Error al desconectar: ' + result.error);
                checkStatus();
            }
        }
    };

    return (
        <div className="whatsapp-connection">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <Smartphone size={24} />
                        Vincular WhatsApp
                    </h1>
                    <p className="page-subtitle">
                        Conecta el WhatsApp de tu empresa para enviar mensajes automáticos
                    </p>
                </div>
                <Link to="/admin" className="btn btn-ghost btn-icon">
                    <LogOut size={20} />
                </Link>
            </div>

            {/* Status Card */}
            <div className="card mb-lg">
                {status === 'loading' && (
                    <div className="status-container">
                        <div className="status-icon status-icon-loading">
                            <Loader2 size={48} className="spinner-icon" />
                        </div>
                        <h2 className="status-title">Inicializando...</h2>
                        <p className="status-description">
                            Preparando conexión con WhatsApp
                        </p>
                    </div>
                )}

                {status === 'qr' && qrCode && (
                    <div className="status-container">
                        <div className="qr-container">
                            <img src={qrCode} alt="QR Code" className="qr-image" />
                        </div>
                        <div className="status-icon status-icon-warning">
                            <QrCode size={32} />
                        </div>
                        <h2 className="status-title">Escanea el código QR</h2>
                        <ol className="qr-instructions">
                            <li>Abre WhatsApp en tu teléfono</li>
                            <li>Ve a <strong>Configuración → Dispositivos vinculados</strong></li>
                            <li>Toca en <strong>Vincular un dispositivo</strong></li>
                            <li>Apunta tu teléfono a esta pantalla para escanear el código</li>
                        </ol>
                    </div>
                )}

                {status === 'connected' && (
                    <div className="status-container">
                        <div className="status-icon status-icon-success">
                            <CheckCircle2 size={48} />
                        </div>
                        <h2 className="status-title">WhatsApp Conectado</h2>
                        <div className="connected-info">
                            <Wifi size={20} className="text-success" />
                            <span className="connected-phone">+{phone}</span>
                        </div>
                        <p className="status-description">
                            Los mensajes se enviarán automáticamente desde este número
                        </p>
                        <button
                            onClick={handleDisconnect}
                            className="btn btn-danger mt-md"
                        >
                            <WifiOff size={18} />
                            Desconectar WhatsApp
                        </button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="status-container">
                        <div className="status-icon status-icon-danger">
                            <AlertCircle size={48} />
                        </div>
                        <h2 className="status-title">Error de Conexión</h2>
                        <p className="status-description">
                            No se pudo conectar con el servidor de WhatsApp
                        </p>
                        <button
                            onClick={checkStatus}
                            className="btn btn-primary mt-md"
                        >
                            Reintentar
                        </button>
                    </div>
                )}
            </div>

            {/* Info Card */}
            <div className="card info-card">
                <h3 className="info-title">
                    <AlertCircle size={20} />
                    Información Importante
                </h3>
                <ul className="info-list">
                    <li>El WhatsApp debe permanecer conectado para enviar mensajes automáticos</li>
                    <li>Si desconectas el dispositivo en WhatsApp, deberás volver a escanear el QR</li>
                    <li>Solo puedes tener un número conectado a la vez</li>
                    <li>Los mensajes se enviarán desde el número que conectes aquí</li>
                </ul>
            </div>

            <style>{`
                .whatsapp-connection {
                    padding-bottom: 80px;
                }

                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-lg);
                }

                .page-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1.5rem;
                    font-weight: 600;
                    margin-bottom: var(--spacing-xs);
                }

                .page-subtitle {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .status-container {
                    text-align: center;
                    padding: var(--spacing-xl) var(--spacing-lg);
                }

                .status-icon {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto var(--spacing-lg);
                    border-radius: var(--radius-full);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .status-icon-loading {
                    background: var(--bg-tertiary);
                    color: var(--text-secondary);
                }

                .status-icon-warning {
                    background: var(--warning-light);
                    color: var(--warning);
                }

                .status-icon-success {
                    background: var(--success-light);
                    color: var(--success);
                }

                .status-icon-danger {
                    background: var(--danger-light);
                    color: var(--danger);
                }

                .spinner-icon {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .status-title {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin-bottom: var(--spacing-sm);
                }

                .status-description {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    line-height: 1.5;
                }

                .qr-container {
                    background: white;
                    padding: var(--spacing-lg);
                    border-radius: var(--radius-lg);
                    display: inline-block;
                    margin-bottom: var(--spacing-lg);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
                }

                .qr-image {
                    display: block;
                    width: 260px;
                    height: 260px;
                    border-radius: var(--radius-md);
                }

                .qr-instructions {
                    text-align: left;
                    max-width: 400px;
                    margin: var(--spacing-lg) auto 0;
                    padding-left: var(--spacing-lg);
                }

                .qr-instructions li {
                    color: var(--text-secondary);
                    margin-bottom: var(--spacing-sm);
                    line-height: 1.6;
                }

                .connected-info {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    margin: var(--spacing-md) 0;
                    padding: var(--spacing-md);
                    background: var(--success-light);
                    border-radius: var(--radius-md);
                }

                .connected-phone {
                    font-size: 1.125rem;
                    font-weight: 600;
                    color: var(--success);
                    font-family: monospace;
                }

                .info-card {
                    background: var(--bg-tertiary);
                }

                .info-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1rem;
                    font-weight: 600;
                    margin-bottom: var(--spacing-md);
                }

                .info-list {
                    list-style: none;
                    padding: 0;
                }

                .info-list li {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                    line-height: 1.6;
                    margin-bottom: var(--spacing-sm);
                    padding-left: var(--spacing-lg);
                    position: relative;
                }

                .info-list li::before {
                    content: '•';
                    position: absolute;
                    left: 0;
                    color: var(--primary);
                    font-weight: bold;
                }
            `}</style>
        </div>
    );
}
