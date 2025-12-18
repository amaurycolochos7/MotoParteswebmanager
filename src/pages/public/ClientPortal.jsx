import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ordersService, orderUpdatesService } from '../../lib/supabase';
import {
  AlertCircle,
  Phone,
  Bike,
  Calendar,
  DollarSign,
  FileText,
  Search,
  Settings,
  CheckCircle,
  PackageCheck,
  Bell,
  Wrench
} from 'lucide-react';

export default function ClientPortal() {
  const { token } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    loadOrder();

    // Auto-refresh every 30 seconds to get status updates
    const interval = setInterval(() => {
      loadOrder();
    }, 30000);

    return () => clearInterval(interval);
  }, [token]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await ordersService.getByToken(token);
      if (!data) {
        setError('Orden no encontrada');
      } else {
        setOrder(data);
        // Load updates
        try {
          const updatesData = await orderUpdatesService.getByOrder(data.id);
          setUpdates(updatesData || []);
        } catch (e) {
          console.error('Error loading updates:', e);
        }
      }
    } catch (err) {
      console.error('Error loading order:', err);
      setError('Error al cargar la orden');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Status configuration with short labels for steps
  const statusConfig = {
    'Registrada': { label: 'REGISTRADA', shortLabel: 'Registrada', color: '#06b6d4', icon: FileText, progress: 20, step: 1 },
    'En Revisión': { label: 'EN REVISIÓN', shortLabel: 'Revisión', color: '#f59e0b', icon: Search, progress: 40, step: 2 },
    'En Reparación': { label: 'EN REPARACIÓN', shortLabel: 'Reparación', color: '#8b5cf6', icon: Settings, progress: 60, step: 3 },
    'Lista para Entregar': { label: 'LISTA PARA ENTREGAR', shortLabel: 'Lista', color: '#22c55e', icon: CheckCircle, progress: 80, step: 4 },
    'Entregada': { label: 'ENTREGADA', shortLabel: 'Entregada', color: '#10b981', icon: PackageCheck, progress: 100, step: 5 }
  };

  if (loading) {
    return (
      <div className="portal-container">
        <div className="loading-screen">
          <div className="spinner spinner-lg"></div>
          <p>Cargando información...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="portal-container">
        <div className="error-screen">
          <AlertCircle size={64} color="#ef4444" />
          <h2>{error || 'Orden no encontrada'}</h2>
          <p>El enlace puede haber expirado o ser incorrecto.</p>
          <p>Si necesitas ayuda, contacta al taller.</p>
          <a href="tel:5551234567" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            <Phone size={20} />
            Llamar al Taller
          </a>
        </div>
      </div>
    );
  }

  const currentStatus = statusConfig[order.status?.name] || statusConfig['Registrada'];
  const StatusIcon = currentStatus.icon;
  const servicesTotal = order.services?.reduce((sum, svc) => sum + (parseFloat(svc.price) || 0), 0) || 0;
  const balance = (order.total_amount || servicesTotal) - (order.advance_payment || 0);

  return (
    <div className="portal-container">
      {/* Header */}
      <div className="portal-header">
        <img src="/logo.png" alt="MotoPartes" className="portal-logo" />
        <h1>MotoPartes</h1>
        <p>Tu taller de confianza</p>
      </div>

      {/* Status Progress */}
      <div className="status-card">
        <div className="status-header">
          <div className="status-icon-wrap" style={{ background: `${currentStatus.color}20` }}>
            <StatusIcon size={28} color={currentStatus.color} />
          </div>
          <div>
            <h3 style={{ color: currentStatus.color }}>{currentStatus.label}</h3>
            <p>Estado actual de tu servicio</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress-container">
          <div
            className="progress-fill"
            style={{
              width: `${currentStatus.progress}%`,
              background: currentStatus.color
            }}
          />
        </div>

        {/* Steps */}
        <div className="progress-steps">
          {Object.entries(statusConfig).map(([key, config]) => (
            <div
              key={key}
              className={`step ${currentStatus.step >= config.step ? 'active' : ''} ${currentStatus.step > config.step ? 'completed' : ''}`}
            >
              <div
                className="step-dot"
                style={currentStatus.step >= config.step ? { background: config.color, color: 'white' } : {}}
              >
                <config.icon size={16} />
              </div>
              <span>{config.shortLabel}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Updates / Novedades */}
      {updates.length > 0 && (
        <div className="updates-card">
          <div className="updates-header">
            <Bell size={20} color="#f59e0b" />
            <h3>Bitácora de Novedades</h3>
          </div>
          <div className="updates-list">
            {updates.map((update, idx) => (
              <div key={idx} className="update-item">
                <div className="update-icon">
                  {update.update_type === 'additional_work' ? <Wrench size={16} /> : <AlertCircle size={16} />}
                </div>
                <div className="update-content">
                  <span className="update-date">{formatDate(update.created_at)}</span>
                  <h4>{update.title}</h4>
                  <p>{update.description}</p>
                  {update.estimated_price > 0 && (
                    <span className="update-price">
                      Costo extra: {formatCurrency(update.estimated_price)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Details */}
      <div className="order-card">
        <div className="order-header">
          <h2>{order.order_number}</h2>
          <span
            className="status-badge"
            style={{ background: currentStatus.color }}
          >
            {currentStatus.label}
          </span>
        </div>

        <div className="order-details">
          <div className="detail-item">
            <Calendar size={18} />
            <div>
              <span className="detail-label">Fecha de ingreso</span>
              <strong>{formatDate(order.created_at)}</strong>
            </div>
          </div>

          <div className="detail-item">
            <Bike size={18} />
            <div>
              <span className="detail-label">Tu moto</span>
              <strong>
                {order.motorcycle?.brand} {order.motorcycle?.model}
              </strong>
              <span className="detail-sub">
                {order.motorcycle?.year} • {order.motorcycle?.plates || 'Sin placas'}
              </span>
            </div>
          </div>
        </div>

        {/* Services */}
        {order.services?.length > 0 && (
          <div className="services-section">
            <h4>Servicios</h4>
            {order.services.map((service, idx) => (
              <div key={idx} className="service-row">
                <span>{service.name}</span>
                <span className="service-price">{formatCurrency(service.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals - Improved visibility */}
      <div className="totals-card">
        <h4>Resumen de cobro</h4>

        <div className="total-row">
          <span>Total servicios</span>
          <span className="total-value">{formatCurrency(order.total_amount || servicesTotal)}</span>
        </div>

        {order.advance_payment > 0 && (
          <div className="total-row advance">
            <span>Anticipo pagado</span>
            <span className="total-value text-success">-{formatCurrency(order.advance_payment)}</span>
          </div>
        )}

        <div className="total-row balance">
          <span>Saldo pendiente</span>
          <span className="balance-amount">{formatCurrency(balance)}</span>
        </div>

        <div className="payment-status">
          {order.is_paid ? (
            <span className="badge badge-success">PAGADO</span>
          ) : (
            <span className="badge badge-warning">PENDIENTE DE PAGO</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="portal-footer">
        <p>© 2026 MotoPartes • Reparaciones y Modificaciones</p>
      </div>

      <style>{`
                .portal-container {
                    max-width: 500px;
                    margin: 0 auto;
                    padding: 1.5rem;
                    background: #f8fafc;
                    min-height: 100vh;
                }

                .loading-screen,
                .error-screen {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    text-align: center;
                    gap: 1rem;
                }

                .error-screen h2 {
                    color: #1e293b;
                    margin-top: 1rem;
                }

                .portal-header {
                    text-align: center;
                    padding: 2rem 0;
                    margin-bottom: 1.5rem;
                    background: transparent;
                }

                .portal-logo {
                    width: 80px;
                    height: 80px;
                    object-fit: contain;
                    margin-bottom: 0.5rem;
                }

                .portal-header h1 {
                    font-size: 1.5rem;
                    color: #1e293b;
                    margin: 0.5rem 0 0.25rem;
                }

                .portal-header p {
                    color: #64748b;
                    font-size: 0.875rem;
                }

                .status-card,
                .order-card,
                .totals-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    margin-bottom: 1rem;
                    border: 1px solid #e2e8f0;
                }

                .status-header {
                    display: flex;
                    gap: 1rem;
                    align-items: center;
                    margin-bottom: 1.25rem;
                }

                .status-icon-wrap {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .status-header h3 {
                    font-size: 1rem;
                    font-weight: 700;
                    margin: 0;
                }

                .status-header p {
                    font-size: 0.8125rem;
                    color: #64748b;
                    margin: 0;
                }

                .progress-container {
                    height: 8px;
                    background: #f1f5f9;
                    border-radius: 99px;
                    overflow: hidden;
                    margin-bottom: 1rem;
                }

                .progress-fill {
                    height: 100%;
                    border-radius: 99px;
                    transition: width 0.5s ease;
                }

                .progress-steps {
                    display: flex;
                    justify-content: space-between;
                }

                .step {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5rem;
                    opacity: 0.4;
                }

                .step.active {
                    opacity: 1;
                }

                .step-dot {
                    width: 32px;
                    height: 32px;
                    background: #f1f5f9;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #94a3b8;
                }

                .step span {
                    font-size: 0.6875rem;
                    color: #64748b;
                }

                .order-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                    margin-bottom: 1.25rem;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid #e2e8f0;
                }

                .order-header h2 {
                    font-size: 1.25rem;
                    color: #2563eb;
                    margin: 0;
                    font-weight: 700;
                }

                .status-badge {
                    padding: 0.25rem 0.75rem;
                    border-radius: 99px;
                    font-size: 0.6875rem;
                    font-weight: 600;
                    color: white;
                    text-transform: uppercase;
                }

                .order-details {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .detail-item {
                    display: flex;
                    gap: 0.75rem;
                    align-items: flex-start;
                }

                .detail-item > svg {
                    color: #2563eb;
                    margin-top: 2px;
                    flex-shrink: 0;
                }

                .detail-item > div {
                    display: flex;
                    flex-direction: column;
                }

                .detail-label {
                    font-size: 0.6875rem;
                    color: #94a3b8;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .detail-sub {
                    font-size: 0.8125rem;
                    color: #64748b;
                }

                .services-section {
                    margin-top: 1rem;
                    padding-top: 1rem;
                    border-top: 1px solid #e2e8f0;
                }

                .services-section h4 {
                    font-size: 0.875rem;
                    margin-bottom: 0.75rem;
                    color: #1e293b;
                }

                .service-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.75rem 0;
                    border-bottom: 1px solid #f1f5f9;
                }

                .service-row:last-child {
                    border-bottom: none;
                }

                .service-row span:first-child {
                    flex: 1;
                }

                .service-price {
                    font-weight: 600;
                    color: #2563eb;
                    white-space: nowrap;
                    text-align: right;
                }

                .totals-card h4 {
                    font-size: 0.875rem;
                    margin-bottom: 0.75rem;
                }

                .total-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.5rem 0;
                }

                .total-row.advance {
                    color: #22c55e;
                }

                .total-row.balance {
                    padding-top: 1rem;
                    margin-top: 0.75rem;
                    border-top: 2px solid #e2e8f0;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5rem;
                    text-align: center;
                }

                .total-value {
                    font-weight: 600;
                    font-size: 1.125rem;
                }

                .balance-amount {
                    font-weight: 700;
                    font-size: 1.5rem;
                    color: #2563eb;
                }

                .payment-status {
                    text-align: center;
                    margin-top: 1rem;
                    padding-top: 0.75rem;
                    border-top: 1px solid #e2e8f0;
                }

                .badge {
                    display: inline-block;
                    padding: 0.5rem 1rem;
                    border-radius: 99px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .badge-success {
                    background: #dcfce7;
                    color: #16a34a;
                }

                .badge-warning {
                    background: #fef3c7;
                    color: #d97706;
                }

                .portal-footer {
                    text-align: center;
                    padding: 2rem 0;
                }

                .portal-footer p {
                    color: #64748b;
                    margin-bottom: 0.75rem;
                }

                .text-success {
                    color: #22c55e;
                }

                .updates-card {
                    background: white;
                    border-radius: 12px;
                    padding: 1.25rem;
                    margin-bottom: 1rem;
                    border: 1px solid #e2e8f0;
                    border-left: 4px solid #f59e0b;
                }

                .updates-header {
                    display: flex;
                    gap: 0.75rem;
                    align-items: center;
                    margin-bottom: 1rem;
                }

                .updates-header h3 {
                    font-size: 1rem;
                    margin: 0;
                    color: #1e293b;
                }

                .updates-list {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .update-item {
                    display: flex;
                    gap: 0.75rem;
                    padding-bottom: 1rem;
                    border-bottom: 1px dashed #e2e8f0;
                }

                .update-item:last-child {
                    border-bottom: none;
                    padding-bottom: 0;
                }

                .update-icon {
                    width: 32px;
                    height: 32px;
                    background: #fffbeb;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #d97706;
                    flex-shrink: 0;
                }

                .update-content h4 {
                    font-size: 0.875rem;
                    margin: 0 0 0.25rem 0;
                    color: #1e293b;
                }

                .update-content p {
                    font-size: 0.8125rem;
                    color: #64748b;
                    margin: 0 0 0.5rem 0;
                    line-height: 1.4;
                }

                .update-date {
                    font-size: 0.6875rem;
                    color: #94a3b8;
                    display: block;
                    margin-bottom: 0.25rem;
                }

                .update-price {
                    display: inline-block;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: #d97706;
                    background: #fffbeb;
                    padding: 0.125rem 0.5rem;
                    border-radius: 4px;
                }
            `}</style>
    </div>
  );
}
