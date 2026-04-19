import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowRight, MessageCircle, FileText, Users, Package, DollarSign,
    CheckCircle2, ShieldCheck, Star, LogIn, UserPlus, Bike, Wrench,
    Menu, X, Clock, Zap, Camera, Smartphone, TrendingUp, Sparkles,
    ChevronDown, ChevronUp,
} from 'lucide-react';
import { PUBLIC_PLANS, FEATURE_BLOCKS } from '../../lib/plans';
import { captureReferralFromUrl, getStoredReferral } from '../../lib/referral';

// JSON-LD para SEO
const SCHEMA_ORG = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'MotoPartes',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'Plataforma para talleres de motocicletas: órdenes de servicio, clientes, refacciones, comisiones y envío de cotizaciones por WhatsApp.',
    url: 'https://motopartes.cloud/',
    inLanguage: 'es-MX',
    offers: [
        { '@type': 'Offer', name: 'Free',    price: '0',    priceCurrency: 'MXN' },
        { '@type': 'Offer', name: 'Starter', price: '299',  priceCurrency: 'MXN' },
        { '@type': 'Offer', name: 'Pro',     price: '599',  priceCurrency: 'MXN' },
        { '@type': 'Offer', name: 'Business', price: '1499', priceCurrency: 'MXN' },
    ],
    aggregateRating: { '@type': 'AggregateRating', ratingValue: '5.0', reviewCount: '1' },
};

const FEATURE_ICONS = {
    'Órdenes de servicio': FileText,
    'WhatsApp integrado': MessageCircle,
    'Clientes y motos': Users,
    'Refacciones y pagos': Package,
    'Comisiones por mecánico': DollarSign,
    'Portal público': ShieldCheck,
};

const FAQ = [
    {
        q: '¿Necesito contratar personal nuevo para usarlo?',
        a: 'No. El sistema lo maneja la misma persona que hoy lleva la libreta — la diferencia es que no se pierde nada y los números cuadran solos al cierre del mes.',
    },
    {
        q: '¿Mi cliente tiene que descargar una app?',
        a: 'No. Los clientes reciben todo por WhatsApp (que ya usan). Solo tú y tu equipo usan el sistema.',
    },
    {
        q: '¿Qué pasa si me quedo sin internet?',
        a: 'Puedes seguir recibiendo motos y apuntar en papel como respaldo. Cuando regrese el internet, capturas en 2 minutos lo pendiente y el sistema lo ajusta. No pierdes datos.',
    },
    {
        q: '¿Cuánto cuesta empezar?',
        a: 'Nada. El plan Free te da 20 órdenes al mes. Cuando crezcas, el plan Pro cuesta $599 MXN/mes — se paga solo si recuperas 2 clientes que antes se iban.',
    },
    {
        q: '¿Puedo migrar mis clientes actuales?',
        a: 'Sí. Te damos una plantilla en Excel, la llenas o nos la pasas como la tengas, y la subimos nosotros. En menos de un día tu base está arriba.',
    },
    {
        q: '¿Y si decido cancelar?',
        a: 'Cancelas cuando quieras desde el panel. Tus datos quedan disponibles 14 días para exportarlos antes de borrarse. Sin letra chica.',
    },
];

function money(n) {
    return n === 0 ? 'Gratis' : `$${n.toLocaleString('es-MX')}`;
}

