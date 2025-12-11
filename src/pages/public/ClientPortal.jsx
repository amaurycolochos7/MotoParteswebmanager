import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AlertCircle, Phone, Wrench, Bike, Calendar, DollarSign, Check, X, FileText, Search, Settings, CheckCircle, PackageCheck } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { isLinkExpired } from '../../utils/tokenGenerator';

export default function ClientPortal() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { orders, clients, motorcycles, services, serviceUpdates, getOrderUpdates, updateServiceUpdateAuth, updateOrder } = useData();

  const [order, setOrder] = useState(null);
  const [client, setClient] = useState(null);
  const [motorcycle, setMotorcycle] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingUpdate, setProcessingUpdate] = useState(null);
  const [viewRecorded, setViewRecorded] = useState(false);

  useEffect(() => {
    loadOrderByToken();
  }, [token, orders, serviceUpdates]);

  // Separate effect to track view only once per session to avoid infinite loops
  useEffect(() => {
    if (order && !viewRecorded) {
      updateOrder(order.id, {
        client_last_seen_at: new Date().toISOString()
      });
      setViewRecorded(true);
    }
  }, [order, viewRecorded]);

  const loadOrderByToken = () => {
    try {
      // Find order by public token
      const foundOrder = orders.find(o => o.public_token === token);

      if (!foundOrder) {
        // Only set error if we are not loading for the first time
        // This prevents flashing error states during initial sync
        if (!loading) setError('Orden no encontrada');
        setLoading(false);
        return;
      }

      // Load associated data
      const foundClient = clients.find(c => c.id === foundOrder.client_id);
      const foundMoto = motorcycles.find(m => m.id === foundOrder.motorcycle_id);
      const orderUpdates = getOrderUpdates(foundOrder.id);

      setOrder(foundOrder);
      setClient(foundClient);
      setMotorcycle(foundMoto);
      setUpdates(orderUpdates);

      setLoading(false);
    } catch (err) {
      console.error('Error loading order:', err);
      setError('Error al cargar la orden');
      setLoading(false);
    }
  };

  const handleAuthorization = async (updateId, approved) => {
    setProcessingUpdate(updateId);
    const status = approved ? 'approved' : 'rejected';

    try {
      await updateServiceUpdateAuth(updateId, status);
      // Reload updates
      setTimeout(() => {
        loadOrderByToken();
        setProcessingUpdate(null);
      }, 500);
    } catch (err) {
      console.error('Error updating authorization:', err);
      setProcessingUpdate(null);
    }
  };

  if (loading) {
    return (
      <div className="client-portal">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="client-portal">
        <div className="error-screen">
          <AlertCircle size={64} />
          <h2>{error}</h2>
          <p>Si necesitas ayuda, contacta al taller.</p>
          <a href="tel:5551234567" className="btn btn-primary">
            <Phone size={20} />
            Llamar al Taller
          </a>
        </div>
      </div>
    );
  }

  const servicesTotal = order.services.reduce((sum, svc) => sum + (svc.price || 0), 0);
  const approvedUpdates = updates.filter(u => u.authorization_status === 'approved');
  const pendingUpdates = updates.filter(u => u.requires_authorization && u.authorization_status === 'pending');
  const rejectedUpdates = updates.filter(u => u.authorization_status === 'rejected');
  const infoUpdates = updates.filter(u => !u.requires_authorization);

  const approvedUpdatesTotal = approvedUpdates.reduce((sum, u) => sum + (u.estimated_price || 0), 0);
  const finalTotal = servicesTotal + approvedUpdatesTotal;
  const balance = finalTotal - (order.advance_payment || 0);

  // Status configuration - matching DEFAULT_STATUSES
  const statusConfig = {
    'Registrada': { label: 'REGISTRADA', color: '#00d4ff', icon: FileText, progress: 20, step: 1 },
    'En Revisión': { label: 'EN REVISIÓN', color: '#ffd700', icon: Search, progress: 40, step: 2 },
    'En Reparación': { label: 'EN REPARACIÓN', color: '#9966ff', icon: Settings, progress: 60, step: 3 },
    'Lista para Entregar': { label: 'LISTA', color: '#00ff88', icon: CheckCircle, progress: 80, step: 4 },
    'Entregada': { label: 'ENTREGADA', color: '#00cc6a', icon: PackageCheck, progress: 100, step: 5 }
  };

  const currentStatus = statusConfig[order.status] || statusConfig['Registrada'];

  return (
    <div className="client-portal">
      {/* Workshop Header */}
      <div className="workshop-header">
        <h1>🏍️ Motopartes</h1>
        <p>Tu taller de confianza</p>
      </div>

      {/* Status Progress Bar */}
      <div className="status-progress card">
        <div className="progress-header">
          <div className="status-icon-wrapper">
            <currentStatus.icon className="status-icon" size={32} strokeWidth={2} />
          </div>
          <div>
            <h3>{currentStatus.label}</h3>
            <p>Estado actual de tu servicio</p>
          </div>
        </div>

        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{
              width: `${currentStatus.progress}%`,
              background: currentStatus.color
            }}
          />
        </div>

        <div className="progress-steps">
          <div className={`step ${currentStatus.step >= 1 ? currentStatus.step === 1 ? 'active' : 'completed' : ''}`}>
            <div className="step-dot">
              <FileText size={20} strokeWidth={2.5} />
            </div>
            <span>Registrada</span>
          </div>
          <div className={`step ${currentStatus.step >= 2 ? currentStatus.step === 2 ? 'active' : 'completed' : ''}`}>
            <div className="step-dot">
              <Search size={20} strokeWidth={2.5} />
            </div>
            <span>Revisión</span>
          </div>
          <div className={`step ${currentStatus.step >= 3 ? currentStatus.step === 3 ? 'active' : 'completed' : ''}`}>
            <div className="step-dot">
              <Settings size={20} strokeWidth={2.5} />
            </div>
            <span>Reparación</span>
          </div>
          <div className={`step ${currentStatus.step >= 4 ? currentStatus.step === 4 ? 'active' : 'completed' : ''}`}>
            <div className="step-dot">
              <CheckCircle size={20} strokeWidth={2.5} />
            </div>
            <span>Lista</span>
          </div>
          <div className={`step ${currentStatus.step >= 5 ? 'active completed' : ''}`}>
            <div className="step-dot">
              <PackageCheck size={20} strokeWidth={2.5} />
            </div>
            <span>Entregada</span>
          </div>
        </div>
      </div>

      {/* Order Summary */}
      <div className="order-summary-public card">
        <div className="summary-header">
          <h2>{order.order_number}</h2>
          <span
            className="badge badge-lg"
            style={{ background: currentStatus.color, color: 'white' }}
          >
            {currentStatus.label}
          </span>
        </div>

        <div className="summary-details">
          <div className="detail-row">
            <Calendar size={18} />
            <div>
              <span className="detail-label">Fecha de ingreso</span>
              <strong>{new Date(order.created_at).toLocaleDateString('es-MX', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}</strong>
            </div>
          </div>

          <div className="detail-row">
            <Bike size={18} />
            <div>
              <span className="detail-label">Tu moto</span>
              <strong>{motorcycle.brand} {motorcycle.model}</strong>
              <span className="detail-secondary">{motorcycle.year} • {motorcycle.plates || 'Sin placas'}</span>
            </div>
          </div>
        </div>

        <div className="services-section">
          <h3>Servicios autorizados</h3>
          {order.services.map((service, idx) => (
            <div key={idx} className="service-item-public">
              <span>{service.name}</span>
              {service.price > 0 && <span className="text-primary">${service.price}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Pending Authorizations */}
      {pendingUpdates.length > 0 && (
        <div className="pending-auth-section">
          <h3 className="section-title-warning">⚠️ Requiere tu autorización</h3>
          {pendingUpdates.map(update => (
            <div key={update.id} className="update-card-auth card">
              <div className="update-type-badge">{update.update_type}</div>

              <h4>{update.title}</h4>
              <p>{update.description}</p>

              {update.estimated_price > 0 && (
                <div className="price-highlight">
                  Precio estimado: <strong>${update.estimated_price}</strong>
                </div>
              )}

              {update.photos && update.photos.length > 0 && (
                <div className="evidence-photos">
                  {update.photos.map((photo, idx) => (
                    <img key={idx} src={photo.url} alt={photo.description || `Foto ${idx + 1}`} />
                  ))}
                </div>
              )}

              <div className="auth-buttons">
                <button
                  className="btn btn-success"
                  onClick={() => handleAuthorization(update.id, true)}
                  disabled={processingUpdate === update.id}
                >
                  <Check size={18} />
                  Autorizar
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleAuthorization(update.id, false)}
                  disabled={processingUpdate === update.id}
                >
                  <X size={18} />
                  No autorizar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* History Timeline */}
      {(approvedUpdates.length > 0 || rejectedUpdates.length > 0 || infoUpdates.length > 0) && (
        <div className="updates-timeline">
          <h3>Historial de novedades</h3>

          {approvedUpdates.map(update => (
            <div key={update.id} className="update-card-readonly card approved">
              <div className="update-header">
                <span className="update-type">{update.update_type}</span>
                <span className="status-badge approved">✅ Aprobado</span>
              </div>
              <h4>{update.title}</h4>
              <p>{update.description}</p>
              {update.estimated_price > 0 && (
                <div className="update-price">+${update.estimated_price}</div>
              )}
            </div>
          ))}

          {rejectedUpdates.map(update => (
            <div key={update.id} className="update-card-readonly card rejected">
              <div className="update-header">
                <span className="update-type">{update.update_type}</span>
                <span className="status-badge rejected">❌ Rechazado</span>
              </div>
              <h4>{update.title}</h4>
              <p>{update.description}</p>
            </div>
          ))}

          {infoUpdates.map(update => (
            <div key={update.id} className="update-card-readonly card">
              <div className="update-header">
                <span className="update-type">{update.update_type}</span>
                <span className="date-text">{new Date(update.created_at).toLocaleDateString('es-MX')}</span>
              </div>
              <h4>{update.title}</h4>
              <p>{update.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Total Breakdown */}
      <div className="total-breakdown card">
        <h3>Resumen de cobro</h3>

        <div className="breakdown-row">
          <span>Servicios iniciales</span>
          <strong>${servicesTotal}</strong>
        </div>

        {approvedUpdates.map(update => (
          <div key={update.id} className="breakdown-row approved">
            <span>+ {update.title}</span>
            <strong>${update.estimated_price}</strong>
          </div>
        ))}

        {pendingUpdates.map(update => (
          <div key={update.id} className="breakdown-row pending">
            <span>? {update.title} (pendiente)</span>
            <span className="text-muted">Por confirmar</span>
          </div>
        ))}

        <div className="divider" />

        <div className="breakdown-row total">
          <span>Total a pagar</span>
          <strong className="text-primary">${finalTotal}</strong>
        </div>

        {order.advance_payment > 0 && (
          <div className="breakdown-row">
            <span>Anticipo pagado</span>
            <strong className="text-success">-${order.advance_payment}</strong>
          </div>
        )}

        <div className="breakdown-row balance">
          <span>Saldo pendiente</span>
          <strong className="text-accent">${balance}</strong>
        </div>

        <div className="payment-status">
          {order.is_paid ? (
            <span className="badge badge-success">PAGADO</span>
          ) : (
            <span className="badge badge-warning">PENDIENTE</span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="portal-footer">
        <p>¿Dudas? Llámanos</p>
        <a href="tel:5551234567" className="btn btn-outline">
          <Phone size={18} />
          (555) 123-4567
        </a>
      </div>

      <style>{`
        .client-portal {
          max-width: 600px;
          margin: 0 auto;
          padding: var(--spacing-lg);
          background: var(--bg-primary);
          min-height: 100vh;
        }

        .loading-screen, .error-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          text-align: center;
          gap: var(--spacing-md);
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid var(--border-color);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .workshop-header {
          text-align: center;
          padding: var(--spacing-xl) 0;
          border-bottom: 2px solid var(--border-color);
          margin-bottom: var(--spacing-xl);
        }

        .workshop-header h1 {
          font-size: 1.75rem;
          margin-bottom: var(--spacing-xs);
        }

        .workshop-header p {
          color: var(--text-secondary);
        }

        .order-summary-public {
          margin-bottom: var(--spacing-lg);
        }

        .summary-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-lg);
        }

        .summary-header h2 {
          font-size: 1.25rem;
          color: var(--primary);
        }

        .summary-details {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .detail-row {
          display: flex;
          gap: var(--spacing-md);
          align-items: flex-start;
        }

        .detail-row > svg {
          color: var(--primary);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .detail-row > div {
          display: flex;
          flex-direction: column;
        }

        .detail-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-secondary {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .services-section {
          margin-top: var(--spacing-lg);
          padding-top: var(--spacing-lg);
          border-top: 1px solid var(--border-color);
        }

        .services-section h3 {
          font-size: 1rem;
          margin-bottom: var(--spacing-md);'
        }

        .service-item-public {
          display: flex;
          justify-content: space-between;
          padding: var(--spacing-sm) 0;
          border-bottom: 1px solid var(--border-color);
        }

        .service-item-public:last-child {
          border-bottom: none;
        }

        .section-title-warning {
          font-size: 1.125rem;
          color: var(--warning);
          margin-bottom: var(--spacing-md);
        }

        .pending-auth-section {
          margin-bottom: var(--spacing-lg);
        }

        .update-card-auth {
          border: 2px solid var(--warning);
          margin-bottom: var(--spacing-md);
        }

        .update-type-badge {
          display: inline-block;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          padding: var(--spacing-xs) var(--spacing-sm);
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: uppercase;
          margin-bottom: var(--spacing-sm);
        }

        .update-card-auth h4 {
          font-size: 1.125rem;
          margin-bottom: var(--spacing-sm);
        }

        .update-card-auth p {
          color: var(--text-secondary);
          margin-bottom: var(--spacing-md);
        }

        .price-highlight {
          background: var(--bg-tertiary);
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-md);
          text-align: center;
        }

        .price-highlight strong {
          color: var(--primary);
          font-size: 1.25rem;
        }

        .evidence-photos {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-sm);
          margin: var(--spacing-md) 0;
        }

        .evidence-photos img {
          width: 100%;
          border-radius: var(--radius-md);
          aspect-ratio: 1;
          object-fit: cover;
        }

        .auth-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-sm);
        }

        .btn-success {
          background: var(--success);
          color: white;
        }

        .btn-danger {
          background: var(--danger);
          color: white;
        }

        .updates-timeline {
          margin-bottom: var(--spacing-lg);
        }

        .updates-timeline h3 {
          font-size: 1rem;
          margin-bottom: var(--spacing-md);
        }

        .update-card-readonly {
          margin-bottom: var(--spacing-sm);
        }

        .update-card-readonly.approved {
          border-left: 4px solid var(--success);
        }

        .update-card-readonly.rejected {
          border-left: 4px solid var(--danger);
        }

        .update-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-sm);
        }

        .status-badge {
          font-size: 0.75rem;
          padding: var(--spacing-xs) var(--spacing-sm);
          border-radius: var(--radius-full);
        }

        .status-badge.approved {
          background: rgba(0, 255, 136, 0.15);
          color: var(--success);
        }

        .status-badge.rejected {
          background: rgba(255, 51, 102, 0.15);
          color: var(--danger);
        }

        .update-price {
          color: var(--primary);
          font-weight: 600;
          margin-top: var(--spacing-sm);
        }

        .total-breakdown {
          margin-bottom: var(--spacing-lg);
        }

        .total-breakdown h3 {
          font-size: 1rem;
          margin-bottom: var(--spacing-md);
        }

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          padding: var(--spacing-sm) 0;
        }

        .breakdown-row.approved {
          color: var(--success);
        }

        .breakdown-row.pending {
          color: var(--text-muted);
          font-style: italic;
        }

        .breakdown-row.total {
          font-size: 1.125rem;
          font-weight: 600;
          padding-top: var(--spacing-md);
        }

        .breakdown-row.balance {
          font-size: 1.25rem;
          font-weight: 700;
        }

        .payment-status {
          margin-top: var(--spacing-md);
          padding-top: var(--spacing-md);
          border-top: 1px solid var(--border-color);
          text-align: center;
        }

        .portal-footer {
          text-align: center;
          padding: var(--spacing-xl) 0;
        }

        .portal-footer p {
          margin-bottom: var(--spacing-md);
          color: var(--text-secondary);
        }

        .date-text {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .status-progress {
          margin-bottom: var(--spacing-lg);
          padding: var(--spacing-lg);
        }

        .progress-header {
          display: flex;
          gap: var(--spacing-md);
          align-items: center;
          margin-bottom: var(--spacing-lg);
        }

        .status-icon-wrapper {
          width: 48px;
          height: 48px;
          background: var(--bg-tertiary);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .status-icon {
          color: var(--primary);
        }

        .progress-header h3 {
          font-size: 1.125rem;
          font-weight: 700;
          margin-bottom: 2px;
        }

        .progress-header p {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .progress-bar-container {
          height: 8px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-full);
          overflow: visible;
          margin-bottom: var(--spacing-lg);
          position: relative;
        }

        .progress-bar-fill {
          height: 100%;
          transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          border-radius: var(--radius-full);
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        }

        .progress-steps {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: var(--spacing-xs);
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-xs);
          opacity: 0.4;
          transition: all 0.3s;
        }

        .step.active {
          opacity: 1;
        }

        .step.completed {
          opacity: 0.8;
        }

        .step-dot {
          width: 44px;
          height: 44px;
          background: var(--bg-tertiary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
          color: var(--text-muted);
        }

        .step.active .step-dot {
          background: var(--primary);
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
          color: white;
        }

        .step.completed .step-dot {
          background: var(--success);
          color: white;
        }

        .step span {
          font-size: 0.75rem;
          text-align: center;
          font-weight: 500;
        }

        .step.active span {
          font-weight: 700;
          color: var(--primary);
        }
      `}</style>
    </div>
  );
}
