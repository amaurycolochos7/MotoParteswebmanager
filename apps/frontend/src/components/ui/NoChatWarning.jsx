import { MessageCircle, X, ExternalLink } from 'lucide-react';

export default function NoChatWarning({ phone, onClose, onOpenWhatsApp }) {
    const formattedPhone = phone.replace(/\D/g, '');

    return (
        <div className="no-chat-warning-overlay">
            <div className="no-chat-warning">
                <button className="close-btn" onClick={onClose}>
                    <X size={20} />
                </button>

                <div className="icon-container">
                    <MessageCircle className="main-icon" size={48} />
                    <div className="pulse-ring"></div>
                </div>

                <h3>Envío Manual Requerido</h3>

                <p className="description">
                    No se pudo enviar el mensaje automáticamente. Para poder enviar mensajes automáticos en el futuro, primero debes enviar un mensaje manual a este número.
                </p>

                <div className="phone-display">
                    <span className="phone-label">Número:</span>
                    <span className="phone-number">{phone}</span>
                </div>

                <div className="steps">
                    <div className="step">
                        <span className="step-number">1</span>
                        <span className="step-text">Haz clic en "Abrir WhatsApp"</span>
                    </div>
                    <div className="step">
                        <span className="step-number">2</span>
                        <span className="step-text">Envía cualquier mensaje (ej: "Hola")</span>
                    </div>
                    <div className="step">
                        <span className="step-number">3</span>
                        <span className="step-text">Regresa aquí y vuelve a intentar</span>
                    </div>
                </div>

                <button className="whatsapp-btn" onClick={onOpenWhatsApp}>
                    <MessageCircle size={20} />
                    Abrir WhatsApp
                    <ExternalLink size={16} />
                </button>

                <button className="secondary-btn" onClick={onClose}>
                    Entendido
                </button>
            </div>

            <style>{`
                .no-chat-warning-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    padding: 20px;
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .no-chat-warning {
                    background: var(--bg-card);
                    border: 2px solid #f59e0b;
                    border-radius: 20px;
                    padding: 32px;
                    max-width: 480px;
                    width: 100%;
                    position: relative;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                @keyframes slideUp {
                    from {
                        transform: translateY(40px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }

                .close-btn {
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    background: var(--bg-tertiary);
                    border: none;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: var(--text-secondary);
                    transition: all 0.2s;
                }

                .close-btn:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                    transform: rotate(90deg);
                }

                .icon-container {
                    position: relative;
                    width: 96px;
                    height: 96px;
                    margin: 0 auto 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .main-icon {
                    color: #f59e0b;
                    z-index: 2;
                    position: relative;
                    filter: drop-shadow(0 4px 12px rgba(245, 158, 11, 0.3));
                }

                .pulse-ring {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border: 3px solid #f59e0b;
                    border-radius: 50%;
                    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                    opacity: 0.6;
                }

                @keyframes pulse {
                    0%, 100% {
                        transform: scale(0.8);
                        opacity: 0.8;
                    }
                    50% {
                        transform: scale(1.2);
                        opacity: 0;
                    }
                }

                .no-chat-warning h3 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-bottom: 12px;
                    text-align: center;
                }

                .description {
                    color: var(--text-secondary);
                    text-align: center;
                    line-height: 1.6;
                    margin-bottom: 24px;
                    font-size: 0.9375rem;
                }

                .phone-display {
                    background: var(--bg-tertiary);
                    padding: 16px;
                    border-radius: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    margin-bottom: 24px;
                    border: 1px solid var(--border-color);
                }

                .phone-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-weight: 600;
                }

                .phone-number {
                    font-size: 1.125rem;
                    color: var(--primary);
                    font-weight: 700;
                    font-family: 'Courier New', monospace;
                }

                .steps {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 24px;
                }

                .step {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: var(--bg-tertiary);
                    border-radius: 10px;
                    border: 1px solid var(--border-color);
                    transition: all 0.2s;
                }

                .step:hover {
                    border-color: #f59e0b;
                    background: rgba(245, 158, 11, 0.05);
                }

                .step-number {
                    width: 28px;
                    height: 28px;
                    background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 0.875rem;
                    flex-shrink: 0;
                }

                .step-text {
                    color: var(--text-primary);
                    font-size: 0.9375rem;
                    line-height: 1.4;
                }

                .whatsapp-btn {
                    width: 100%;
                    background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                    color: white;
                    border: none;
                    padding: 16px 24px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3);
                    margin-bottom: 12px;
                }

                .whatsapp-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4);
                }

                .whatsapp-btn:active {
                    transform: translateY(0);
                }

                .secondary-btn {
                    width: 100%;
                    background: var(--bg-tertiary);
                    color: var(--text-secondary);
                    border: 1px solid var(--border-color);
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-weight: 500;
                    font-size: 0.9375rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .secondary-btn:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                    border-color: var(--primary);
                }
            `}</style>
        </div>
    );
}