export default function Landing() {
    const { t, i18n } = useTranslation();
    const [refSlug, setRefSlug] = useState(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [billing, setBilling] = useState('monthly'); // monthly | yearly
    const [openFaq, setOpenFaq] = useState(null);

    useEffect(() => {
        const fresh = captureReferralFromUrl();
        setRefSlug(fresh || getStoredReferral());
    }, []);

    const closeMobileMenu = () => setMobileMenuOpen(false);
    const switchLang = () => {
        const next = i18n.language?.startsWith('en') ? 'es' : 'en';
        i18n.changeLanguage(next);
    };

    return (
        <div className="mp-landing">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA_ORG) }} />

            {refSlug && (
                <div className="mp-ref-banner">
                    <Bike size={16} /> Llegaste por recomendación de <strong>{refSlug}</strong>
                </div>
            )}

            {/* NAV */}
            <header className="mp-nav">
                <div className="mp-nav-inner">
                    <Link to="/" className="mp-brand" onClick={closeMobileMenu}>
                        <img src="/logo.png" alt="MotoPartes" />
                        <span className="mp-brand-word">
                            <span className="mp-brand-moto">MOTO</span>
                            <span className="mp-brand-partes">PARTES</span>
                        </span>
                    </Link>

                    <nav className="mp-nav-links">
                        <a href="#features">Características</a>
                        <a href="#how">Cómo funciona</a>
                        <a href="#pricing">Precios</a>
                        <Link to="/blog">Blog</Link>
                        <Link to="/casos">Casos</Link>
                    </nav>

                    <div className="mp-nav-ctas">
                        <button onClick={switchLang} className="mp-lang" title="Change language">
                            {i18n.language?.startsWith('en') ? 'ES' : 'EN'}
                        </button>
                        <Link to="/login" className="mp-btn-ghost">
                            Entrar
                        </Link>
                        <Link to="/signup" className="mp-btn-primary">
                            Crear cuenta <ArrowRight size={14} />
                        </Link>
                    </div>

                    <button className="mp-burger" aria-label="Menu" onClick={() => setMobileMenuOpen((v) => !v)}>
                        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>

                {mobileMenuOpen && (
                    <>
                        <div className="mp-drawer-overlay" onClick={closeMobileMenu} />
                        <div className="mp-drawer">
                            <a href="#features" onClick={closeMobileMenu}>Características</a>
                            <a href="#how" onClick={closeMobileMenu}>Cómo funciona</a>
                            <a href="#pricing" onClick={closeMobileMenu}>Precios</a>
                            <Link to="/blog" onClick={closeMobileMenu}>Blog</Link>
                            <Link to="/casos" onClick={closeMobileMenu}>Casos</Link>
                            <div className="mp-drawer-sep" />
                            <Link to="/login" className="mp-drawer-ghost" onClick={closeMobileMenu}>Entrar</Link>
                            <Link to="/signup" className="mp-drawer-primary" onClick={closeMobileMenu}>
                                Crear cuenta gratis <ArrowRight size={14} />
                            </Link>
                            <button onClick={switchLang} className="mp-drawer-lang">
                                {i18n.language?.startsWith('en') ? '🇲🇽 Español' : '🇺🇸 English'}
                            </button>
                        </div>
                    </>
                )}
            </header>

            {/* HERO */}
            <section className="mp-hero">
                <div className="mp-hero-grid">
                    <div className="mp-hero-copy">
                        <div className="mp-hero-pill">
                            <Sparkles size={14} /> Hecho para talleres de motos en México
                        </div>
                        <h1 className="mp-hero-title">
                            Deja la libreta.<br/>
                            <span className="mp-hero-accent">Controla tu taller</span> desde WhatsApp.
                        </h1>
                        <p className="mp-hero-sub">
                            MotoPartes reemplaza tu libreta, tu Excel y tus notas pegadas al refri con un sistema que tu cliente
                            recibe directo en WhatsApp — órdenes, cotizaciones, fotos y cobros, todos en un lugar.
                        </p>
                        <div className="mp-hero-ctas">
                            <Link to="/signup" className="mp-btn-primary mp-btn-lg">
                                Empezar gratis <ArrowRight size={16} />
                            </Link>
                            <a href="#how" className="mp-btn-ghost mp-btn-lg">
                                Ver cómo funciona
                            </a>
                        </div>
                        <div className="mp-hero-trust">
                            <div className="mp-trust-item">
                                <CheckCircle2 size={14} /> Sin tarjeta
                            </div>
                            <div className="mp-trust-item">
                                <CheckCircle2 size={14} /> Configurable en 10 min
                            </div>
                            <div className="mp-trust-item">
                                <CheckCircle2 size={14} /> Soporte en español
                            </div>
                        </div>
                    </div>

                    {/* Mockup simulando la app */}
                    <div className="mp-hero-mockup">
                        <div className="mp-phone">
                            <div className="mp-phone-notch" />
                            <div className="mp-phone-screen">
                                <div className="mp-phone-header">
                                    <div className="mp-phone-avatar">MP</div>
                                    <div>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>MotoPartes Taller</div>
                                        <div style={{ fontSize: '0.65rem', color: '#16a34a' }}>● en línea</div>
                                    </div>
                                </div>
                                <div className="mp-phone-messages">
                                    <div className="mp-msg mp-msg-them">
                                        <div style={{ fontWeight: 600, color: '#ef4444', fontSize: '0.7rem', marginBottom: 2 }}>📎 Orden MP-26-042</div>
                                        <div>Hola Juan! Tu moto ya está lista.</div>
                                        <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#64748b' }}>Total: $1,250 MXN</div>
                                        <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>14:32 ✓✓</div>
                                    </div>
                                    <div className="mp-msg mp-msg-us">
                                        <div>Perfecto, paso por ella</div>
                                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>14:35 ✓✓</div>
                                    </div>
                                    <div className="mp-msg mp-msg-them" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Camera size={14} style={{ color: '#64748b' }} /> Fotos del servicio adjuntas
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cards flotantes */}
                        <div className="mp-float-card mp-float-1">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ background: '#dcfce7', color: '#16a34a', padding: 6, borderRadius: 8 }}>
                                    <CheckCircle2 size={14} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>Orden completada</div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>MP-26-042 · $1,250</div>
                                </div>
                            </div>
                        </div>

                        <div className="mp-float-card mp-float-2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ background: '#fef3c7', color: '#d97706', padding: 6, borderRadius: 8 }}>
                                    <DollarSign size={14} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>Comisión del día</div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>$880 MXN</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mp-hero-bg">
                    <div className="mp-blob mp-blob-1" />
                    <div className="mp-blob mp-blob-2" />
                </div>
            </section>

            {/* SOCIAL PROOF */}
            <section className="mp-proof">
                <div className="mp-container">
                    <div className="mp-proof-grid">
                        <div className="mp-stat">
                            <div className="mp-stat-num">60+</div>
                            <div className="mp-stat-label">órdenes por mes gestionadas sin papel</div>
                        </div>
                        <div className="mp-stat">
                            <div className="mp-stat-num">100%</div>
                            <div className="mp-stat-label">de cobros registrados correctamente</div>
                        </div>
                        <div className="mp-stat">
                            <div className="mp-stat-num">0</div>
                            <div className="mp-stat-label">motos perdidas u olvidadas</div>
                        </div>
                        <div className="mp-stat">
                            <div className="mp-stat-num">8 seg</div>
                            <div className="mp-stat-label">buscar una orden vieja (antes 12 min)</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section id="how" className="mp-section">
                <div className="mp-container">
                    <div className="mp-section-head">
                        <span className="mp-section-tag">Cómo funciona</span>
                        <h2 className="mp-section-title">Del mostrador al WhatsApp del cliente en 4 pasos.</h2>
                    </div>

                    <div className="mp-steps">
                        {[
                            { icon: Smartphone, t: 'Recibe la moto', d: 'Tomas fotos de recepción y registras al cliente en 30 segundos. El sistema autogenera folio.' },
                            { icon: Wrench,     t: 'Registra el servicio', d: 'Anotas diagnóstico, servicios aplicados y refacciones usadas. Los totales se calculan solos.' },
                            { icon: MessageCircle, t: 'Envía por WhatsApp', d: 'Con un botón, el cliente recibe cotización o la orden completa con tu logo en PDF.' },
                            { icon: TrendingUp, t: 'Cobra y mide', d: 'Marcas como cobrada. Ves tu ingreso del día, la comisión de cada mecánico, y quién debe qué.' },
                        ].map((s, i) => (
                            <div key={i} className="mp-step">
                                <div className="mp-step-num">0{i + 1}</div>
                                <div className="mp-step-icon"><s.icon size={22} /></div>
                                <h3>{s.t}</h3>
                                <p>{s.d}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FEATURES */}
            <section id="features" className="mp-section mp-section-alt">
                <div className="mp-container">
                    <div className="mp-section-head">
                        <span className="mp-section-tag">Características</span>
                        <h2 className="mp-section-title">Todo lo que necesita tu taller, sin curva de aprendizaje.</h2>
                        <p className="mp-section-sub">
                            MotoPartes centraliza la operación diaria de un taller de motos — desde recibir la moto
                            hasta cobrar y enviar el PDF al cliente.
                        </p>
                    </div>

                    <div className="mp-features">
                        {FEATURE_BLOCKS.map((f) => {
                            const Icon = FEATURE_ICONS[f.title] || Sparkles;
                            return (
                                <div key={f.title} className="mp-feature">
                                    <div className="mp-feature-icon"><Icon size={22} /></div>
                                    <h3>{f.title}</h3>
                                    <p>{f.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* PRICING */}
            <section id="pricing" className="mp-section">
                <div className="mp-container">
                    <div className="mp-section-head">
                        <span className="mp-section-tag">Precios</span>
                        <h2 className="mp-section-title">Empieza gratis. Paga solo cuando tu taller crezca.</h2>
                        <div className="mp-billing-toggle" role="tablist">
                            <button
                                className={billing === 'monthly' ? 'active' : ''}
                                onClick={() => setBilling('monthly')}
                            >Mensual</button>
                            <button
                                className={billing === 'yearly' ? 'active' : ''}
                                onClick={() => setBilling('yearly')}
                            >Anual <span style={{ background: '#16a34a', color: 'white', padding: '1px 7px', borderRadius: 999, fontSize: '0.65rem', marginLeft: 4 }}>−20%</span></button>
                        </div>
                    </div>

                    <div className="mp-pricing">
                        {PUBLIC_PLANS.map((plan) => {
                            const price = billing === 'yearly' ? plan.priceYearly : plan.priceMonthly;
                            const perLabel = billing === 'yearly' ? '/año' : '/mes';
                            return (
                                <div key={plan.code} className={`mp-plan ${plan.highlight ? 'mp-plan-hl' : ''}`}>
                                    {plan.badge && <div className="mp-plan-badge">{plan.badge}</div>}
                                    <div className="mp-plan-head">
                                        <h3>{plan.name}</h3>
                                        <p>{plan.tagline}</p>
                                    </div>
                                    <div className="mp-plan-price">
                                        <span className="mp-plan-amount">{money(price)}</span>
                                        {price > 0 && <span className="mp-plan-per">MXN {perLabel}</span>}
                                    </div>
                                    <Link
                                        to="/signup"
                                        className={plan.highlight ? 'mp-btn-primary mp-plan-cta' : 'mp-btn-outline mp-plan-cta'}
                                    >
                                        {plan.cta}
                                    </Link>
                                    <ul className="mp-plan-features">
                                        {plan.features.map((feat, i) => (
                                            <li key={i}>
                                                <CheckCircle2 size={14} /> {feat}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>

                    <p className="mp-pricing-note">
                        Todos los planes pagados incluyen 14 días de prueba gratuita con features del plan Pro.
                        Precios en pesos mexicanos, IVA no incluido.
                    </p>
                </div>
            </section>

            {/* TESTIMONIAL */}
            <section className="mp-testimonial">
                <div className="mp-container">
                    <div className="mp-testimonial-card">
                        <div className="mp-testimonial-stars">
                            {[0, 1, 2, 3, 4].map((i) => (
                                <Star key={i} size={18} fill="#fbbf24" color="#fbbf24" />
                            ))}
                        </div>
                        <blockquote>
                            "Pasamos de llevar las órdenes en libreta a tener todo el taller controlado desde el celular.
                            Ya no se me pierde ninguna moto ni ningún cobro. Los clientes reciben su resumen por WhatsApp
                            y eso nos da una seriedad que antes no teníamos."
                        </blockquote>
                        <div className="mp-testimonial-author">
                            <div className="mp-testimonial-avatar">
                                <Bike size={22} />
                            </div>
                            <div>
                                <strong>Taller MotoPartes</strong>
                                <span>Reparaciones y modificaciones de motos · México</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ORIGIN - nacido en un taller real */}
            <section className="mp-section mp-section-alt">
                <div className="mp-container">
                    <div className="mp-origin">
                        <div>
                            <span className="mp-section-tag"><Wrench size={12} /> Nacido en un taller</span>
                            <h2 className="mp-section-title">
                                La plataforma que <span className="mp-origin-accent">MotoPartes</span> usa a diario — ahora disponible para tu taller.
                            </h2>
                            <p className="mp-section-sub" style={{ textAlign: 'left' }}>
                                MotoPartes no se diseñó en un cubículo. Nació en un taller que se cansó de llevar órdenes en libreta
                                y construyó la solución que ahora puedes usar. Cada pantalla, cada flujo, cada automatización pasó
                                primero por el mostrador de un taller real.
                            </p>
                            <div className="mp-hero-ctas" style={{ marginTop: 24 }}>
                                <Link to="/casos/motopartes" className="mp-btn-outline">
                                    Leer el caso completo <ArrowRight size={14} />
                                </Link>
                            </div>
                        </div>

                        <div className="mp-origin-card">
                            <div className="mp-origin-logo">
                                <Bike size={40} />
                            </div>
                            <h3>Taller MotoPartes</h3>
                            <p>Reparaciones y modificaciones de motos</p>
                            <div className="mp-origin-quote">
                                "Si a nosotros nos funcionó para dejar la libreta, a tu taller también."
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="mp-section">
                <div className="mp-container" style={{ maxWidth: 760 }}>
                    <div className="mp-section-head">
                        <span className="mp-section-tag">Preguntas frecuentes</span>
                        <h2 className="mp-section-title">Lo que suelen preguntarnos.</h2>
                    </div>
                    <div className="mp-faq">
                        {FAQ.map((f, i) => (
                            <div key={i} className={`mp-faq-item ${openFaq === i ? 'open' : ''}`}>
                                <button
                                    className="mp-faq-q"
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    aria-expanded={openFaq === i}
                                >
                                    <span>{f.q}</span>
                                    {openFaq === i ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </button>
                                {openFaq === i && <div className="mp-faq-a">{f.a}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA FINAL */}
            <section className="mp-cta-final">
                <div className="mp-container">
                    <div className="mp-cta-card">
                        <h2>¿Listo para dejar la libreta?</h2>
                        <p>Crea tu cuenta en 2 minutos. 14 días del plan Pro gratis. Sin tarjeta.</p>
                        <div className="mp-hero-ctas" style={{ justifyContent: 'center' }}>
                            <Link to="/signup" className="mp-btn-white mp-btn-lg">
                                Empezar gratis <ArrowRight size={16} />
                            </Link>
                            <Link to="/casos" className="mp-btn-white-ghost mp-btn-lg">
                                Ver casos de éxito
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="mp-footer">
                <div className="mp-container">
                    <div className="mp-footer-grid">
                        <div className="mp-footer-brand">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <img src="/logo.png" alt="MotoPartes" style={{ width: 40, height: 40 }} />
                                <span className="mp-brand-word">
                                    <span className="mp-brand-moto" style={{ color: '#f1f5f9' }}>MOTO</span>
                                    <span className="mp-brand-partes">PARTES</span>
                                </span>
                            </div>
                            <p>Sistema de gestión para talleres de motos. Hecho en México.</p>
                        </div>

                        <div className="mp-footer-cols">
                            <div>
                                <h4>Producto</h4>
                                <a href="#features">Características</a>
                                <a href="#pricing">Precios</a>
                                <Link to="/signup">Crear cuenta</Link>
                            </div>
                            <div>
                                <h4>Recursos</h4>
                                <Link to="/blog">Blog</Link>
                                <Link to="/casos">Casos</Link>
                            </div>
                            <div>
                                <h4>Cuenta</h4>
                                <Link to="/login">Entrar</Link>
                                <a href="mailto:hola@motopartes.cloud">Contacto</a>
                            </div>
                        </div>
                    </div>
                    <div className="mp-footer-base">
                        © 2026 MotoPartes · Todos los derechos reservados
                    </div>
                </div>
            </footer>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
/* ============================================================
   MotoPartes — Landing v2 (rediseño 2026-04-19)
   Mobile-first, variables fluidas con clamp(), composición pro.
   ============================================================ */

.mp-landing {
    --c-bg: #ffffff;
    --c-ink: #0f172a;
    --c-muted: #64748b;
    --c-soft: #f8fafc;
    --c-border: #e2e8f0;
    --c-accent: #ef4444;
    --c-accent-dark: #dc2626;
    --c-accent-soft: #fef2f2;
    --c-success: #16a34a;

    background: var(--c-bg);
    color: var(--c-ink);
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-feature-settings: 'ss01', 'cv11';
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    overflow-x: hidden;
}
.mp-landing * { box-sizing: border-box; }

.mp-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 clamp(16px, 3vw, 32px);
}

/* ═══ REF BANNER ═══ */
.mp-ref-banner {
    background: linear-gradient(135deg, #fef3c7, #fde68a);
    color: #78350f;
    padding: 10px 16px;
    text-align: center;
    font-size: 0.88rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-bottom: 1px solid #fcd34d;
}
.mp-ref-banner strong { color: #92400e; font-weight: 700; }

/* ═══ NAV ═══ */
.mp-nav {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    border-bottom: 1px solid rgba(226, 232, 240, 0.6);
}
.mp-nav-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 12px clamp(16px, 3vw, 32px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
}
.mp-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    flex-shrink: 0;
}
.mp-brand img { width: 38px; height: 38px; object-fit: contain; }
.mp-brand-word { font-weight: 800; letter-spacing: -0.5px; font-size: 1.05rem; display: flex; gap: 2px; }
.mp-brand-moto { color: var(--c-ink); }
.mp-brand-partes { color: var(--c-accent); }

.mp-nav-links {
    display: flex;
    gap: clamp(16px, 2vw, 28px);
    align-items: center;
}
.mp-nav-links a {
    color: var(--c-muted);
    text-decoration: none;
    font-weight: 500;
    font-size: 0.92rem;
    transition: color 0.15s;
}
.mp-nav-links a:hover { color: var(--c-accent); }

.mp-nav-ctas { display: flex; gap: 10px; align-items: center; }
.mp-lang {
    background: var(--c-soft);
    color: var(--c-muted);
    border: none;
    padding: 7px 10px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: all 0.15s;
}
.mp-lang:hover { background: var(--c-border); color: var(--c-ink); }

.mp-burger {
    display: none;
    background: var(--c-soft);
    border: none;
    color: var(--c-ink);
    padding: 8px;
    border-radius: 10px;
    cursor: pointer;
}

@media (max-width: 860px) {
    .mp-nav-links, .mp-nav-ctas { display: none; }
    .mp-burger { display: inline-flex; }
}

/* DRAWER */
.mp-drawer-overlay {
    position: fixed; inset: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    z-index: 49;
    animation: mp-fade 0.2s ease;
}
.mp-drawer {
    position: fixed;
    top: 72px;
    left: 16px;
    right: 16px;
    background: white;
    border-radius: 20px;
    padding: 16px;
    box-shadow: 0 30px 60px rgba(15, 23, 42, 0.25);
    z-index: 50;
    display: flex;
    flex-direction: column;
    gap: 4px;
    animation: mp-slide-down 0.22s ease;
}
.mp-drawer a {
    color: var(--c-ink);
    text-decoration: none;
    padding: 12px 14px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.95rem;
    transition: background 0.15s;
}
.mp-drawer a:hover { background: var(--c-soft); color: var(--c-accent); }
.mp-drawer-sep { height: 1px; background: var(--c-border); margin: 6px 0; }
.mp-drawer-ghost {
    border: 1.5px solid var(--c-border) !important;
    text-align: center;
    color: var(--c-ink) !important;
}
.mp-drawer-primary {
    background: linear-gradient(135deg, var(--c-accent), var(--c-accent-dark)) !important;
    color: white !important;
    text-align: center;
    display: flex !important;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 6px 18px rgba(239, 68, 68, 0.3);
}
.mp-drawer-primary:hover { color: white !important; }
.mp-drawer-lang {
    background: var(--c-soft);
    color: var(--c-muted);
    border: none;
    padding: 12px;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
}

@keyframes mp-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes mp-slide-down { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

/* ═══ BUTTONS ═══ */
.mp-btn-primary, .mp-btn-ghost, .mp-btn-outline, .mp-btn-white, .mp-btn-white-ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 0.92rem;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    font-family: inherit;
}
.mp-btn-primary {
    background: linear-gradient(135deg, var(--c-accent), var(--c-accent-dark));
    color: white;
    box-shadow: 0 6px 16px rgba(239, 68, 68, 0.28);
}
.mp-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(239, 68, 68, 0.36);
    color: white;
}
.mp-btn-ghost {
    background: transparent;
    color: var(--c-ink);
    border: 1.5px solid var(--c-border);
}
.mp-btn-ghost:hover { background: var(--c-soft); border-color: #cbd5e1; }
.mp-btn-outline {
    background: white;
    color: var(--c-ink);
    border: 1.5px solid var(--c-ink);
}
.mp-btn-outline:hover { background: var(--c-ink); color: white; }
.mp-btn-white {
    background: white;
    color: var(--c-accent-dark);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.14);
}
.mp-btn-white:hover { transform: translateY(-2px); color: var(--c-accent-dark); }
.mp-btn-white-ghost {
    background: transparent;
    color: white;
    border: 1.5px solid rgba(255, 255, 255, 0.5);
}
.mp-btn-white-ghost:hover { background: rgba(255, 255, 255, 0.1); color: white; }
.mp-btn-lg { padding: 14px 24px; font-size: 1rem; border-radius: 12px; }

/* ═══ HERO ═══ */
.mp-hero {
    position: relative;
    padding: clamp(48px, 7vw, 90px) 0 clamp(60px, 8vw, 110px);
    overflow: hidden;
}
.mp-hero-grid {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 clamp(16px, 3vw, 32px);
    display: grid;
    grid-template-columns: 1.05fr 1fr;
    gap: clamp(40px, 5vw, 72px);
    align-items: center;
    position: relative;
    z-index: 1;
}
@media (max-width: 960px) {
    .mp-hero-grid { grid-template-columns: 1fr; gap: 40px; }
    .mp-hero-copy { text-align: center; }
    .mp-hero-pill { margin-left: auto; margin-right: auto; }
    .mp-hero-ctas, .mp-hero-trust { justify-content: center; }
}
@media (max-width: 640px) {
    .mp-hero { padding: 36px 0 50px; }
    .mp-hero-title { font-size: 2rem !important; letter-spacing: -1px !important; line-height: 1.1 !important; }
    .mp-hero-sub { font-size: 0.95rem !important; margin-bottom: 22px !important; }
    .mp-hero-pill { font-size: 0.76rem; padding: 5px 12px; margin-bottom: 14px; }
    .mp-hero-trust { gap: 10px; }
    .mp-trust-item { font-size: 0.78rem; }
}
.mp-hero-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--c-accent-soft);
    color: var(--c-accent-dark);
    border: 1px solid #fecaca;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 600;
    margin-bottom: 20px;
}
.mp-hero-title {
    font-size: clamp(2rem, 5.5vw, 3.75rem);
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -1.5px;
    margin: 0 0 20px;
    color: var(--c-ink);
}
.mp-hero-accent {
    background: linear-gradient(135deg, var(--c-accent), var(--c-accent-dark));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}
.mp-hero-sub {
    font-size: clamp(1rem, 1.3vw, 1.15rem);
    color: var(--c-muted);
    line-height: 1.65;
    margin: 0 0 30px;
    max-width: 560px;
}
.mp-hero-ctas {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 24px;
}
@media (max-width: 500px) {
    .mp-hero-ctas { flex-direction: column; align-items: stretch; }
    .mp-hero-ctas .mp-btn-lg { width: 100%; }
}
.mp-hero-trust {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
}
.mp-trust-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--c-muted);
    font-size: 0.85rem;
    font-weight: 500;
}
.mp-trust-item svg { color: var(--c-success); }

/* HERO MOCKUP */
.mp-hero-mockup {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 560px;
    padding: 40px 30px; /* espacio para que floats no se recorten */
}
.mp-phone {
    position: relative;
    width: 270px;
    height: 540px;
    background: #0f172a;
    border-radius: 42px;
    padding: 10px;
    box-shadow:
        0 40px 80px rgba(15, 23, 42, 0.25),
        0 0 0 10px rgba(15, 23, 42, 0.04),
        inset 0 0 0 2px #1e293b;
    flex-shrink: 0;
}
.mp-phone-notch {
    width: 110px;
    height: 24px;
    background: #0f172a;
    border-radius: 0 0 18px 18px;
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
}
.mp-phone-screen {
    background: #f8fafc;
    border-radius: 32px;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.mp-phone-header {
    background: #075e54;
    color: white;
    padding: 40px 14px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.mp-phone-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--c-accent), var(--c-accent-dark));
    color: white;
    font-weight: 800;
    font-size: 0.78rem;
    display: flex;
    align-items: center;
    justify-content: center;
}
.mp-phone-messages {
    padding: 16px 14px;
    background-image: linear-gradient(#e5ddd5, #e5ddd5);
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
}
.mp-msg {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 0.82rem;
    line-height: 1.4;
    color: #0f172a;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.mp-msg-them {
    background: white;
    align-self: flex-start;
    border-top-left-radius: 2px;
}
.mp-msg-us {
    background: #dcf8c6;
    align-self: flex-end;
    border-top-right-radius: 2px;
}
.mp-float-card {
    position: absolute;
    background: white;
    border-radius: 12px;
    padding: 10px 12px;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.14);
    border: 1px solid var(--c-border);
    animation: mp-float 4s ease-in-out infinite;
    white-space: nowrap;
    z-index: 2;
}
/* Floats posicionadas de manera que SIEMPRE queden dentro del viewport */
.mp-float-1 { top: 18%; left: calc(50% - 180px); animation-delay: 0s; }
.mp-float-2 { bottom: 14%; left: calc(50% + 80px); animation-delay: 1.5s; }
@keyframes mp-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
}
@media (max-width: 960px) {
    .mp-hero-mockup { min-height: 520px; padding: 30px 20px; }
    .mp-float-1 { left: calc(50% - 170px); }
    .mp-float-2 { left: calc(50% + 60px); }
}
@media (max-width: 500px) {
    .mp-hero-mockup { min-height: 460px; padding: 24px 12px; }
    .mp-phone { width: 220px; height: 440px; border-radius: 34px; padding: 8px; }
    .mp-phone-screen { border-radius: 26px; }
    .mp-phone-header { padding: 32px 12px 12px; }
    .mp-phone-messages { padding: 12px 10px; gap: 8px; }
    .mp-msg { padding: 7px 10px; font-size: 0.76rem; border-radius: 8px; }
    .mp-float-card { padding: 8px 10px; border-radius: 10px; }
    .mp-float-1 { top: 10%; left: calc(50% - 140px); }
    .mp-float-2 { bottom: 8%; left: calc(50% + 40px); }
    .mp-float-card > div > div > div:first-child { font-size: 0.68rem !important; }
    .mp-float-card > div > div > div:last-child { font-size: 0.62rem !important; }
}

/* Hero BG blobs */
.mp-hero-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
}
.mp-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.35;
}
.mp-blob-1 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, #fecaca, transparent 70%);
    top: -200px;
    right: -200px;
}
.mp-blob-2 {
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, #fef3c7, transparent 70%);
    bottom: -150px;
    left: -150px;
}

/* ═══ PROOF (social stats) ═══ */
.mp-proof {
    background: var(--c-ink);
    color: white;
    padding: clamp(32px, 5vw, 60px) 0;
}
.mp-proof-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: clamp(16px, 3vw, 40px);
}
@media (max-width: 720px) {
    .mp-proof-grid { grid-template-columns: 1fr 1fr; gap: 20px; }
}
.mp-stat { text-align: center; }
.mp-stat-num {
    font-size: clamp(1.6rem, 4.5vw, 3rem);
    font-weight: 800;
    letter-spacing: -1.5px;
    background: linear-gradient(135deg, #fff, #fca5a5);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1;
    margin-bottom: 6px;
}
.mp-stat-label {
    color: #94a3b8;
    font-size: clamp(0.76rem, 1.4vw, 0.88rem);
    line-height: 1.35;
    max-width: 200px;
    margin: 0 auto;
}

/* ═══ SECTIONS ═══ */
.mp-section {
    padding: clamp(40px, 7vw, 100px) 0;
}
.mp-section-alt { background: var(--c-soft); }
.mp-section-head {
    text-align: center;
    max-width: 720px;
    margin: 0 auto clamp(24px, 5vw, 56px);
}
@media (max-width: 640px) {
    .mp-section-title { font-size: 1.55rem !important; letter-spacing: -0.5px !important; }
    .mp-section-sub { font-size: 0.9rem !important; }
    .mp-section-head { margin-bottom: 20px; }
    .mp-section-tag { font-size: 0.72rem !important; padding: 4px 10px !important; margin-bottom: 10px !important; }
}
.mp-section-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    background: var(--c-accent-soft);
    color: var(--c-accent-dark);
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    margin-bottom: 14px;
}
.mp-section-title {
    font-size: clamp(1.5rem, 3.5vw, 2.5rem);
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1.15;
    color: var(--c-ink);
    margin: 0 0 12px;
}
.mp-section-sub {
    color: var(--c-muted);
    font-size: clamp(0.95rem, 1.2vw, 1.08rem);
    line-height: 1.65;
    margin: 0;
    text-align: center;
}

/* ═══ STEPS ═══ */
.mp-steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: clamp(12px, 2vw, 24px);
}
.mp-step {
    background: white;
    border: 1px solid var(--c-border);
    border-radius: 16px;
    padding: clamp(16px, 2vw, 28px);
    position: relative;
    transition: all 0.2s;
}
.mp-step:hover {
    border-color: var(--c-accent);
    transform: translateY(-2px);
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.06);
}
.mp-step-num {
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--c-accent);
    letter-spacing: 1px;
    margin-bottom: 8px;
}
.mp-step-icon {
    width: 42px;
    height: 42px;
    border-radius: 11px;
    background: linear-gradient(135deg, var(--c-accent-soft), #fee2e2);
    color: var(--c-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
}
.mp-step h3 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--c-ink);
    margin: 0 0 4px;
}
.mp-step p {
    color: var(--c-muted);
    font-size: 0.86rem;
    line-height: 1.5;
    margin: 0;
}
@media (max-width: 640px) {
    .mp-steps { grid-template-columns: 1fr 1fr; gap: 10px; }
    .mp-step { padding: 14px 16px; border-radius: 14px; }
    .mp-step-icon { width: 34px; height: 34px; margin-bottom: 8px; }
    .mp-step-icon svg { width: 16px; height: 16px; }
    .mp-step h3 { font-size: 0.9rem; }
    .mp-step p { font-size: 0.78rem; line-height: 1.4; }
}

/* ═══ FEATURES ═══ */
.mp-features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: clamp(12px, 2vw, 20px);
}
.mp-feature {
    background: white;
    border: 1px solid var(--c-border);
    border-radius: 16px;
    padding: clamp(18px, 2.5vw, 28px);
    transition: all 0.2s;
}
.mp-feature:hover {
    border-color: var(--c-accent);
    transform: translateY(-3px);
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}
.mp-feature-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--c-accent-soft);
    color: var(--c-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
}
.mp-feature h3 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--c-ink);
    margin: 0 0 4px;
}
.mp-feature p {
    color: var(--c-muted);
    font-size: 0.84rem;
    line-height: 1.5;
    margin: 0;
}
@media (max-width: 640px) {
    .mp-features { grid-template-columns: 1fr 1fr; gap: 10px; }
    .mp-feature { padding: 14px; border-radius: 14px; }
    .mp-feature-icon { width: 34px; height: 34px; margin-bottom: 8px; border-radius: 9px; }
    .mp-feature-icon svg { width: 16px; height: 16px; }
    .mp-feature h3 { font-size: 0.88rem; }
    .mp-feature p { font-size: 0.76rem; line-height: 1.4; }
}

