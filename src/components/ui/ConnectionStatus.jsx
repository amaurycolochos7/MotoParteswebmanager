import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export default function ConnectionStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showOnlineNotification, setShowOnlineNotification] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowOnlineNotification(true);
            setTimeout(() => setShowOnlineNotification(false), 3000);
        };

        const handleOffline = () => {
            setIsOnline(false);
            setShowOnlineNotification(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (isOnline && !showOnlineNotification) return null;

    return (
        <div className={`connection-status ${isOnline ? 'status-online' : 'status-offline'}`}>
            {isOnline ? (
                <>
                    <div className="status-icon-wrapper">
                        <Wifi size={16} />
                        <span className="pulse-ring"></span>
                    </div>
                    <span>Conexión restablecida</span>
                </>
            ) : (
                <>
                    <WifiOff size={16} />
                    <span>Sin conexión a Internet - Los datos no se cargarán</span>
                </>
            )}

            <style>{`
                .connection-status {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 16px;
                    border-radius: 50px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    transition: all 0.3s ease;
                    animation: slideUp 0.3s ease-out;
                }

                @keyframes slideUp {
                    from { transform: translate(-50%, 20px); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }

                .status-offline {
                    background-color: #1f2937;
                    color: #f87171;
                    border: 1px solid #7f1d1d;
                }

                .status-online {
                    background-color: #064e3b;
                    color: #34d399;
                    border: 1px solid #065f46;
                }

                .status-icon-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .pulse-ring {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 2px solid #34d399;
                    animation: pulse 2s infinite;
                }

                @keyframes pulse {
                    0% { transform: scale(0.9); opacity: 1; }
                    100% { transform: scale(2); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
