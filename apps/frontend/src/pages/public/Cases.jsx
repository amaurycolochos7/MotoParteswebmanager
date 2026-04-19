import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, Award, TrendingUp } from 'lucide-react';
import { CASES } from '../../content/cases/cases.jsx';

export default function Cases() {
    useEffect(() => { document.title = 'Casos de éxito — MotoPartes'; }, []);

    return (
        <div className="cs-page">
            <header className="cs-header">
                <Link to="/" className="cs-brand">
                    <img src="/logo.png" alt="MotoPartes" />
                    <span className="cs-brand-word">
                        <span className="cs-moto">MOTO</span><span className="cs-partes">PARTES</span>
                    </span>
                </Link>
                <nav className="cs-nav">
                    <Link to="/">Inicio</Link>
                    <Link to="/blog">Blog</Link>
                    <Link to="/signup" className="cs-cta">Crear cuenta</Link>
                </nav>
            </header>

            <section className="cs-hero">
                <div className="cs-hero-inner">
                    <Award size={22} />
                    <h1>Casos de éxito</h1>
                    <p>Talleres reales que cambiaron su operación con MotoPartes. Números verificables y testimonios directos.</p>
                </div>
            </section>

            <main className="cs-list">
                {CASES.map((c) => (
                    <article key={c.slug} className="cs-card">
                        <div className="cs-card-top">
                            <div>
                                <div className="cs-shop-pill"><MapPin size={14} /> {c.city}</div>
                                <h2><Link to={`/casos/${c.slug}`}>{c.shopName}</Link></h2>
                                <p className="cs-hero-text">{c.hero}</p>
                            </div>
                        </div>
                        <p className="cs-summary">{c.summary}</p>
                        <div className="cs-metrics">
                            {c.metrics.slice(0, 3).map((m) => (
                                <div key={m.label} className="cs-metric">
                                    <span className="cs-metric-label">{m.label}</span>
                                    <div className="cs-metric-vals">
                                        <span className="cs-metric-before">{m.before}</span>
                                        <TrendingUp size={14} />
                                        <span className="cs-metric-after">{m.after}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Link to={`/casos/${c.slug}`} className="cs-read">
                            Leer caso completo <ArrowRight size={16} />
                        </Link>
                    </article>
                ))}
            </main>

            <footer className="cs-footer">
                <p>¿Tu taller puede ser el siguiente? <Link to="/signup">Empieza gratis</Link>.</p>
            </footer>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
.cs-page { min-height: 100vh; background: #ffffff; color: #0f172a; font-family: inherit; }
.cs-header { max-width: 1100px; margin: 0 auto; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
.cs-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.cs-brand img { width: 36px; height: 36px; }
.cs-brand-word { font-weight: 800; letter-spacing: -0.3px; }
.cs-moto { color: #1e293b; } .cs-partes { color: #ef4444; }
.cs-nav { display: flex; gap: 20px; align-items: center; }
.cs-nav a { color: #475569; text-decoration: none; font-weight: 500; font-size: 0.92rem; }
.cs-nav a:hover { color: #ef4444; }
.cs-nav .cs-cta { background: linear-gradient(135deg,#ef4444,#dc2626); color: white; padding: 8px 16px; border-radius: 8px; font-weight: 600; }
.cs-hero { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 70px 24px; text-align: center; }
.cs-hero-inner svg { color: #ef4444; margin-bottom: 8px; }
.cs-hero h1 { font-size: 2.4rem; font-weight: 800; margin: 0 0 10px; letter-spacing: -1px; }
.cs-hero p { color: #cbd5e1; font-size: 1.05rem; max-width: 600px; margin: 0 auto; line-height: 1.5; }
.cs-list { max-width: 900px; margin: 50px auto; padding: 0 24px; display: flex; flex-direction: column; gap: 30px; }
.cs-card { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 32px; }
.cs-shop-pill { display: inline-flex; align-items: center; gap: 4px; background: #f1f5f9; color: #475569; padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; margin-bottom: 12px; }
.cs-card h2 { margin: 0 0 8px; font-size: 1.6rem; letter-spacing: -0.3px; }
.cs-card h2 a { color: #0f172a; text-decoration: none; }
.cs-card h2 a:hover { color: #ef4444; }
.cs-hero-text { color: #ef4444; font-weight: 600; margin: 0 0 14px; font-size: 1.02rem; font-style: italic; }
.cs-summary { color: #475569; line-height: 1.55; margin: 0 0 24px; }
.cs-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; padding: 20px; background: #f8fafc; border-radius: 14px; margin-bottom: 22px; }
.cs-metric { text-align: center; }
.cs-metric-label { display: block; color: #64748b; font-size: 0.82rem; margin-bottom: 4px; }
.cs-metric-vals { display: flex; align-items: center; justify-content: center; gap: 8px; }
.cs-metric-before { color: #94a3b8; text-decoration: line-through; font-size: 0.92rem; }
.cs-metric-after { color: #16a34a; font-weight: 800; font-size: 1.2rem; }
.cs-metrics .cs-metric svg { color: #16a34a; }
.cs-read { display: inline-flex; align-items: center; gap: 4px; color: #ef4444; font-weight: 700; text-decoration: none; font-size: 0.95rem; }
.cs-read:hover { text-decoration: underline; }
.cs-footer { text-align: center; padding: 40px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; color: #475569; }
.cs-footer a { color: #ef4444; font-weight: 600; }
`;