/* ═══ PRICING ═══ */
.mp-billing-toggle {
    display: inline-flex;
    gap: 4px;
    background: var(--c-border);
    padding: 4px;
    border-radius: 12px;
    margin-top: 18px;
}
.mp-billing-toggle button {
    padding: 7px 16px;
    border-radius: 9px;
    background: transparent;
    color: var(--c-muted);
    font-weight: 600;
    font-size: 0.84rem;
    border: none;
    cursor: pointer;
    transition: all 0.2s;
}
.mp-billing-toggle button.active {
    background: white;
    color: var(--c-ink);
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.06);
}

.mp-pricing {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: clamp(12px, 2vw, 20px);
    align-items: stretch;
}
.mp-plan {
    background: white;
    border: 2px solid var(--c-border);
    border-radius: 20px;
    padding: clamp(18px, 2vw, 32px);
    position: relative;
    display: flex;
    flex-direction: column;
    transition: all 0.2s;
}
.mp-plan:hover {
    border-color: var(--c-accent);
    transform: translateY(-4px);
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
}
.mp-plan-hl {
    border-color: var(--c-accent);
    box-shadow: 0 20px 44px rgba(239, 68, 68, 0.18);
    transform: scale(1.02);
}
@media (max-width: 900px) { .mp-plan-hl { transform: none; } }
.mp-plan-badge {
    position: absolute;
    top: -10px;
    right: 16px;
    background: linear-gradient(135deg, var(--c-accent), var(--c-accent-dark));
    color: white;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 700;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}
