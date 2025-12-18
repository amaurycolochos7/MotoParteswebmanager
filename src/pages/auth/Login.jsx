import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle, LogIn, UserX, XCircle } from 'lucide-react';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState(''); // 'credentials', 'inactive', 'empty'
  const [isLoading, setIsLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [errorKey, setErrorKey] = useState(0); // Para forzar re-render del error

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrorType('');

    if (!email.trim() || !password.trim()) {
      setError('Por favor ingresa tu email y contraseña');
      setErrorType('empty');
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      const user = await login(email, password);

      // Redirigir según rol
      if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/mechanic');
      }
    } catch (err) {
      console.log('CATCH TRIGGERED - err:', err);
      const message = err?.message || 'Error desconocido';

      // Detectar tipo de error
      let type = 'credentials';
      let msg = 'Email o contraseña incorrectos. Verifica tus datos.';

      if (message.toLowerCase().includes('inactivo') || message.toLowerCase().includes('desactivad')) {
        type = 'inactive';
        msg = '🚫 Tu cuenta ha sido desactivada por el administrador.';
      } else {
        msg = '❌ Email o contraseña incorrectos.';
      }

      // MOSTRAR TOAST - esto SÍ funciona
      toast.error(msg);

      // También actualizar estados por si el inline funciona
      setErrorType(type);
      setError(msg);
      setErrorKey(prev => prev + 1);
      triggerShake();
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  return (
    <div className="login-page">
      {/* Background decorations */}
      <div className="login-bg-decor">
        <div className="bg-circle bg-circle-1"></div>
        <div className="bg-circle bg-circle-2"></div>
        <div className="bg-circle bg-circle-3"></div>
      </div>

      <div className="login-container">
        <div className="login-card">
          {/* Logo */}
          <div className="login-header">
            <div className="login-logo-container">
              <img
                src="/logo.png"
                alt="MotoPartes Club"
                className="login-logo-img"
              />
            </div>
            <h1 className="login-title">
              <span className="title-moto">MOTO</span>
              <span className="title-partes">PARTES</span>
            </h1>
            <p className="login-subtitle">Sistema de Gestión de Taller</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className={`login-form ${shake ? 'shake' : ''}`}>
            {/* Error display with animation */}
            {error && (
              <div
                key={errorKey}
                style={{
                  padding: '16px 18px',
                  marginBottom: '16px',
                  borderRadius: '14px',
                  background: errorType === 'inactive'
                    ? 'linear-gradient(135deg, #fffbeb, #fef3c7)'
                    : 'linear-gradient(135deg, #fef2f2, #fee2e2)',
                  border: `2px solid ${errorType === 'inactive' ? '#fcd34d' : '#fca5a5'}`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  animation: 'errorSlideIn 0.4s ease-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    minWidth: '46px',
                    borderRadius: '12px',
                    background: errorType === 'inactive' ? '#fde68a' : '#fecaca',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: 'iconPulse 0.5s ease-out',
                  }}>
                    {errorType === 'inactive'
                      ? <UserX size={24} color="#b45309" />
                      : <XCircle size={24} color="#dc2626" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <strong style={{
                      display: 'block',
                      fontSize: '16px',
                      fontWeight: 700,
                      color: errorType === 'inactive' ? '#92400e' : '#991b1b',
                      marginBottom: '6px'
                    }}>
                      {errorType === 'inactive' ? '🚫 Cuenta Desactivada' : '❌ Datos Incorrectos'}
                    </strong>
                    <p style={{
                      margin: 0,
                      fontSize: '14px',
                      lineHeight: '1.5',
                      color: '#475569'
                    }}>
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Correo Electrónico</label>
              <div className="input-with-icon login-input-wrapper">
                <Mail className="input-icon" size={20} />
                <input
                  type="email"
                  className="form-input"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <div className="input-with-icon login-input-wrapper">
                <Lock className="input-icon" size={20} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-submit-btn"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner" style={{ width: 20, height: 20 }}></span>
                  Iniciando...
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  Iniciar Sesión
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="login-footer">
          <p>© 2025 MotoPartes Club • Reparaciones y Modificaciones</p>
        </div>
      </div>

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          padding: var(--spacing-lg);
          position: relative;
          overflow: hidden;
        }

        .login-bg-decor {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .bg-circle {
          position: absolute;
          border-radius: 50%;
          opacity: 0.1;
        }

        .bg-circle-1 {
          width: 600px;
          height: 600px;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          top: -200px;
          right: -200px;
          animation: float 20s ease-in-out infinite;
        }

        .bg-circle-2 {
          width: 400px;
          height: 400px;
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          bottom: -100px;
          left: -100px;
          animation: float 15s ease-in-out infinite reverse;
        }

        .bg-circle-3 {
          width: 300px;
          height: 300px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: pulse 10s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, 30px); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.05; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.15; transform: translate(-50%, -50%) scale(1.1); }
        }

        @keyframes errorSlideIn {
          0% { 
            opacity: 0; 
            transform: translateY(-20px) scale(0.95); 
          }
          100% { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
        }

        @keyframes iconPulse {
          0% { transform: scale(0.5); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }

        .login-form.shake {
          animation: shake 0.6s ease-in-out;
        }

        .login-container {
          width: 100%;
          max-width: 440px;
          position: relative;
          z-index: 1;
        }

        .login-card {
          background: rgba(255, 255, 255, 0.98);
          border-radius: 24px;
          box-shadow: 
            0 25px 50px -12px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.1);
          padding: 40px 36px;
          backdrop-filter: blur(20px);
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-logo-container {
          width: 140px;
          height: 140px;
          margin: 0 auto 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: logoEntry 0.8s ease-out;
        }

        @keyframes logoEntry {
          from {
            opacity: 0;
            transform: scale(0.8) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .login-logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .login-title {
          font-size: 2rem;
          font-weight: 800;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
          display: flex;
          justify-content: center;
          gap: 6px;
        }

        .title-moto {
          color: #1e293b;
        }

        .title-partes {
          color: #ef4444;
        }

        .login-subtitle {
          color: #64748b;
          font-size: 1rem;
          font-weight: 500;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-input-wrapper {
          background: #f8fafc;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          transition: all 0.2s ease;
        }

        .login-input-wrapper:focus-within {
          border-color: #ef4444;
          background: white;
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.1);
        }

        .login-input-wrapper .form-input {
          background: transparent;
          border: none;
        }

        .login-input-wrapper .form-input:focus {
          box-shadow: none;
        }

        /* Shake Animation */
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }

        .login-form.shake {
          animation: shake 0.5s ease-in-out;
        }

        /* Error Box Styles */
        .login-error-box {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 16px 18px;
          border-radius: 14px;
          animation: slideIn 0.3s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .login-error-box.credentials {
          background: linear-gradient(135deg, #fef2f2, #fee2e2);
          border: 2px solid #fecaca;
        }

        .login-error-box.credentials .error-icon {
          color: #dc2626;
          background: #fee2e2;
        }

        .login-error-box.inactive {
          background: linear-gradient(135deg, #fffbeb, #fef3c7);
          border: 2px solid #fde68a;
        }

        .login-error-box.inactive .error-icon {
          color: #d97706;
          background: #fef3c7;
        }

        .login-error-box.empty {
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
          border: 2px solid #bae6fd;
        }

        .login-error-box.empty .error-icon {
          color: #0284c7;
          background: #e0f2fe;
        }

        .error-icon {
          width: 44px;
          height: 44px;
          min-width: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .error-content {
          flex: 1;
        }

        .error-title {
          display: block;
          font-size: 0.9375rem;
          font-weight: 700;
          margin-bottom: 4px;
          color: #1e293b;
        }

        .error-message {
          margin: 0;
          font-size: 0.8125rem;
          line-height: 1.5;
          color: #475569;
        }

        .password-toggle {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }

        .password-toggle:hover {
          color: #1e293b;
        }

        .login-submit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 16px 24px;
          background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          margin-top: 8px;
        }

        .login-submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
          background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
        }

        .login-submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .login-demo-info {
          margin-top: 28px;
          padding: 16px;
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          border: 1px solid #bae6fd;
          border-radius: 12px;
          text-align: center;
          font-size: 0.875rem;
          color: #0369a1;
        }

        .login-demo-info strong {
          color: #0c4a6e;
        }

        .login-demo-info p {
          margin: 0;
        }

        .login-demo-info p:last-child {
          margin-top: 4px;
          font-family: monospace;
          font-size: 0.8rem;
        }

        .login-footer {
          text-align: center;
          margin-top: 24px;
          color: #64748b;
          font-size: 0.8rem;
        }

        /* Mobile improvements */
        @media (max-width: 480px) {
          .login-card {
            padding: 32px 24px;
            border-radius: 20px;
          }

          .login-logo-container {
            width: 120px;
            height: 120px;
          }

          .login-title {
            font-size: 1.75rem;
          }

          .login-submit-btn {
            padding: 14px 20px;
          }
        }
      `}</style>
    </div>
  );
}
