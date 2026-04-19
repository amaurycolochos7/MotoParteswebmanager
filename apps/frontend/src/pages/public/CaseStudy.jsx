import { useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MapPin, TrendingUp } from 'lucide-react';
import { getCase } from '../../content/cases/cases.jsx';

export default function CaseStudy() {
    const { slug } = useParams();
    const c = getCase(slug);

    useEffect(() => {
        if (c) document.title = `${c.shopName} — Caso de éxito MotoPartes`;
    }, [c]);

    if (!c) return <Navigate to="/casos" replace />;

    const Body = c.body;
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `Caso de éxito: ${c.shopName}`,
        description: c.summary,
        inLanguage: 'es-MX',
        publisher: {
            '@type': 'Organization',
            name: 'MotoPartes',
            logo: { '@type': 'ImageObject', url: 'https://motopartes.cloud/logo.png' },
        },
        mainEntityOfPage: `https://motopartes.cloud/casos/${c.slug}`,
    };

    return (
        <div className="cst-page">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

            <header className="cst-header">
                <Link to="/" className="cst-brand">
                    <img src="/logo.png" alt="MotoPartes" />
                    <span className="cst-brand-word">
                        <span className="cst-moto">MOTO</span><span className="cst-partes">PARTES</span>
                    </span>
                </Link>
                <nav className="cst-nav">
                    <Link to="/casos">Casos</Link>
                    <Link to="/blog">Blog</Link>
                    <Link to="/signup" className="cst-cta">Crear cuenta</Link>
                </nav>
            </header>

            <article className="cst-article">
                <Link to="/casos" className="cst-back"><ArrowLeft size={14} /> Volver a casos</Link>

                <div className="cst-hero">
                    <div className="cst-pill"><MapPin size={14} /> {c.city}</div>
                    <h1>{c.shopName}</h1>
                    <p className="cst-tagline">{c.hero}</p>
                </div>

                <div className="cst-metrics-grid">
                    {c.metrics.map((m) => (
                        <div key={m.label} className="cst-metric">
                            <div className="cst-metric-label">{m.label}</div>
                            <div className="cst-metric-row">
                                <span className="cst-before">{m.before}</span>
                                <TrendingUp size={18} />
                                <span className="cst-after">{m.after}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="cst-body">
                    <Body />
                </div>

                <div className="cst-cta-box">
                    <h3>¿Tu taller puede ser el siguiente?</h3>
                    <p>Empieza gratis. 7 días de plan Pro sin costo. Sin tarjeta de crédito.</p>
                    <Link to="/signup" className="cst-cta-btn">Crear cuenta <ArrowRight size={16} /></Link>
                </div>
            </article>

            <footer className="cst-footer">
                <p>© 2026 MotoPartes • Sistema de gestión para talleres de motos</p>
            </footer>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
.cst-page { min-height: 100vh; background: #ffffff; color: #0f172a; font-family: inherit; }
.cst-header { max-width: 900px; margin: 0 auto; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
.cst-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.cst-brand img { width: 36px; height: 36px; }
.cst-brand-word { font-weight: 800; letter-spacing: -0.3px; }
.cst-moto { color: #1e293b; } .cst-partes { color: #ef4444; }
.cst-nav { display: flex; gap: 18px; align-items: center; }
.cst-nav a { color: #475569; text-decoration: none; font-weight: 500; font-size: 0.92rem; }
.cst-nav a:hover { color: #ef4444; }
.cst-nav .cst-cta { background: linear-gradient(135deg,#ef4444,#dc2626); color: white; padding: 8px 16px; border-radius: 8px; font-weight: 600; }
.cst-article { max-width: 800px; margin: 0 auto; padding: 40px 24px 60px; }
.cst-back { color: #64748b; text-decoration: none; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 24px; }
.cst-back:hover { color: #ef4444; }
.cst-hero { text-align: center; padding: 30px 0 20px; border-bottom: 1px solid #e2e8f0; margin-bottom: 30px; }
.cst-pill { display: inline-flex; align-items: center; gap: 4px; background: #f1f5f9; color: #475569; padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; margin-bottom: 14px; }
.cst-article h1 { font-size: 2.4rem; font-weight: 800; margin: 0 0 10px; color: #0f172a; letter-spacing: -1px; }
.cst-tagline { color: #ef4444; font-style: italic; font-size: 1.15rem; max-width: 600px; margin: 0 auto; line-height: 1.5; }
.cst-metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 30px 0; }
.cst-metric { background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; text-align: center; }
.cst-metric-label { color: #64748b; font-size: 0.82rem; margin-bottom: 10px; }
.cst-metric-row { display: flex; align-items: center; justify-content: center; gap: 10px; }
.cst-before { color: #94a3b8; text-decoration: line-through; font-size: 1rem; }
.cst-after { color: #16a34a; font-weight: 800; font-size: 1.35rem; }
.cst-metric-row svg { color: #16a34a; }
.cst-body { color: #1e293b; line-height: 1.75; font-size: 1.05rem; margin-top: 30px; }
.cst-body p { margin: 0 0 18px; }
.cst-body h2 { font-size: 1.45rem; font-weight: 800; margin: 36px 0 14px; color: #0f172a; letter-spacing: -0.3px; }
.cst-body ul, .cst-body ol { margin: 0 0 18px; padding-left: 24px; }
.cst-body li { margin-bottom: 6px; }
.cst-body strong { color: #0f172a; font-weight: 700; }
.cst-cta-box { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border-radius: 16px; padding: 32px; margin: 40px 0 0; text-align: center; }
.cst-cta-box h3 { margin: 0 0 8px; font-size: 1.3rem; }
.cst-cta-box p { margin: 0 0 18px; color: rgba(255,255,255,0.9); }
.cst-cta-btn { display: inline-flex; align-items: center; gap: 6px; background: white; color: #dc2626; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 0.95rem; }
.cst-cta-btn:hover { transform: translateY(-2px); color: #dc2626; }
.cst-footer { text-align: center; padding: 30px 24px; background: #0f172a; color: #64748b; font-size: 0.85rem; }
`;
