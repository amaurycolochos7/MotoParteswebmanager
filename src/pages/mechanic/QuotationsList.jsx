import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Clock, CheckCircle, XCircle, AlertCircle, Eye, Send, FileCheck } from 'lucide-react';
import { sendAutomatedMessage, getQuotationMessage } from '../../utils/whatsappHelper';

export default function QuotationsList() {
    const { quotations, clients, motorcycles, convertQuotationToOrder } = useData();
    const { canManageQuotes } = useAuth();
    const navigate = useNavigate();
    const [filter, setFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'rejected' | 'expired'
    const [sendingId, setSendingId] = useState(null);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSendQuotation = async (quotation) => {
        const client = clients.find(c => c.id === quotation.client_id);
        const motorcycle = motorcycles.find(m => m.id === quotation.motorcycle_id);

        if (!client?.phone) {
            showToast('❌ Cliente sin número de teléfono', 'error');
            return;
        }

        try {
            setSendingId(quotation.id);

            const message = getQuotationMessage(
                client.full_name,
                `${motorcycle?.brand} ${motorcycle?.model}`,
                quotation.quotation_number,
                quotation.services,
                quotation.total_amount,
                quotation.expires_at
            );

            const result = await sendAutomatedMessage(client.phone, message);

            if (result.success && result.automated) {
                showToast('✅ Cotización enviada por WhatsApp', 'success');
            } else {
                showToast('⚠️ Abre WhatsApp manualmente para enviar', 'warning');
                // Open WhatsApp manually using helper function
                const { generateWhatsAppLink } = await import('../../utils/whatsappHelper');
                const link = generateWhatsAppLink(client.phone, message);
                window.open(link, '_blank');
            }
        } catch (error) {
            console.error('Error sending quotation:', error);
            showToast('❌ Error al enviar cotización', 'error');
        } finally {
            setSendingId(null);
        }
    };

    const handleConvertToOrder = (quotation) => {
        if (quotation.status !== 'approved') {
            showToast('⚠️ Solo puedes convertir cotizaciones aprobadas', 'warning');
            return;
        }

        if (quotation.converted_to_order_id) {
            showToast('⚠️ Esta cotización ya fue convertida', 'warning');
            return;
        }

        const confirmed = window.confirm(
            `¿Convertir cotización ${quotation.quotation_number} a orden de servicio?\n\nSe creará una nueva orden con los servicios cotizados.`
        );

        if (confirmed) {
            const newOrder = convertQuotationToOrder(quotation.id);
            if (newOrder) {
                showToast('✅ Orden creada desde cotización', 'success');
                navigate(`/mechanic/order/${newOrder.id}`);
            } else {
                showToast('❌ Error al convertir cotización', 'error');
            }
        }
    };

    const filteredQuotations = quotations.filter(q => {
        if (filter === 'all') return true;
        if (filter === 'expired') {
            return q.status === 'pending' && new Date(q.expires_at) < new Date();
        }
        return q.status === filter;
    });

    const getStatusIcon = (status) => {
        switch (status) {
            case 'pending': return <Clock size={16} />;
            case 'approved': return <CheckCircle size={16} />;
            case 'rejected': return <XCircle size={16} />;
            default: return <AlertCircle size={16} />;
        }
    };

    const getStatusClass = (quotation) => {
        if (quotation.status === 'pending' && new Date(quotation.expires_at) < new Date()) {
            return 'badge-danger';
        }
        switch (quotation.status) {
            case 'pending': return 'badge-warning';
            case 'approved': return 'badge-success';
            case 'rejected': return 'badge-secondary';
            default: return 'badge-secondary';
        }
    };

    const getStatusText = (quotation) => {
        if (quotation.status === 'pending' && new Date(quotation.expires_at) < new Date()) {
            return 'Expirada';
        }
        const statusLabels = {
            pending: 'Pendiente',
            approved: 'Aprobada',
            rejected: 'Rechazada'
        };
        return statusLabels[quotation.status] || quotation.status;
    };

    if (!canManageQuotes()) {
        return (
            <div className="page">
                <div className="empty-state">
                    <AlertCircle size={48} />
                    <h2>Acceso Denegado</h2>
                    <p>No tienes permiso para gestionar cotizaciones</p>
                </div>
            </div>
        );
    }

    return (
        <div className="quotations-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <FileText size={28} />
                        Cotizaciones
                    </h1>
                    <p className="page-subtitle">
                        {quotations.length} cotización{quotations.length !== 1 ? 'es' : ''}
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/mechanic/quotations/new')}>
                    <Plus size={20} />
                    Nueva Cotización
                </button>
            </div>

            {/* Filters */}
            <div className="filter-tabs">
                <button
                    className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    Todas ({quotations.length})
                </button>
                <button
                    className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
                    onClick={() => setFilter('pending')}
                >
                    Pendientes ({quotations.filter(q => q.status === 'pending').length})
                </button>
                <button
                    className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
                    onClick={() => setFilter('approved')}
                >
                    Aprobadas ({quotations.filter(q => q.status === 'approved').length})
                </button>
                <button
                    className={`filter-tab ${filter === 'rejected' ? 'active' : ''}`}
                    onClick={() => setFilter('rejected')}
                >
                    Rechazadas ({quotations.filter(q => q.status === 'rejected').length})
                </button>
            </div>

            {/* Quotations List */}
            {filteredQuotations.length === 0 ? (
                <div className="empty-state card">
                    <FileText size={48} style={{ opacity: 0.3 }} />
                    <p>No hay cotizaciones {filter !== 'all' ? filter : ''}</p>
                </div>
            ) : (
                <div className="quotations-list">
                    {filteredQuotations.map(quotation => {
                        const client = clients.find(c => c.id === quotation.client_id);
                        const motorcycle = motorcycles.find(m => m.id === quotation.motorcycle_id);

                        return (
                            <div key={quotation.id} className="quotation-card card">
                                <div className="quotation-header">
                                    <div>
                                        <h3 className="quotation-number">{quotation.quotation_number}</h3>
                                        <p className="quotation-client">{client?.full_name}</p>
                                        <p className="quotation-moto">
                                            {motorcycle?.brand} {motorcycle?.model}
                                        </p>
                                    </div>
                                    <span className={`badge ${getStatusClass(quotation)}`}>
                                        {getStatusIcon(quotation.status)}
                                        {getStatusText(quotation)}
                                    </span>
                                </div>

                                <div className="quotation-body">
                                    <div className="quotation-services">
                                        {quotation.services?.slice(0, 2).map((service, idx) => (
                                            <span key={idx} className="service-tag">{service.name}</span>
                                        ))}
                                        {quotation.services?.length > 2 && (
                                            <span className="service-tag-more">+{quotation.services.length - 2} más</span>
                                        )}
                                    </div>

                                    <div className="quotation-footer">
                                        <div className="quotation-amount">
                                            <span className="amount-label">Total:</span>
                                            <strong className="amount-value">${(quotation.total_amount || 0).toLocaleString('es-MX')}</strong>
                                        </div>

                                        <button className="btn btn-outline btn-sm">
                                            <Eye size={16} />
                                            Ver Detalles
                                        </button>
                                    </div>

                                    <div className="quotation-meta">
                                        Creada: {new Date(quotation.created_at).toLocaleDateString('es-MX')}
                                        {quotation.status === 'pending' && (
                                            <> • Expira: {new Date(quotation.expires_at).toLocaleDateString('es-MX')}</>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    {toast.message}
                </div>
            )}

            <style>{`
                .quotations-page {
                    padding-bottom: 80px;
                }

                .page-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-xl);
                }

                .page-title {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: 4px;
                }

                .page-subtitle {
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }

                .filter-tabs {
                    display: flex;
                    gap: var(--spacing-xs);
                    margin-bottom: var(--spacing-lg);
                    overflow-x: auto;
                    padding-bottom: var(--spacing-sm);
                }

                .filter-tab {
                    padding: var(--spacing-sm) var(--spacing-md);
                    border: none;
                    background: var(--bg-secondary);
                    border-radius: var(--radius-md);
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    white-space: nowrap;
                }

                .filter-tab:hover {
                    background: var(--primary-light);
                }

                .filter-tab.active {
                    background: var(--primary);
                    color: white;
                }

                .quotations-list {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .quotation-card {
                    padding: var(--spacing-lg);
                    transition: transform var(--transition-fast);
                }

                .quotation-card:hover {
                    transform: translateY(-2px);
                }

                .quotation-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: var(--spacing-md);
                    padding-bottom: var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                }

                .quotation-number {
                    font-size: 1.125rem;
                    font-weight: 700;
                    color: var(--primary);
                    margin-bottom: 4px;
                }

                .quotation-client {
                    font-size: 0.9375rem;
                    font-weight: 600;
                    margin-bottom: 2px;
                }

                .quotation-moto {
                    font-size: 0.8125rem;
                    color: var(--text-secondary);
                }

                .quotation-body {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                .quotation-services {
                    display: flex;
                    gap: var(--spacing-xs);
                    flex-wrap: wrap;
                }

                .service-tag {
                    padding: 4px var(--spacing-sm);
                    background: var(--bg-tertiary);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                }

                .service-tag-more {
                    padding: 4px var(--spacing-sm);
                    background: var(--primary-light);
                    border-radius: var(--radius-sm);
                    font-size: 0.75rem;
                    color: var(--primary);
                    font-weight: 600;
                }

                .quotation-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: var(--spacing-md);
                }

                .quotation-actions {
                    display: flex;
                    gap: var(--spacing-sm);
                }

                .quotation-amount {
                    display: flex;
                    align-items: baseline;
                    gap: var(--spacing-xs);
                }

                .amount-label {
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                }

                .amount-value {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--primary);
                }

                .quotation-meta {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    padding-top: var(--spacing-sm);
                    border-top: 1px solid var(--border-color);
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--spacing-md);
                    padding: var(--spacing-2xl);
                    color: var(--text-secondary);
                }

                .spinner-small {
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-top-color: white;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .toast {
                    position: fixed;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-card);
                    border-radius: var(--radius-lg);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    font-weight: 600;
                    z-index: 1000;
                    animation: slideUp 0.3s ease;
                }

                .toast-success {
                    border-left: 4px solid var(--success);
                }

                .toast-error {
                    border-left: 4px solid var(--danger);
                }

                .toast-warning {
                    border-left: 4px solid var(--warning);
                }

                @keyframes slideUp {
                    from {
                        transform: translateX(-50%) translateY(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(-50%) translateY(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}