.mp-plan-head { margin-bottom: 12px; }
.mp-plan-head h3 {
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--c-ink);
    margin: 0 0 2px;
}
.mp-plan-head p {
    color: var(--c-muted);
    font-size: 0.82rem;
    margin: 0;
    line-height: 1.4;
}
.mp-plan-price {
    margin: 4px 0 14px;
    display: flex;
    align-items: baseline;
    gap: 6px;
}
.mp-plan-amount {
    font-size: 2.2rem;
    font-weight: 800;
    color: var(--c-ink);
    letter-spacing: -1.5px;
    line-height: 1;
}
.mp-plan-per { color: var(--c-muted); font-size: 0.8rem; font-weight: 500; }
.mp-plan-cta { width: 100%; margin-bottom: 14px; }
.mp-plan-features {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
}
.mp-plan-features li {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    font-size: 0.84rem;
    color: #475569;
    line-height: 1.4;
}
.mp-plan-features svg {
    color: var(--c-success);
    flex-shrink: 0;
    margin-top: 3px;
}
.mp-pricing-note {
    text-align: center;
    color: var(--c-muted);
    font-size: 0.82rem;
    margin-top: 24px;
    line-height: 1.55;
}

/* En móvil: cards mucho más compactos */
@media (max-width: 640px) {
    .mp-pricing { gap: 10px; }
    .mp-plan { padding: 16px 18px; border-radius: 16px; }
    .mp-plan-head { margin-bottom: 8px; }
    .mp-plan-head h3 { font-size: 1rem; }
    .mp-plan-head p { font-size: 0.78rem; }
    .mp-plan-price { margin: 2px 0 10px; }
    .mp-plan-amount { font-size: 1.7rem; }
    .mp-plan-per { font-size: 0.75rem; }
    .mp-plan-cta { margin-bottom: 10px; padding: 9px 14px !important; font-size: 0.85rem !important; }
    .mp-plan-features { gap: 5px; }
    .mp-plan-features li { font-size: 0.8rem; line-height: 1.35; gap: 6px; }
    .mp-plan-features svg { width: 12px; height: 12px; margin-top: 2px; }
    .mp-plan-badge { font-size: 0.65rem; padding: 3px 10px; top: -9px; right: 14px; }
}

