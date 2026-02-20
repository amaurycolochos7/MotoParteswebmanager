import { useState, useEffect } from 'react';
import { X, Send, MessageCircle, Phone, AlertCircle, CheckCircle, Loader, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sendDirectMessage, formatPhoneForDisplay } from '../../utils/whatsappHelper';
import { whatsappBotService } from '../../lib/api';
import './WhatsAppSendModal.css';

/**
 * Modal reusable para enviar mensajes de WhatsApp directos a cualquier número.
 * 
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   phone: string (pre-llenado, opcional)
 *   clientName: string (nombre del cliente, opcional)
 *   initialMessage: string (mensaje pre-llenado, opcional)
 */
export default function WhatsAppSendModal({ isOpen, onClose, phone = '', clientName = '', initialMessage = '' }) {
    const { user } = useAuth();
    const [phoneNumber, setPhoneNumber] = useState(phone);
    const [message, setMessage] = useState(initialMessage);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null); // { success, error }
    const [botStatus, setBotStatus] = useState(null); // null = loading, true = connected, false = disconnected

    // Check bot status on open
    useEffect(() => {
        if (isOpen && user?.id) {
            setBotStatus(null);
            whatsappBotService.getSessionStatus(user.id).then(status => {
                setBotStatus(status.isConnected === true);
            }).catch(() => setBotStatus(false));
        }
    }, [isOpen, user?.id]);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setPhoneNumber(phone);
            setMessage(initialMessage);
            setResult(null);
            setSending(false);
        }
    }, [isOpen, phone, initialMessage]);

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!phoneNumber.trim()) {
            setResult({ success: false, error: 'Ingresa un número de teléfono' });
            return;
        }
        if (!message.trim()) {
            setResult({ success: false, error: 'Escribe un mensaje' });
            return;
        }

        setSending(true);
        setResult(null);

        const res = await sendDirectMessage(user.id, phoneNumber, message);

        setSending(false);
        setResult(res);

        if (res.success) {
            // Auto-close after 2 seconds on success
            setTimeout(() => {
                onClose();
            }, 2000);
        }
    };

    const quickTemplates = [
        {
            label: '👋 Bienvenida',
            text: clientName
                ? `Hola *${clientName}* 👋\n\n¡Bienvenido a *Motopartes*! Estamos a tus órdenes para cualquier servicio o consulta sobre tu motocicleta.\n\n_Tu taller de confianza_ 🔧✨`
                : `¡Hola! 👋\n\n¡Bienvenido a *Motopartes*! Estamos a tus órdenes para cualquier servicio o consulta.\n\n_Tu taller de confianza_ 🔧✨`
        },
        {
            label: '🔔 Recordatorio',
            text: clientName
                ? `Hola *${clientName}*,\n\nTe recordamos que tienes un servicio pendiente en nuestro taller. ¿Te gustaría agendar una cita?\n\nEstamos para servirte.\n\n_Motopartes_ 🔧`
                : `Hola,\n\nTe recordamos que tienes un servicio pendiente. ¿Te gustaría agendar una cita?\n\n_Motopartes_ 🔧`
        },
        {
            label: '📋 Seguimiento',
            text: clientName
                ? `Hola *${clientName}*,\n\nQueremos saber cómo va tu motocicleta después del último servicio. ¿Todo en orden?\n\nCualquier detalle, aquí estamos.\n\n_Motopartes_ 🏍️✨`
                : `Hola,\n\nQueremos saber cómo va tu motocicleta. ¿Todo en orden?\n\n_Motopartes_ 🏍️✨`
        },
    ];

    return (
        <div className="wa-modal-overlay" onClick={onClose}>
            <div className="wa-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="wa-modal-header">
                    <div className="wa-modal-header-left">
                        <MessageCircle size={22} />
                        <span>Enviar WhatsApp</span>
                    </div>
                    <button className="wa-modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Bot status indicator */}
                <div className={`wa-bot-status ${botStatus === true ? 'connected' : botStatus === false ? 'disconnected' : 'loading'}`}>
                    {botStatus === null && <><Loader size={14} className="wa-spin" /> Verificando bot...</>}
                    {botStatus === true && <><CheckCircle size={14} /> Bot conectado — envío automático</>}
                    {botStatus === false && <><AlertCircle size={14} /> Bot desconectado — actívalo primero</>}
                </div>

                <div className="wa-modal-body">
                    {/* Destinatario */}
                    {clientName && (
                        <div className="wa-recipient">
                            <User size={16} />
                            <span className="wa-recipient-name">{clientName}</span>
                        </div>
                    )}

                    {/* Teléfono */}
                    <div className="wa-field">
                        <label className="wa-label">
                            <Phone size={14} />
                            Número de teléfono
                        </label>
                        <input
                            type="tel"
                            className="wa-input"
                            placeholder="Ej: 4491234567"
                            value={phoneNumber}
                            onChange={e => setPhoneNumber(e.target.value)}
                            disabled={sending}
                        />
                    </div>

                    {/* Plantillas rápidas */}
                    <div className="wa-templates">
                        <span className="wa-templates-label">Plantillas rápidas:</span>
                        <div className="wa-templates-list">
                            {quickTemplates.map((t, i) => (
                                <button
                                    key={i}
                                    className="wa-template-btn"
                                    onClick={() => setMessage(t.text)}
                                    disabled={sending}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Mensaje */}
                    <div className="wa-field">
                        <label className="wa-label">
                            <MessageCircle size={14} />
                            Mensaje
                        </label>
                        <textarea
                            className="wa-textarea"
                            placeholder="Escribe tu mensaje aquí..."
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={6}
                            disabled={sending}
                        />
                        <span className="wa-char-count">{message.length} caracteres</span>
                    </div>

                    {/* Result feedback */}
                    {result && (
                        <div className={`wa-result ${result.success ? 'success' : 'error'}`}>
                            {result.success ? (
                                <><CheckCircle size={16} /> ¡Mensaje enviado exitosamente!</>
                            ) : (
                                <><AlertCircle size={16} /> {result.error}</>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="wa-modal-footer">
                    <button className="wa-cancel-btn" onClick={onClose} disabled={sending}>
                        Cancelar
                    </button>
                    <button
                        className="wa-send-btn"
                        onClick={handleSend}
                        disabled={sending || botStatus === false || !phoneNumber.trim() || !message.trim()}
                    >
                        {sending ? (
                            <><Loader size={16} className="wa-spin" /> Enviando...</>
                        ) : (
                            <><Send size={16} /> Enviar</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
