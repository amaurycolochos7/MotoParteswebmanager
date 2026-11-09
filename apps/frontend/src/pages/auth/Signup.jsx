import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, Phone, Wrench, UserPlus, AlertCircle, Gift } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { captureReferralFromUrl, getStoredReferral, clearStoredReferral } from '../../lib/referral';

export default function Signup() {
    const navigate = useNavigate();
    const toast = useToast();
    const { register } = useAuth();

    const [form, setForm] = useState({
        fullName: '',
        workshopName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [refSlug, setRefSlug] = useState(null);

    useEffect(() => {
        // Si llegó con ?ref=... lo capturamos; si no, recuperamos el stored.
        const fresh = captureReferralFromUrl();
        setRefSlug(fresh || getStoredReferral());
    }, []);

    const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.fullName.trim() || !form.workshopName.trim() || !form.email.trim() || !form.password) {
            setError('Por favor completa todos los campos obligatorios.');
            return;
        }
        if (form.password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (form.password !== form.confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setLoading(true);
        try {
            const res = await register({
                email: form.email.trim().toLowerCase(),
                password: form.password,
                fullName: form.fullName.trim(),
                workshopName: form.workshopName.trim(),
                phone: form.phone.trim() || null,
                businessType: 'motorcycle',
                referralSlug: refSlug || null,
            });
            toast.success(res?.message || '¡Bienvenido a MotoPartes!');
            // El referral ya fue atribuido en el backend (si era válido) —
            // limpiamos el localStorage para que no se atribuya 2 veces.
            clearStoredReferral();
            // Auto-login path: register returns { user, memberships, token }.
            // Go to onboarding wizard so the owner finishes setup.
            navigate('/onboarding', { replace: true });
        } catch (err) {
            setError(err?.message || 'No pudimos completar el registro.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="signup-page">
            <div className="signup-container">
                <div className="signup-card">
                    <div className="signup-header">
                        <img src="/logo-mark.png" alt="MotoPartes" className="signup-logo-img" width="132" height="96" />
                        <h1 className="signup-title">Crear cuenta</h1>
                        <p className="signup-subtitle">Crea la cuenta de tu taller</p>
                    </div>

                    {refSlug && (
                        <div className="signup-ref-badge">
                            <Gift size={18} />
                            <span>Registro referido por <strong>{refSlug}</strong></span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="signup-form">
                        {error && (
                            <div className="signup-error-box">
                                <AlertCircle size={22} color="#dc2626" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Tu nombre</label>
                                <div className="input-with-icon signup-input-wrapper">
                                    <User className="input-icon" size={18} />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Juan Pérez"
                                        value={form.fullName}
                                        onChange={update('fullName')}
                                        autoComplete="name"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Nombre del taller</label>
                                <div className="input-with-icon signup-input-wrapper">
                                    <Wrench className="input-icon" size={18} />
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Taller Juárez"
                                        value={form.workshopName}
                                        onChange={update('workshopName')}
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Correo electrónico</label>
                                <div className="input-with-icon signup-input-wrapper">
                                    <Mail className="input-icon" size={18} />
                                    <input
                                        type="email"
                                        className="form-input"
                                        placeholder="correo@taller.com"
                                        value={form.email}
                                        onChange={update('email')}
                                        autoComplete="email"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Teléfono (opcional)</label>
                                <div className="input-with-icon signup-input-wrapper">
                                    <Phone className="input-icon" size={18} />
                                    <input
                                        type="tel"
                                        className="form-input"
                                        placeholder="55 1234 5678"
                                        value={form.phone}
                                        onChange={update('phone')}
                                        autoComplete="tel"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Contraseña (mín. 8 caracteres)</label>
                            <div className="input-with-icon signup-input-wrapper">
                                <Lock className="input-icon" size={18} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={update('password')}
                                    autoComplete="new-password"
                                    style={{ paddingRight: '3rem' }}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label="Mostrar contraseña"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirmar contraseña</label>
                            <div className="input-with-icon signup-input-wrapper">
                                <Lock className="input-icon" size={18} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="••••••••"
                                    value={form.confirmPassword}
                                    onChange={update('confirmPassword')}
                                    autoComplete="new-password"
                                    required
                                />
                            </div>
                        </div>

                        <p className="signup-notice">
                            MotoPartes está en lanzamiento controlado. Al registrarte entrarás en la lista de activación y te avisaremos por correo en cuanto esté listo tu taller.
                        </p>

                        <button
                            type="submit"
                            className="signup-submit-btn"
                            disabled={loading}
                        >
                            {loading ? (
                                <><span className="spinner" style={{ width: 20, height: 20 }}></span>Creando cuenta...</>
                            ) : (
                                <><UserPlus size={20} />Crear cuenta</>
                            )}
                        </button>

                        <div className="signup-links">
                            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
                        </div>
                    </form>
                </div>

                <div className="signup-footer">
                    <p>© 2026 MotoPartes • Sistema de gestión para talleres de motos</p>
                </div>
            </div>

            <style>{signupStyles}</style>
        </div>
    );
}

const signupStyles = `
.signup-page { min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; background: var(--bg); padding: 24px 16px; }
.signup-container { width: 100%; max-width: 560px; display: flex; flex-direction: column; gap: 16px; }
.signup-card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--sh-2); padding: 32px 28px; }
.signup-header { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 24px; }
.signup-logo-img { height: 96px; width: auto; max-width: 100%; object-fit: contain; margin-bottom: 14px; }
.signup-title { font-size: 1.5rem; font-weight: 700; line-height: 1.2; color: var(--text); margin: 0; }
.signup-subtitle { margin: 4px 0 0; font-size: 14px; color: var(--ink-3); }
.signup-form { display: flex; flex-direction: column; gap: 16px; }
.form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 520px) { .form-row { grid-template-columns: 1fr; } }
.signup-form .form-group { display: flex; flex-direction: column; gap: 6px; margin: 0; min-width: 0; }
.signup-form .form-label { font-size: 13px; font-weight: 500; color: var(--text-2); }
.signup-input-wrapper { position: relative; background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--r-control); transition: border-color 120ms ease, box-shadow 120ms ease; }
.signup-input-wrapper:focus-within { border-color: var(--brand); box-shadow: var(--ring); }
.signup-input-wrapper .form-input { background: transparent; border: none; min-height: 44px; width: 100%; font-size: 16px; }
.signup-input-wrapper .form-input:focus { box-shadow: none; outline: none; }
.password-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; background: none; border: none; color: var(--text-3); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: var(--r-control); }
.password-toggle:hover { color: var(--text); background: var(--surface-2); }
.signup-error-box { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: var(--danger-bg); border: 1px solid var(--danger-line); border-radius: var(--r-control); color: #912018; font-size: 13.5px; line-height: 1.45; }
.signup-notice { margin: 0; font-size: 13px; color: var(--text-2); line-height: 1.5; text-align: center; padding: 12px 14px; background: var(--surface-2); border-radius: var(--r-control); }
.signup-submit-btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 46px; padding: 0 24px; background: var(--brand); color: #fff; border: 1px solid var(--brand); border-radius: var(--r-control); font: 600 15px var(--font-sans); cursor: pointer; box-shadow: var(--sh-1); transition: background 120ms ease; }
.signup-submit-btn:hover:not(:disabled) { background: var(--brand-hover); border-color: var(--brand-hover); }
.signup-submit-btn:disabled { opacity: 0.65; cursor: not-allowed; }
.signup-links { text-align: center; margin-top: 4px; color: var(--ink-3); font-size: 14px; }
.signup-links a { color: var(--brand); font-weight: 600; text-decoration: none; }
.signup-links a:hover { text-decoration: underline; }
.signup-footer { text-align: center; color: var(--ink-3); font-size: 12.5px; }
.signup-footer p { margin: 0; }
.signup-ref-badge { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--warning-bg); color: #93370d; border: 1px solid var(--warning-line); border-radius: var(--r-control); font-size: 13.5px; margin-bottom: 16px; }
.signup-ref-badge strong { color: #93370d; }
@media (max-width: 480px) { .signup-card { padding: 24px 18px; } }
`;