/* ═══ TESTIMONIAL ═══ */
.mp-testimonial {
    padding: clamp(32px, 6vw, 80px) 0;
}
.mp-testimonial-card {
    max-width: 760px;
    margin: 0 auto;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: white;
    border-radius: 24px;
    padding: clamp(24px, 4vw, 48px);
    box-shadow: 0 30px 60px rgba(15, 23, 42, 0.25);
    text-align: center;
}
@media (max-width: 640px) {
    .mp-testimonial-card { border-radius: 18px; padding: 24px 20px; }
    .mp-testimonial-card blockquote { font-size: 0.95rem !important; margin-bottom: 18px; }
    .mp-testimonial-avatar { width: 44px; height: 44px; }
    .mp-testimonial-author strong { font-size: 0.9rem; }
    .mp-testimonial-author span { font-size: 0.76rem; }
}
.mp-testimonial-stars {
    display: flex;
    gap: 2px;
    justify-content: center;
    margin-bottom: 18px;
}
.mp-testimonial-card blockquote {
    font-size: clamp(1rem, 1.6vw, 1.25rem);
    line-height: 1.7;
    margin: 0 0 28px;
    font-style: italic;
    color: #e2e8f0;
}
.mp-testimonial-author {
    display: flex;
    align-items: center;
    gap: 14px;
    justify-content: center;
}
.mp-testimonial-avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--c-accent), var(--c-accent-dark));
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
}
.mp-testimonial-author strong {
    display: block;
    font-size: 0.96rem;
    color: white;
}
.mp-testimonial-author span {
    color: #94a3b8;
    font-size: 0.82rem;
}

