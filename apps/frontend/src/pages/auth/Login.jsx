import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { nextFromSearch } from '../../lib/safeNext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle, LogIn, UserX, XCircle } from 'lucide-react';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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

      // Volver a donde iba (enlace de WhatsApp, etc.) si es una ruta interna segura;
      // si no, al inicio según el rol.
      const next = nextFromSearch(location.search);
      if (next) {
        navigate(next, { replace: true });
      } else if (user.role === 'admin') {
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
      <div className="login-container">
        <div className="login-card">
          {/* Logo */}
          <div className="login-header">
            <img src="/logo-mark.png" alt="MotoPartes Club" className="login-logo-img" width="177" height="129" />
            <h1 className="login-title">Iniciar sesión</h1>
            <p className="login-subtitle">Sistema de gestión de taller</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className={`login-form ${shake ? 'shake' : ''}`}>
            {/* Error display with animation */}
            {error && (
              <div key={errorKey} className={`login-error ${errorType === 'inactive' ? 'is-warn' : 'is-error'}`} role="alert">
                <span className="login-error__ico">
                  {errorType === 'inactive' ? <UserX size={20} /> : <XCircle size={20} />}
                </span>
                <div className="login-error__txt">
                  <strong>{errorType === 'inactive' ? 'Cuenta desactivada' : 'Datos incorrectos'}</strong>
                  <p>{error}</p>
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
          <p>© 2026 MotoPartes Club • Reparaciones y Modificaciones</p>
          <p style={{ marginTop: '4px', opacity: 0.8, fontSize: '0.75rem', fontWeight: 500 }}>
            Dev Full Stack - Amaury Gordillo
          </p>
        </div>
      </div>

      <style>{`
        .login-page { min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; padding: 24px 16px; background: var(--bg); }
        .login-container { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 20px; }
        .login-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--sh-2); padding: 32px 28px 28px; }
        .login-header { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 24px; }
        .login-logo-img { height: 112px; width: auto; max-width: 100%; object-fit: contain; margin-bottom: 16px; }
        .login-title { font-size: 1.5rem; font-weight: 700; line-height: 1.2; color: var(--text); }
        .login-subtitle { margin-top: 4px; font-size: 14px; color: var(--ink-3); }
        .login-form { display: flex; flex-direction: column; gap: 16px; }
        .login-form .form-group { display: flex; flex-direction: column; gap: 6px; margin: 0; }
        .login-form .form-label { font-size: 13px; font-weight: 500; color: var(--text-2); }
        .login-input-wrapper { position: relative; display: block; }
        .login-input-wrapper .input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-3); pointer-events: none; }
        .login-input-wrapper .form-input { width: 100%; min-height: 46px; padding: 10px 44px 10px 40px; font-size: 16px; border: 1px solid var(--line-strong); border-radius: var(--r-control); background: var(--surface); color: var(--text); box-sizing: border-box; }
        .login-input-wrapper .form-input:focus { border-color: var(--brand); box-shadow: var(--ring); outline: none; }
        .login-input-wrapper .password-toggle { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: none; border-radius: var(--r-control); color: var(--text-3); cursor: pointer; }
        .login-input-wrapper .password-toggle:hover { background: var(--surface-2); color: var(--text); }
        .login-submit-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 46px; margin-top: 4px; border: 1px solid var(--brand); border-radius: var(--r-control); background: var(--brand); color: #fff; font: 600 15px var(--font-sans); cursor: pointer; box-shadow: var(--sh-1); transition: background 120ms ease; }
        .login-submit-btn:hover:not(:disabled) { background: var(--brand-hover); border-color: var(--brand-hover); }
        .login-submit-btn:focus-visible { box-shadow: var(--ring); }
        .login-submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }
        .login-submit-btn .spinner { display: inline-block; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: login-spin 0.7s linear infinite; }
        .login-error { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: var(--r-control); border: 1px solid var(--danger-line); background: var(--danger-bg); animation: login-in 0.3s ease-out; }
        .login-error.is-warn { border-color: var(--warning-line); background: var(--warning-bg); }
        .login-error__ico { flex: 0 0 auto; display: inline-flex; margin-top: 1px; color: var(--danger); }
        .login-error.is-warn .login-error__ico { color: var(--warning); }
        .login-error__txt { min-width: 0; }
        .login-error__txt strong { display: block; font-size: 14px; font-weight: 600; color: var(--text); }
        .login-error__txt p { margin: 2px 0 0; font-size: 13.5px; line-height: 1.45; color: var(--text-2); overflow-wrap: anywhere; }
        .login-footer { text-align: center; font-size: 12.5px; color: var(--ink-3); }
        .login-footer p { margin: 0; }
        .login-form.shake { animation: login-shake 0.4s ease; }
        @keyframes login-spin { to { transform: rotate(360deg); } }
        @keyframes login-in { from { opacity: 0; transform: translateY(-4px); } }
        @keyframes login-shake { 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
        @media (max-width: 480px) { .login-card { padding: 24px 18px 20px; } .login-logo-img { height: 96px; } }
        @media (prefers-reduced-motion: reduce) { .login-form.shake, .login-error { animation: none; } }
      `}</style>
    </div>
  );
}
