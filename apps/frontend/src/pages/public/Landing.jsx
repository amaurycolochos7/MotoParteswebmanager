import { Link } from 'react-router-dom';
import {
    ArrowRight,
    MessageCircle,
    FileText,
    Users,
    Package,
    DollarSign,
    LineChart,
    CheckCircle2,
    ShieldCheck,
    Star,
    LogIn,
    UserPlus,
    Bike,
} from 'lucide-react';
import { PUBLIC_PLANS, FEATURE_BLOCKS } from '../../lib/plans';

const FEATURE_ICONS = {
    'Órdenes de servicio': <FileText size={28} />,
    'WhatsApp integrado': <MessageCircle size={28} />,
    'Clientes y motos': <Users size={28} />,
    'Refacciones y pagos': <Package size={28} />,
    'Comisiones por mecánico': <DollarSign size={28} />,
    'Portal público': <ShieldCheck size={28} />,
};

function money(n) {
    return n === 0 ? 'Gratis' : `$${n.toLocaleString('es-MX')}`;
}

export default function Landing() {
    return (
        <div className="landing">
            <header className="lnav">
                <div className="lnav-inner">
                    <Link to="/" className="lnav-brand">
                        <img src="/logo.png" alt="MotoPartes" />
                        <span className="brand-word">
                            <span className="brand-moto">MOTO</span>
                            <span className="brand-partes">PARTES</span>
                        </span>
                    </Link>

                    <nav className="lnav-links">
                        <a href="#features">Características</a>
                        <a href="#pricing">Precios</a>
                        <a href="#testimonial">Testimonio</a>
                    </nav>

                    <div className="lnav-ctas">
                        <Link to="/login" className="btn-ghost">
                            <LogIn size={16} /> Entrar
                        </Link>
                        <Link to="/signup" className="btn-primary">
                            <UserPlus size={16} /> Crear cuenta
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section className="hero">
                <div className="hero-bg">
                    <div className="bg-circle bg-circle-1"></div>
                    <div className="bg-circle bg-circle-2"></div>
                    <div className="bg-circle bg-circle-3"></div>
                </div>

                <div className="hero-content">
                    <div className="hero-pill">
                        <Bike size={14} /> Hecho para talleres de motos
                    </div>
                    <h1 className="hero-title">
                        Gestiona tu taller de motos
                        <br />
                        <span className="hero-title-accent">desde WhatsApp.</span>
                    </h1>
                    <p className="hero-sub">
                        Órdenes de servicio, clientes, refacciones, comisiones y cotizaciones
                        enviadas en segundos al WhatsApp de tu cliente — sin libretas, sin Excel.
                    </p>
                    <div className="hero-cta">
                        <Link to="/signup" className="btn-primary btn-lg">
                            Crear cuenta gratis <ArrowRight size={18} />
                        </Link>
                        <a href="#pricing" className="btn-ghost btn-lg">Ver precios</a>
                    </div>
                    <p className="hero-foot">
                        Sin tarjeta de crédito • Activación por correo • Hecho en México
                    </p>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="section">
                <div className="section-inner">
                    <h2 className="section-title">
                        Todo lo que tu taller necesita, en un solo lugar
                    </h2>
                    <p className="section-sub">
                        MotoPartes centraliza la operación diaria de un taller mecánico de motos —
                        desde que recibes la moto hasta que cobras y envías el PDF al cliente.
                    </p>

                    <div className="features-grid">
                        {FEATURE_BLOCKS.map((f) => (
                            <div key={f.title} className="feature-card">
                                <div className="feature-icon">{FEATURE_ICONS[f.title]}</div>
                                <h3>{f.title}</h3>
                                <p>{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="section section-alt">
                <div className="section-inner">
                    <h2 className="section-title">Precios simples por taller</h2>
                    <p className="section-sub">
                        Empieza gratis. Sube de plan cuando tu taller crezca. Cancela cuando quieras.
                    </p>

                    <div className="pricing-grid">
                        {PUBLIC_PLANS.map((plan) => (
                            <div
                                key={plan.code}
                                className={`pricing-card ${plan.highlight ? 'pricing-card--hl' : ''}`}
                            >
                                {plan.badge && <div className="pricing-badge">{plan.badge}</div>}
                                <div className="pricing-head">
                                    <h3 className="pricing-name">{plan.name}</h3>
                                    <p className="pricing-tag">{plan.tagline}</p>
                                </div>

                                <div className="pricing-price">
                                    <span className="pricing-amount">{money(plan.priceMonthly)}</span>
                                    {plan.priceMonthly > 0 && <span className="pricing-per"> MXN / mes</span>}
                                </div>
                                {plan.priceYearly > 0 && (
                                    <p className="pricing-year">o {money(plan.priceYearly)} MXN/año (−20%)</p>
                                )}

                                <Link
                                    to={plan.code === 'business' ? '/signup' : '/signup'}
                                    className={plan.highlight ? 'btn-primary pricing-cta' : 'btn-outline pricing-cta'}
                                >
                                    {plan.cta}
                                </Link>

                                <ul className="pricing-features">
                                    {plan.features.map((feat, i) => (
                                        <li key={i}>
                                            <CheckCircle2 size={16} /> {feat}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    <p className="pricing-note">
                        Todos los planes pagados incluyen 14 días de prueba gratuita con todas las
                        características del plan Pro. Precios en pesos mexicanos (IVA no incluido).
                    </p>
                </div>
            </section>

            {/* Testimonial */}
            <section id="testimonial" className="section">
                <div className="section-inner testimonial-wrap">
                    <div className="testimonial-card">
                        <div className="testimonial-stars">
                            {[0, 1, 2, 3, 4].map(i => <Star key={i} size={20} fill="#f59e0b" color="#f59e0b" />)}
                        </div>
                        <blockquote>
                            "Pasamos de llevar las órdenes en libreta a tener todo el taller
                            controlado desde el celular. Ya no se me pierde ninguna moto ni ningún
                            cobro. Los clientes reciben su resumen por WhatsApp y eso nos da una
                            seriedad que antes no teníamos."
                        </blockquote>
                        <div className="testimonial-author">
                            <div className="testimonial-avatar">
                                <Bike size={28} />
                            </div>
                            <div>
                                <strong>Taller MotoPartes</strong>
                                <span>Reparaciones y modificaciones de motos</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA final */}
            <section className="section cta-section">
                <div className="section-inner cta-inner">
                    <h2>Lleva tu taller al siguiente nivel</h2>
                    <p>Crea tu cuenta hoy — te avisamos por correo cuando tu taller quede activado.</p>
                    <Link to="/signup" className="btn-primary btn-lg">
                        Crear cuenta gratis <ArrowRight size={18} />
                    </Link>
                </div>
            </section>

            <footer className="lfooter">
                <div className="lfooter-inner">
                    <div className="lfooter-brand">
                        <img src="/logo.png" alt="MotoPartes" />
                        <div>
                            <div className="brand-word">
                                <span className="brand-moto">MOTO</span>
                                <span className="brand-partes">PARTES</span>
                            </div>
                            <p>Sistema de gestión para talleres de motos.</p>
                        </div>
                    </div>

                    <div className="lfooter-cols">
                        <div>
                            <h4>Producto</h4>
                            <a href="#features">Características</a>
                            <a href="#pricing">Precios</a>
                            <Link to="/signup">Crear cuenta</Link>
                        </div>
                        <div>
                            <h4>Cuenta</h4>
                            <Link to="/login">Iniciar sesión</Link>
                        </div>
                        <div>
                            <h4>Contacto</h4>
                            <a href="mailto:hola@motopartes.cloud">hola@motopartes.cloud</a>
                        </div>
                    </div>
                </div>
                <div className="lfooter-copy">
                    © 2026 MotoPartes • Todos los derechos reservados
                </div>
            </footer>

            <style>{landingStyles}</style>
        </div>
    );
}

const landingStyles = `
.landing {
    min-height: 100vh;
    background: #ffffff;
    color: #1e293b;
    font-family: inherit;
}

/* Nav */
.lnav { position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid #e2e8f0; }
.lnav-inner { max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.lnav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.lnav-brand img { width: 40px; height: 40px; object-fit: contain; }
.brand-word { font-weight: 800; font-size: 1.1rem; letter-spacing: -0.3px; display: flex; gap: 2px; }
.brand-moto { color: #1e293b; }
.brand-partes { color: #ef4444; }
.lnav-links { display: flex; gap: 24px; }
.lnav-links a { color: #475569; text-decoration: none; font-weight: 500; font-size: 0.92rem; }
.lnav-links a:hover { color: #ef4444; }
.lnav-ctas { display: flex; gap: 10px; align-items: center; }
@media (max-width: 780px) { .lnav-links { display: none; } }
@media (max-width: 540px) { .lnav-ctas .btn-ghost { display: none; } }

/* Buttons */
.btn-primary, .btn-ghost, .btn-outline {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 0.92rem;
    text-decoration: none; border: none; cursor: pointer; transition: all 0.2s ease;
    white-space: nowrap;
}
.btn-primary { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; box-shadow: 0 4px 12px rgba(239,68,68,0.25); }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(239,68,68,0.35); }
.btn-ghost { background: transparent; color: #1e293b; border: 2px solid #e2e8f0; }
.btn-ghost:hover { background: #f8fafc; border-color: #cbd5e1; }
.btn-outline { background: white; color: #1e293b; border: 2px solid #1e293b; }
.btn-outline:hover { background: #1e293b; color: white; }
.btn-lg { padding: 14px 26px; font-size: 1rem; border-radius: 12px; }

/* Hero */
.hero { position: relative; overflow: hidden; padding: 90px 24px 110px; }
.hero-bg { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.bg-circle { position: absolute; border-radius: 50%; opacity: 0.1; }
.bg-circle-1 { width: 600px; height: 600px; background: linear-gradient(135deg, #ef4444, #dc2626); top: -200px; right: -200px; animation: float 20s ease-in-out infinite; }
.bg-circle-2 { width: 400px; height: 400px; background: linear-gradient(135deg, #3b82f6, #2563eb); bottom: -100px; left: -100px; animation: float 15s ease-in-out infinite reverse; }
.bg-circle-3 { width: 300px; height: 300px; background: linear-gradient(135deg, #f59e0b, #d97706); top: 50%; left: 50%; transform: translate(-50%, -50%); animation: pulse 10s ease-in-out infinite; }
@keyframes float { 0%,100% { transform: translate(0,0);} 50% { transform: translate(30px,30px);} }
@keyframes pulse { 0%,100% { opacity: 0.05; transform: translate(-50%,-50%) scale(1);} 50% { opacity: 0.15; transform: translate(-50%,-50%) scale(1.1);} }
.hero-content { position: relative; z-index: 1; max-width: 860px; margin: 0 auto; text-align: center; }
.hero-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 999px; font-size: 0.82rem; font-weight: 600; margin-bottom: 20px; }
.hero-title { font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; line-height: 1.1; letter-spacing: -1px; margin: 0 0 18px; color: #0f172a; }
.hero-title-accent { color: #ef4444; }
.hero-sub { font-size: 1.15rem; color: #475569; line-height: 1.6; margin: 0 auto 32px; max-width: 640px; }
.hero-cta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-bottom: 18px; }
.hero-foot { font-size: 0.85rem; color: #94a3b8; margin: 0; }

/* Sections */
.section { padding: 80px 24px; }
.section-alt { background: #f8fafc; }
.section-inner { max-width: 1100px; margin: 0 auto; }
.section-title { font-size: clamp(1.6rem, 3.2vw, 2.4rem); font-weight: 800; letter-spacing: -0.5px; color: #0f172a; text-align: center; margin: 0 0 14px; }
.section-sub { font-size: 1.05rem; color: #64748b; line-height: 1.6; text-align: center; max-width: 640px; margin: 0 auto 50px; }

/* Features */
.features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; }
.feature-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px 24px; transition: all 0.2s ease; }
.feature-card:hover { border-color: #ef4444; transform: translateY(-3px); box-shadow: 0 12px 24px rgba(0,0,0,0.08); }
.feature-icon { width: 56px; height: 56px; border-radius: 14px; background: linear-gradient(135deg, #fef2f2, #fee2e2); color: #ef4444; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
.feature-card h3 { font-size: 1.15rem; font-weight: 700; margin: 0 0 8px; color: #0f172a; }
.feature-card p { color: #64748b; line-height: 1.6; margin: 0; font-size: 0.95rem; }

/* Pricing */
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 22px; }
.pricing-card { background: white; border: 2px solid #e2e8f0; border-radius: 20px; padding: 32px 24px; position: relative; display: flex; flex-direction: column; transition: all 0.2s ease; }
.pricing-card:hover { transform: translateY(-4px); box-shadow: 0 16px 32px rgba(0,0,0,0.08); }
.pricing-card--hl { border-color: #ef4444; box-shadow: 0 16px 40px rgba(239,68,68,0.18); }
.pricing-badge { position: absolute; top: -14px; right: 20px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 5px 14px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; box-shadow: 0 6px 14px rgba(239,68,68,0.25); }
.pricing-head { margin-bottom: 18px; }
.pricing-name { font-size: 1.3rem; font-weight: 800; margin: 0 0 4px; color: #0f172a; }
.pricing-tag { font-size: 0.88rem; color: #64748b; margin: 0; line-height: 1.4; }
.pricing-price { margin: 4px 0 6px; }
.pricing-amount { font-size: 2.4rem; font-weight: 800; color: #0f172a; letter-spacing: -1px; }
.pricing-per { color: #64748b; font-size: 0.9rem; font-weight: 500; }
.pricing-year { color: #94a3b8; font-size: 0.82rem; margin: 0 0 18px; }
.pricing-cta { width: 100%; margin-bottom: 20px; }
.pricing-features { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.pricing-features li { display: flex; align-items: flex-start; gap: 8px; font-size: 0.9rem; color: #475569; line-height: 1.4; }
.pricing-features li svg { color: #16a34a; flex-shrink: 0; margin-top: 2px; }
.pricing-note { text-align: center; font-size: 0.85rem; color: #64748b; margin-top: 40px; line-height: 1.5; }

/* Testimonial */
.testimonial-wrap { display: flex; justify-content: center; }
.testimonial-card { max-width: 720px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; border-radius: 24px; padding: 40px 36px; box-shadow: 0 20px 50px rgba(15,23,42,0.2); }
.testimonial-stars { display: flex; gap: 2px; margin-bottom: 16px; }
.testimonial-card blockquote { font-size: 1.15rem; line-height: 1.65; margin: 0 0 24px; font-style: italic; color: #e2e8f0; }
.testimonial-author { display: flex; align-items: center; gap: 14px; }
.testimonial-avatar { width: 54px; height: 54px; border-radius: 50%; background: linear-gradient(135deg, #ef4444, #dc2626); display: flex; align-items: center; justify-content: center; color: white; }
.testimonial-author strong { display: block; font-size: 1rem; color: white; }
.testimonial-author span { color: #94a3b8; font-size: 0.85rem; }

/* CTA */
.cta-section { padding: 70px 24px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }
.cta-inner { text-align: center; }
.cta-inner h2 { font-size: clamp(1.6rem, 3.2vw, 2.2rem); font-weight: 800; margin: 0 0 10px; letter-spacing: -0.5px; }
.cta-inner p { color: rgba(255,255,255,0.9); font-size: 1.05rem; margin: 0 0 26px; }
.cta-section .btn-primary { background: white; color: #dc2626; box-shadow: 0 8px 20px rgba(0,0,0,0.2); }
.cta-section .btn-primary:hover { background: #f8fafc; }

/* Footer */
.lfooter { background: #0f172a; color: #cbd5e1; padding: 50px 24px 24px; }
.lfooter-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1.2fr 2fr; gap: 40px; }
@media (max-width: 780px) { .lfooter-inner { grid-template-columns: 1fr; } }
.lfooter-brand { display: flex; align-items: flex-start; gap: 14px; }
.lfooter-brand img { width: 48px; height: 48px; object-fit: contain; }
.lfooter-brand p { margin: 6px 0 0; color: #94a3b8; font-size: 0.9rem; }
.lfooter-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
@media (max-width: 540px) { .lfooter-cols { grid-template-columns: 1fr 1fr; } }
.lfooter-cols h4 { color: white; font-size: 0.95rem; font-weight: 700; margin: 0 0 12px; }
.lfooter-cols a { display: block; color: #94a3b8; text-decoration: none; padding: 4px 0; font-size: 0.88rem; }
.lfooter-cols a:hover { color: #ef4444; }
.lfooter-copy { max-width: 1100px; margin: 40px auto 0; padding-top: 20px; border-top: 1px solid #1e293b; color: #64748b; font-size: 0.82rem; text-align: center; }
`;