/* ═══ ORIGIN ═══ */
.mp-origin {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: clamp(32px, 5vw, 60px);
    align-items: center;
}
@media (max-width: 860px) { .mp-origin { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
    .mp-origin-card { padding: 24px 20px; border-radius: 18px; }
    .mp-origin-logo { width: 60px; height: 60px; margin-bottom: 14px; }
    .mp-origin-logo svg { width: 28px; height: 28px; }
    .mp-origin-card h3 { font-size: 1.05rem; }
    .mp-origin-card > p { font-size: 0.82rem; margin-bottom: 16px; }
    .mp-origin-quote { font-size: 0.85rem; padding-top: 14px; }
}
.mp-origin-accent { color: var(--c-accent); }
.mp-origin-card {
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: white;
    border-radius: 24px;
    padding: clamp(28px, 3vw, 40px);
    text-align: center;
    box-shadow: 0 25px 50px rgba(15, 23, 42, 0.25);
}
.mp-origin-logo {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--c-accent), var(--c-accent-dark));
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 18px;
    color: white;
}
.mp-origin-card h3 {
    font-size: 1.2rem;
    font-weight: 800;
    margin: 0 0 4px;
}
.mp-origin-card > p {
    color: #cbd5e1;
    font-size: 0.88rem;
    margin: 0 0 22px;
}
.mp-origin-quote {
    font-style: italic;
    font-size: 0.92rem;
    color: #e2e8f0;
    border-top: 1px solid #334155;
    padding-top: 18px;
    line-height: 1.55;
}

