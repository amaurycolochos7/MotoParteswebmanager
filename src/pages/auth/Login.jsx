import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);

      if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/mechanic');
      }
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Logo */}
        <div className="login-header">
          <div className="login-logo">
            <img
              src="/logo.jpg"
              alt="MOTOPARTES CLUB"
              className="login-logo-img"
            />
          </div>
          <h1 className="login-title">Motopartes Manager</h1>
          <p className="login-subtitle">Sistema de Gestión de Taller</p>
        </div>

        {/* Demo Credentials */}
        <div className="demo-box">
          <p className="demo-title">Credenciales de prueba</p>
          <div className="demo-credentials">
            <div>
              <span className="demo-label">Admin:</span>
              <span>admin@motopartes.com / admin123</span>
            </div>
            <div>
              <span className="demo-label">Mecánico:</span>
              <span>mecanico@motopartes.com / mech123</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="error-alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Correo electrónico</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={18} />
              <input
                type="email"
                className="form-input"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{ paddingLeft: '44px' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <div className="input-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ paddingLeft: '44px', paddingRight: '44px' }}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
            style={{ marginTop: 'var(--spacing-md)' }}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Ingresando...
              </>
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        <p className="login-footer">© 2024 Motopartes Manager</p>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--spacing-md);
          background: var(--bg-primary);
        }

        .login-container {
          width: 100%;
          max-width: 380px;
        }

        .login-header {
          text-align: center;
          margin-bottom: var(--spacing-xl);
        }

        .login-logo {
          width: 140px;
          height: 140px;
          margin: 0 auto var(--spacing-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeInScale 0.8s ease-out;
        }

        .login-logo-img {
          width: 140px;
          height: 140px;
          object-fit: cover;
          border-radius: 50%;
          background: white;
          padding: 8px;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.3);
          animation: gentleSpin 20s linear infinite, glowPulse 4s ease-in-out infinite;
          transition: all var(--transition-normal);
        }

        .login-logo-img:hover {
          transform: scale(1.08);
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.5), 0 8px 30px rgba(239, 68, 68, 0.4);
          animation-play-state: paused;
        }

        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.8) translateY(-30px) rotate(-10deg);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0) rotate(0deg);
          }
        }

        @keyframes gentleSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes glowPulse {
          0%, 100% {
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.3), 0 0 20px rgba(239, 68, 68, 0.2);
          }
          50% {
            box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.4);
          }
        }

        .login-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: var(--spacing-xs);
        }

        .login-subtitle {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .demo-box {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
        }

        .demo-title {
          font-size: 0.6875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--spacing-sm);
        }

        .demo-credentials {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xs);
          font-size: 0.8125rem;
        }

        .demo-credentials > div {
          display: flex;
          gap: var(--spacing-sm);
        }

        .demo-label {
          color: var(--text-muted);
          min-width: 65px;
        }

        .login-form {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: var(--spacing-lg);
        }

        .error-alert {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-md);
          background: var(--danger-light);
          border: 1px solid var(--danger);
          border-radius: var(--radius-md);
          color: var(--danger);
          margin-bottom: var(--spacing-md);
          font-size: 0.875rem;
        }

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: var(--spacing-md);
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
        }

        .password-toggle {
          position: absolute;
          right: var(--spacing-sm);
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: var(--spacing-xs);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .password-toggle:hover {
          color: var(--text-primary);
        }

        .login-footer {
          text-align: center;
          margin-top: var(--spacing-lg);
          color: var(--text-muted);
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}
