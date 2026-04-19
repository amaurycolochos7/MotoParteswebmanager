import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, Phone, Wrench, UserPlus, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

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
            });
            toast.success(res?.message || '¡Bienvenido a MotoPartes!');
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
            <div className="signup-bg-decor">
                <div className="bg-circle bg-circle-1"></div>
                <div className="bg-circle bg-circle-2"></div>
                <div className="bg-circle bg-circle-3"></div>
            </div>

            <div className="signup-container">
                <div className="signup-card">
                    <div className="signup-header">
                        <div className="signup-logo-container">
                            <img src="/logo.png" alt="MotoPartes" className="signup-logo-img" />
                        </div>
                        <h1 className="signup-title">
                            <span className="title-moto">MOTO</span>
                            <span className="title-partes">PARTES</span>
                        </h1>
                        <p className="signup-subtitle">Crea la cuenta de tu taller</p>
                    </div>

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
.signup-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    padding: var(--spacing-lg, 16px);
    position: relative;
    overflow: hidden;
}
.signup-bg-decor { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.1; }
.bg-circle-1 { width: 600px; height: 600px; background: linear-gradient(135deg, #ef4444, #dc2626); top: -200px; right: -200px; animation: float 20s ease-in-out infinite; }
.bg-circle-2 { width: 400px; height: 400px; background: linear-gradient(135deg, #3b82f6, #2563eb); bottom: -100px; left: -100px; animation: float 15s ease-in-out infinite reverse; }
.bg-circle-3 { width: 300px; height: 300px; background: linear-gradient(135deg, #f59e0b, #d97706); top: 50%; left: 50%; transform: translate(-50%, -50%); animation: pulse 10s ease-in-out infinite; }
@keyframes float { 0%,100% { transform: translate(0,0);} 50% { transform: translate(30px,30px);} }
@keyframes pulse { 0%,100% { opacity: 0.05; transform: translate(-50%,-50%) scale(1);} 50% { opacity: 0.15; transform: translate(-50%,-50%) scale(1.1);} }
.signup-container { width: 100%; max-width: 560px; position: relative; z-index: 1; }
.signup-card { background: rgba(255,255,255,0.98); border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); padding: 40px 36px; backdrop-filter: blur(20px); }
.signup-header { text-align: center; margin-bottom: 28px; }
.signup-logo-container { width: 108px; height: 108px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; }
.signup-logo-img { width: 100%; height: 100%; object-fit: contain; }
.signup-title { font-size: 1.8rem; font-weight: 800; margin-bottom: 6px; letter-spacing: -0.5px; display: flex; justify-content: center; gap: 6px; }
.title-moto { color: #1e293b; }
.title-partes { color: #ef4444; }
.signup-subtitle { color: #64748b; font-size: 1rem; font-weight: 500; margin: 0; }
.signup-form { display: flex; flex-direction: column; gap: 18px; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 520px) { .form-row { grid-template-columns: 1fr; } }
.signup-input-wrapper { background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; transition: all 0.2s ease; }
.signup-input-wrapper:focus-within { border-color: #ef4444; background: white; box-shadow: 0 0 0 4px rgba(239,68,68,0.1); }
.signup-input-wrapper .form-input { background: transparent; border: none; }
.signup-input-wrapper .form-input:focus { box-shadow: none; }
.password-toggle { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; }
.password-toggle:hover { color: #1e293b; }
.signup-error-box { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; background: linear-gradient(135deg,#fef2f2,#fee2e2); border: 2px solid #fca5a5; border-radius: 12px; color: #991b1b; font-size: 0.9rem; line-height: 1.4; }
.signup-notice { margin: 4px 0 0; font-size: 0.82rem; color: #64748b; line-height: 1.5; text-align: center; padding: 12px 14px; background: #f8fafc; border-radius: 10px; }
.signup-submit-btn { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 16px 24px; background: linear-gradient(135deg,#1e293b 0%,#0f172a 100%); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
.signup-submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.3); background: linear-gradient(135deg,#334155 0%,#1e293b 100%); }
.signup-submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.signup-links { text-align: center; margin-top: 8px; color: #64748b; font-size: 0.9rem; }
.signup-links a { color: #ef4444; font-weight: 600; text-decoration: none; }
.signup-links a:hover { text-decoration: underline; }
.signup-footer { text-align: center; margin-top: 20px; color: #64748b; font-size: 0.8rem; }
@media (max-width: 480px) { .signup-card { padding: 32px 22px; border-radius: 20px; } .signup-title { font-size: 1.5rem; } }
`;