/* ═══ FAQ ═══ */
.mp-faq { display: flex; flex-direction: column; gap: 10px; }
.mp-faq-item {
    background: white;
    border: 1px solid var(--c-border);
    border-radius: 14px;
    overflow: hidden;
    transition: all 0.2s;
}
.mp-faq-item.open { border-color: var(--c-accent); }
.mp-faq-q {
    width: 100%;
    padding: 16px 20px;
    background: transparent;
    border: none;
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--c-ink);
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    text-align: left;
    font-family: inherit;
    transition: background 0.15s;
}
.mp-faq-q:hover { background: var(--c-soft); }
.mp-faq-q svg { color: var(--c-muted); flex-shrink: 0; }
.mp-faq-item.open .mp-faq-q svg { color: var(--c-accent); }
.mp-faq-a {
    padding: 0 20px 18px;
    color: var(--c-muted);
    font-size: 0.88rem;
    line-height: 1.6;
    animation: mp-fade 0.2s ease;
}
@media (max-width: 640px) {
    .mp-faq-q { padding: 14px 16px; font-size: 0.88rem; }
    .mp-faq-a { padding: 0 16px 14px; font-size: 0.82rem; line-height: 1.55; }
}

/* ═══ CTA FINAL ═══ */
.mp-cta-final {
    padding: clamp(32px, 6vw, 80px) 0;
}
@media (max-width: 640px) {
    .mp-cta-card { padding: 36px 24px; border-radius: 22px; }
    .mp-cta-card h2 { font-size: 1.5rem !important; }
    .mp-cta-card p { font-size: 0.9rem !important; margin-bottom: 20px !important; }
}
.mp-cta-card {
    background: linear-gradient(135deg, var(--c-accent), var(--c-accent-dark));
    color: white;
    border-radius: 28px;
    padding: clamp(40px, 6vw, 70px) clamp(24px, 4vw, 48px);
    text-align: center;
    box-shadow: 0 30px 60px rgba(239, 68, 68, 0.28);
    position: relative;
    overflow: hidden;
}
.mp-cta-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
        radial-gradient(circle at 20% 30%, rgba(255,255,255,0.15), transparent 40%),
        radial-gradient(circle at 80% 70%, rgba(255,255,255,0.1), transparent 40%);
    pointer-events: none;
}
.mp-cta-card h2 {
    font-size: clamp(1.6rem, 3.5vw, 2.5rem);
    font-weight: 800;
    margin: 0 0 12px;
    letter-spacing: -1px;
    position: relative;
    z-index: 1;
}
.mp-cta-card p {
    color: rgba(255, 255, 255, 0.92);
    font-size: clamp(0.95rem, 1.2vw, 1.1rem);
    margin: 0 0 28px;
    position: relative;
    z-index: 1;
}
.mp-cta-card .mp-hero-ctas { position: relative; z-index: 1; }

