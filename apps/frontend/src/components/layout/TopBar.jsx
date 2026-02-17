import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

export default function TopBar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Check if admin is in mechanic routes
  const isAdmin = user?.role === 'admin';
  const isInMechanicRoute = location.pathname.startsWith('/mechanic');
  const showAdminButton = isAdmin && isInMechanicRoute;

  return (
    <div className="top-bar">
      <div className="top-bar-content">
        <div className="top-bar-left">
          <img
            src="/logo.jpg"
            alt="MOTOPARTES CLUB Logo"
            className="top-bar-logo"
          />
          <div className="user-info">
            <span className="user-role">
              {user?.role === 'admin' ? 'ADMIN' : 'MECÁNICO'}
            </span>
            <span className="user-name">{user?.full_name}</span>
          </div>
        </div>
        <div className="top-bar-actions">
          {showAdminButton && (
            <button
              className="admin-button"
              onClick={() => navigate('/admin')}
              title="Volver a Panel Admin"
            >
              <ShieldCheck size={18} />
              <span>Admin</span>
            </button>
          )}
          <button
            className="logout-button"
            onClick={logout}
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <style>{`
        .top-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border-color);
          z-index: 1000;
          padding: var(--spacing-sm) var(--spacing-md);
        }

        .top-bar-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .top-bar-left {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }

        .top-bar-logo {
          height: 36px;
          width: 36px;
          object-fit: contain;
          border-radius: 50%;
          background: white;
          padding: 4px;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
          animation: fadeInLogo 0.6s ease-out, floatRotate 6s ease-in-out infinite, pulseGlow 3s ease-in-out infinite;
          transition: all var(--transition-normal);
          cursor: pointer;
        }

        .top-bar-logo:hover {
          transform: scale(1.1) rotate(5deg);
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.4), 0 4px 20px rgba(239, 68, 68, 0.4);
          animation-play-state: paused;
        }

        @keyframes fadeInLogo {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes floatRotate {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          25% {
            transform: translateY(-3px) rotate(2deg);
          }
          50% {
            transform: translateY(0) rotate(0deg);
          }
          75% {
            transform: translateY(3px) rotate(-2deg);
          }
        }

        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2), 0 0 10px rgba(239, 68, 68, 0.1);
          }
          50% {
            box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.4), 0 0 20px rgba(239, 68, 68, 0.3);
          }
        }

        .user-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .user-role {
          font-size: 0.6875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 600;
        }

        .user-name {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .top-bar-actions {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
        }

        .admin-button {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--primary);
          border: none;
          padding: 6px 12px;
          border-radius: var(--radius-md);
          color: white;
          cursor: pointer;
          transition: all var(--transition-fast);
          font-weight: 600;
          font-size: 0.8125rem;
        }

        .admin-button:hover {
          background: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
        }

        .logout-button {
          background: transparent;
          border: 1px solid var(--border-color);
          width: 32px;
          height: 32px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .logout-button:hover {
          background: var(--danger);
          border-color: var(--danger);
          color: white;
        }

        /* Responsive adjustments */
        @media (max-width: 640px) {
          .top-bar-logo {
            height: 28px;
            width: 28px;
            padding: 3px;
          }
          
          .top-bar-left {
            gap: var(--spacing-sm);
          }
          
          .user-name {
            font-size: 0.8125rem;
          }
        }
      `}</style>
    </div>
  );
}
