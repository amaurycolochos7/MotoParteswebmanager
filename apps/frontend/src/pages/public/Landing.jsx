import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
    Wrench,
    Menu,
    X,
} from 'lucide-react';
import { PUBLIC_PLANS, FEATURE_BLOCKS } from '../../lib/plans';
import { captureReferralFromUrl, getStoredReferral } from '../../lib/referral';

// JSON-LD para que Google entienda que es una SoftwareApplication B2B
// de gestión de talleres. Se inyecta en <head> via un <script> inline
// y se actualiza en cada render de la landing.
const SCHEMA_ORG = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MotoPartes',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
        'Plataforma para talleres de motocicletas: órdenes de servicio, clientes, refacciones, comisiones y envío de cotizaciones por WhatsApp.',
    url: 'https://motopartes.cloud/',
    inLanguage: 'es-MX',
    offers: [
        { '@type': 'Offer', name: 'Free',    price: '0',    priceCurrency: 'MXN' },
        { '@type': 'Offer', name: 'Starter', price: '299',  priceCurrency: 'MXN' },
        { '@type': 'Offer', name: 'Pro',     price: '599',  priceCurrency: 'MXN' },
        { '@type': 'Offer', name: 'Business', price: '1499', priceCurrency: 'MXN' },
    ],
    aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '5.0',
        reviewCount: '1',
    },
};

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
    const { t, i18n } = useTranslation();
    const [refSlug, setRefSlug] = useState(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const fresh = captureReferralFromUrl();
        setRefSlug(fresh || getStoredReferral());
    }, []);

    // Cerrar menú al navegar o tocar un link interno.
    const closeMobileMenu = () => setMobileMenuOpen(false);

    const switchLang = () => {
        const next = i18n.language?.startsWith('en') ? 'es' : 'en';
        i18n.changeLanguage(next);
    };

    return (
        <div className="landing">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_ORG) }} />

            {refSlug && (
                <div className="ref-banner">
                    <Bike size={16} /> Llegaste por recomendación de <strong>{refSlug}</strong> — al registrarte, el referente recibe una comisión.
                </div>
            )}

            <header className="lnav">
                <div className="lnav-inner">
                    <Link to="/" className="lnav-brand" onClick={closeMobileMenu}>
                        <img src="/logo.png" alt="MotoPartes" />
                        <span className="brand-word">
                            <span className="brand-moto">MOTO</span>
                            <span className="brand-partes">PARTES</span>
                        </span>
                    </Link>

                    <nav className="lnav-links">
                        <a href="#features">{t('landing.nav.features')}</a>
                        <a href="#pricing">{t('landing.nav.pricing')}</a>
                        <Link to="/blog">{t('landing.nav.blog')}</Link>
                        <Link to="/casos">{t('landing.nav.cases')}</Link>
                    </nav>

                    <div className="lnav-ctas">
                        <button onClick={switchLang} className="lnav-lang" title="Change language">
                            {i18n.language?.startsWith('en') ? 'ES' : 'EN'}
                        </button>
                        <Link to="/login" className="btn-ghost">
                            <LogIn size={16} /> {t('common.login')}
                        </Link>
                        <Link to="/signup" className="btn-primary">
                            <UserPlus size={16} /> {t('common.signup')}
                        </Link>
                    </div>

                    {/* Hamburger button (solo visible en móvil) */}
                    <button
                        className="lnav-hamburger"
                        aria-label="Abrir menú"
                        onClick={() => setMobileMenuOpen((v) => !v)}
                    >
                        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {/* Drawer móvil */}
                {mobileMenuOpen && (
                    <>
                        <div className="lnav-overlay" onClick={closeMobileMenu} />
                        <div className="lnav-drawer">
                            <a href="#features" onClick={closeMobileMenu}>{t('landing.nav.features')}</a>
                            <a href="#pricing" onClick={closeMobileMenu}>{t('landing.nav.pricing')}</a>
                            <Link to="/blog" onClick={closeMobileMenu}>{t('landing.nav.blog')}</Link>
                            <Link to="/casos" onClick={closeMobileMenu}>{t('landing.nav.cases')}</Link>
                            <div className="lnav-drawer-sep" />
                            <Link to="/login" onClick={closeMobileMenu} className="lnav-drawer-ghost">
                                <LogIn size={18} /> {t('common.login')}
                            </Link>
                            <Link to="/signup" onClick={closeMobileMenu} className="lnav-drawer-primary">
                                <UserPlus size={18} /> {t('common.signup')}
                            </Link>
                            <button onClick={switchLang} className="lnav-drawer-lang">
                                {i18n.language?.startsWith('en') ? '🇲🇽 Español' : '🇺🇸 English'}
                            </button>
                        </div>
                    </>
                )}
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
                        <Bike size={14} /> {t('landing.hero.pill')}
                    </div>
                    <h1 className="hero-title">
                        {t('landing.hero.title_1')}
                        <br />
                        <span className="hero-title-accent">{t('landing.hero.title_2')}</span>
                    </h1>
                    <p className="hero-sub">
                        {t('landing.hero.sub')}
                    </p>
                    <div className="hero-cta">
                        <Link to="/signup" className="btn-primary btn-lg">
                            {t('common.signup_free')} <ArrowRight size={18} />
                        </Link>
                        <a href="#pricing" className="btn-ghost btn-lg">{t('landing.hero.cta_pricing')}</a>
                    </div>
                    <p className="hero-foot">
                        {t('landing.hero.foot')}
                    </p>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="section">
                <div className="section-inner">
                    <h2 className="section-title">
                        {t('landing.features.title')}
                    </h2>
                    <p className="section-sub">
                        {t('landing.features.sub')}
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
                    <h2 className="section-title">{t('landing.pricing.title')}</h2>
                    <p className="section-sub">
                        {t('landing.pricing.sub')}
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
                        {t('landing.pricing.note')}
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

            {/* Nacido en un taller real */}
            <section id="origen" className="section section-alt">
                <div className="section-inner origin-wrap">
                    <div className="origin-copy">
                        <div className="origin-pill">
                            <Wrench size={14} /> {t('landing.origin.pill')}
                        </div>
                        <h2 className="section-title origin-title">
                            {t('landing.origin.title')}
                        </h2>
                        <p className="origin-sub">
                            {t('landing.origin.sub')}
                        </p>
                        <div className="origin-stats">
                            <div className="origin-stat">
                                <strong>60+</strong>
                                <span>{t('landing.origin.metric_orders')}</span>
                            </div>
                            <div className="origin-stat">
                                <strong>0</strong>
                                <span>{t('landing.origin.metric_lost')}</span>
                            </div>
                            <div className="origin-stat">
                                <strong>100%</strong>
                                <span>{t('landing.origin.metric_tracked')}</span>
                            </div>
                        </div>
                    </div>
                    <div className="origin-card">
                        <div className="origin-logo">
                            <Bike size={44} />
                        </div>
                        <h3>{t('landing.origin.shop_name')}</h3>
                        <p>{t('landing.origin.shop_desc')}</p>
                        <div className="origin-quote">
                            {t('landing.origin.quote')}
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA final */}
            <section className="section cta-section">
                <div className="section-inner cta-inner">
                    <h2>{t('landing.cta_final.title')}</h2>
                    <p>{t('landing.cta_final.sub')}</p>
                    <Link to="/signup" className="btn-primary btn-lg">
                        {t('common.signup_free')} <ArrowRight size={18} />
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
                            <h4>{t('landing.footer.product')}</h4>
                            <a href="#features">{t('landing.nav.features')}</a>
                            <a href="#pricing">{t('landing.nav.pricing')}</a>
                            <Link to="/signup">{t('common.signup')}</Link>
                        </div>
                        <div>
                            <h4>{t('landing.footer.resources')}</h4>
                            <Link to="/blog">{t('landing.nav.blog')}</Link>
                            <Link to="/casos">{t('landing.nav.cases')}</Link>
                        </div>
                        <div>
                            <h4>{t('landing.footer.account')}</h4>
                            <Link to="/login">{t('common.login')}</Link>
                            <a href="mailto:hola@motopartes.cloud">{t('common.contact')}</a>
                        </div>
                    </div>
                </div>
                <div className="lfooter-copy">
                    {t('landing.footer.copy')}
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