/* ═══ FOOTER ═══ */
.mp-footer {
    background: var(--c-ink);
    color: #cbd5e1;
    padding: clamp(48px, 6vw, 70px) 0 24px;
}
.mp-footer-grid {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: clamp(28px, 4vw, 60px);
    margin-bottom: 32px;
}
@media (max-width: 780px) { .mp-footer-grid { grid-template-columns: 1fr; gap: 28px; } }
@media (max-width: 640px) {
    .mp-footer { padding: 40px 0 20px; }
    .mp-footer-cols h4 { font-size: 0.85rem; }
    .mp-footer-cols a { font-size: 0.82rem; }
}
.mp-footer-brand p {
    color: #94a3b8;
    font-size: 0.9rem;
    margin: 12px 0 0;
    line-height: 1.55;
    max-width: 280px;
}
.mp-footer-cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
}
@media (max-width: 540px) { .mp-footer-cols { grid-template-columns: 1fr 1fr; } }
.mp-footer-cols h4 {
    color: white;
    font-size: 0.92rem;
    font-weight: 700;
    margin: 0 0 12px;
}
.mp-footer-cols a {
    display: block;
    color: #94a3b8;
    text-decoration: none;
    padding: 4px 0;
    font-size: 0.86rem;
    transition: color 0.15s;
}
.mp-footer-cols a:hover { color: var(--c-accent); }
.mp-footer-base {
    padding-top: 24px;
    border-top: 1px solid #1e293b;
    color: #64748b;
    font-size: 0.82rem;
    text-align: center;
}
`;
