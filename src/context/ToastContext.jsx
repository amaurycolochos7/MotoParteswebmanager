import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info', duration = 4000) => {
        const id = Date.now() + Math.random();

        setToasts(prev => [...prev, { id, message, type }]);

        // Auto-remove después del duration
        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }

        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Helpers para tipos específicos
    const success = useCallback((message, duration) =>
        addToast(message, 'success', duration), [addToast]);

    const error = useCallback((message, duration) =>
        addToast(message, 'error', duration), [addToast]);

    const warning = useCallback((message, duration) =>
        addToast(message, 'warning', duration), [addToast]);

    const info = useCallback((message, duration) =>
        addToast(message, 'info', duration), [addToast]);

    const value = {
        toasts,
        addToast,
        removeToast,
        success,
        error,
        warning,
        info
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

// Componente de contenedor de toasts
function ToastContainer({ toasts, removeToast }) {
    if (toasts.length === 0) return null;

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <Toast
                    key={toast.id}
                    {...toast}
                    onClose={() => removeToast(toast.id)}
                />
            ))}

            <style>{`
                .toast-container {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    pointer-events: none;
                    max-width: calc(100vw - 40px);
                }

                @media (max-width: 480px) {
                    .toast-container {
                        top: 10px;
                        right: 10px;
                        left: 10px;
                        max-width: none;
                    }
                }
            `}</style>
        </div>
    );
}

// Componente individual de toast
function Toast({ message, type, onClose }) {
    const icons = {
        success: CheckCircle,
        error: XCircle,
        warning: AlertCircle,
        info: Info
    };

    const Icon = icons[type] || Info;

    return (
        <div className={`toast toast-${type}`}>
            <div className="toast-icon">
                <Icon size={20} />
            </div>
            <div className="toast-message">{message}</div>
            <button className="toast-close" onClick={onClose}>
                <X size={16} />
            </button>

            <style>{`
                .toast {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px 16px;
                    border-radius: 12px;
                    background: white;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 2px 10px rgba(0, 0, 0, 0.1);
                    pointer-events: auto;
                    min-width: 280px;
                    max-width: 400px;
                    animation: toastSlideIn 0.35s cubic-bezier(0.21, 1.02, 0.73, 1);
                    border-left: 4px solid;
                }

                @keyframes toastSlideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                .toast-success {
                    border-left-color: #22c55e;
                }

                .toast-success .toast-icon {
                    color: #22c55e;
                }

                .toast-error {
                    border-left-color: #ef4444;
                }

                .toast-error .toast-icon {
                    color: #ef4444;
                }

                .toast-warning {
                    border-left-color: #f59e0b;
                }

                .toast-warning .toast-icon {
                    color: #f59e0b;
                }

                .toast-info {
                    border-left-color: #3b82f6;
                }

                .toast-info .toast-icon {
                    color: #3b82f6;
                }

                .toast-icon {
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .toast-message {
                    flex: 1;
                    font-size: 0.9375rem;
                    color: #1e293b;
                    line-height: 1.4;
                }

                .toast-close {
                    flex-shrink: 0;
                    background: none;
                    border: none;
                    color: #94a3b8;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.15s ease;
                }

                .toast-close:hover {
                    background: #f1f5f9;
                    color: #64748b;
                }

                @media (max-width: 480px) {
                    .toast {
                        min-width: auto;
                        max-width: none;
                        width: 100%;
                    }
                }
            `}</style>
        </div>
    );
}

export default ToastContext;
