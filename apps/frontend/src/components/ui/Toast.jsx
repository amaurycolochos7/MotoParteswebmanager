import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose, duration = 4000 }) {
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    const icons = {
        success: <CheckCircle size={20} />,
        error: <XCircle size={20} />,
        warning: <AlertCircle size={20} />,
        info: <Info size={20} />
    };

    const colors = {
        success: { bg: '#10b981', light: '#d1fae5' },
        error: { bg: '#ef4444', light: '#fee2e2' },
        warning: { bg: '#f59e0b', light: '#fef3c7' },
        info: { bg: '#3b82f6', light: '#dbeafe' }
    };

    return (
        <div className="toast-container">
            <div className={`toast toast-${type}`}>
                <div className="toast-icon">
                    {icons[type]}
                </div>
                <div className="toast-content">
                    <p>{message}</p>
                </div>
                <button className="toast-close" onClick={onClose}>
                    <X size={16} />
                </button>
            </div>

            <style>{`
                .toast-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 10000;
                    animation: slideInRight 0.3s ease-out;
                }

                @keyframes slideInRight {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                .toast {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: var(--bg-card);
                    border: 2px solid;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                    min-width: 300px;
                    max-width: 400px;
                    backdrop-filter: blur(10px);
                }

                .toast-success {
                    border-color: ${colors.success.bg};
                    background: linear-gradient(135deg, var(--bg-card) 0%, ${colors.success.light}15 100%);
                }

                .toast-error {
                    border-color: ${colors.error.bg};
                    background: linear-gradient(135deg, var(--bg-card) 0%, ${colors.error.light}15 100%);
                }

                .toast-warning {
                    border-color: ${colors.warning.bg};
                    background: linear-gradient(135deg, var(--bg-card) 0%, ${colors.warning.light}15 100%);
                }

                .toast-info {
                    border-color: ${colors.info.bg};
                    background: linear-gradient(135deg, var(--bg-card) 0%, ${colors.info.light}15 100%);
                }

                .toast-icon {
                    flex-shrink: 0;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                }

                .toast-success .toast-icon {
                    background: ${colors.success.light};
                    color: ${colors.success.bg};
                }

                .toast-error .toast-icon {
                    background: ${colors.error.light};
                    color: ${colors.error.bg};
                }

                .toast-warning .toast-icon {
                    background: ${colors.warning.light};
                    color: ${colors.warning.bg};
                }

                .toast-info .toast-icon {
                    background: ${colors.info.light};
                    color: ${colors.info.bg};
                }

                .toast-content {
                    flex: 1;
                }

                .toast-content p {
                    margin: 0;
                    color: var(--text-primary);
                    font-weight: 500;
                    font-size: 0.9375rem;
                    line-height: 1.4;
                }

                .toast-close {
                    flex-shrink: 0;
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .toast-close:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }
            `}</style>
        </div>
    );
}