/* Banner de referral */
.ref-banner {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #78350f;
    padding: 10px 20px;
    text-align: center;
    font-size: 0.9rem;
    font-weight: 500;
    border-bottom: 1px solid #fcd34d;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}
.ref-banner strong { color: #92400e; font-weight: 700; }

/* Origin section */
.origin-wrap {
    display: grid;
    grid-template-columns: 1.5fr 1fr;
    gap: 50px;
    align-items: center;
}
@media (max-width: 860px) { .origin-wrap { grid-template-columns: 1fr; gap: 30px; } }
.origin-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 600;
    margin-bottom: 16px;
}
.origin-title { text-align: left !important; margin: 0 0 16px !important; }
.origin-sub {
    font-size: 1rem;
    color: #475569;
    line-height: 1.65;
    margin: 0 0 28px;
}
.origin-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
}
@media (max-width: 520px) { .origin-stats { grid-template-columns: 1fr 1fr; } }
.origin-stat {
    background: white;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    text-align: center;
}
.origin-stat strong {
    display: block;
    font-size: 1.6rem;
    font-weight: 800;
    color: #ef4444;
    margin-bottom: 4px;
}
.origin-stat span {
    font-size: 0.8rem;
    color: #64748b;
    line-height: 1.3;
}
.origin-card {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: white;
    border-radius: 20px;
    padding: 36px 28px;
    text-align: center;
    box-shadow: 0 20px 50px rgba(15,23,42,0.25);
}
.origin-logo {
    width: 86px;
    height: 86px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 18px;
    color: white;
}
.origin-card h3 { margin: 0 0 4px; font-size: 1.2rem; font-weight: 800; }
.origin-card p { margin: 0 0 20px; color: #cbd5e1; font-size: 0.9rem; }
.origin-quote {
    font-style: italic;
    font-size: 0.95rem;
    color: #e2e8f0;
    border-top: 1px solid #334155;
    padding-top: 16px;
    line-height: 1.55;
}

/* Nav */
.lnav { position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid #e2e8f0; }
.lnav-inner { max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.lnav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0; }
.lnav-brand img { width: 40px; height: 40px; object-fit: contain; }
.brand-word { font-weight: 800; font-size: 1.1rem; letter-spacing: -0.3px; display: flex; gap: 2px; }
.brand-moto { color: #1e293b; }
.brand-partes { color: #ef4444; }
.lnav-links { display: flex; gap: 24px; }
.lnav-links a { color: #475569; text-decoration: none; font-weight: 500; font-size: 0.92rem; }
.lnav-links a:hover { color: #ef4444; }
.lnav-ctas { display: flex; gap: 10px; align-items: center; }
.lnav-lang { background: #f1f5f9; color: #475569; border: none; padding: 6px 10px; border-radius: 8px; font-weight: 700; font-size: 0.78rem; letter-spacing: 0.5px; cursor: pointer; transition: all 0.2s ease; }
.lnav-lang:hover { background: #e2e8f0; color: #0f172a; }
.lnav-hamburger { display: none; background: #f1f5f9; border: none; color: #0f172a; padding: 8px; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
.lnav-hamburger:hover { background: #e2e8f0; }
.lnav-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.5); z-index: 49; animation: fadeIn 0.2s ease; }
.lnav-drawer { position: fixed; top: 70px; right: 12px; left: 12px; background: white; border-radius: 16px; padding: 18px; box-shadow: 0 20px 40px rgba(15,23,42,0.2); z-index: 50; display: flex; flex-direction: column; gap: 6px; animation: slideDown 0.22s ease; }
.lnav-drawer a, .lnav-drawer-primary, .lnav-drawer-ghost, .lnav-drawer-lang { display: flex; align-items: center; gap: 10px; padding: 12px 14px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 0.95rem; transition: background 0.15s; }
.lnav-drawer a { color: #334155; }
.lnav-drawer a:hover { background: #f8fafc; color: #ef4444; }
.lnav-drawer-sep { height: 1px; background: #e2e8f0; margin: 6px 0; }
.lnav-drawer-ghost { color: #0f172a; border: 1.5px solid #cbd5e1; justify-content: center; }
.lnav-drawer-ghost:hover { background: #f8fafc; }
.lnav-drawer-primary { background: linear-gradient(135deg,#ef4444,#dc2626); color: white; justify-content: center; box-shadow: 0 4px 10px rgba(239,68,68,0.25); }
.lnav-drawer-primary:hover { color: white; transform: translateY(-1px); }
.lnav-drawer-lang { background: #f1f5f9; color: #475569; border: none; cursor: pointer; justify-content: center; font-weight: 600; font-size: 0.9rem; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 860px) {
    .lnav-links { display: none; }
    .lnav-ctas { display: none; }
    .lnav-hamburger { display: inline-flex; }
    .lnav-inner { padding: 12px 16px; }
}

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
@media (max-width: 640px) {
    .hero { padding: 50px 20px 70px; }
    .hero-pill { font-size: 0.75rem; margin-bottom: 14px; }
    .hero-sub { font-size: 1rem; margin-bottom: 24px; }
    .hero-cta { flex-direction: column; align-items: stretch; width: 100%; max-width: 320px; margin: 0 auto 14px; }
    .hero-cta .btn-lg { width: 100%; justify-content: center; }
    .bg-circle-1 { width: 360px; height: 360px; top: -120px; right: -120px; }
    .bg-circle-2 { width: 260px; height: 260px; bottom: -60px; left: -60px; }
    .bg-circle-3 { display: none; }
}
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
@media (max-width: 640px) {
    .section { padding: 50px 20px; }
    .section-sub { margin-bottom: 30px; font-size: 0.95rem; }
    .feature-card { padding: 22px 18px; }
    .pricing-card { padding: 24px 20px; }
    .pricing-amount { font-size: 2rem; }
    .testimonial-card { padding: 30px 22px; border-radius: 18px; }
    .testimonial-card blockquote { font-size: 1rem; }
    .origin-title { font-size: 1.6rem !important; }
    .origin-sub { font-size: 0.95rem; }
    .cta-section { padding: 50px 20px; }
}
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
