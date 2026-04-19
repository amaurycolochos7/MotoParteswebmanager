import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Calendar, BookOpen } from 'lucide-react';
import { POSTS } from '../../content/blog/posts.jsx';

function fmtDate(iso) {
    try {
        return new Date(iso).toLocaleDateString('es-MX', {
            day: '2-digit', month: 'long', year: 'numeric',
        });
    } catch { return iso; }
}

export default function Blog() {
    useEffect(() => {
        document.title = 'Blog — MotoPartes';
    }, []);

    const sorted = [...POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

    return (
        <div className="bl-page">
            <header className="bl-header">
                <Link to="/" className="bl-brand">
                    <img src="/logo.png" alt="MotoPartes" />
                    <span className="bl-brand-word">
                        <span className="bl-moto">MOTO</span><span className="bl-partes">PARTES</span>
                    </span>
                </Link>
                <nav className="bl-nav">
                    <Link to="/">Inicio</Link>
                    <Link to="/casos">Casos</Link>
                    <Link to="/signup" className="bl-cta">Crear cuenta</Link>
                </nav>
            </header>

            <section className="bl-hero">
                <div className="bl-hero-inner">
                    <BookOpen size={22} />
                    <h1>Blog de MotoPartes</h1>
                    <p>Consejos prácticos para dueños de talleres de motos. Operación, comisiones, ventas, WhatsApp.</p>
                </div>
            </section>

            <main className="bl-list">
                {sorted.map((post) => (
                    <article key={post.slug} className="bl-card">
                        <div className="bl-card-meta">
                            <span><Calendar size={14} /> {fmtDate(post.publishedAt)}</span>
                            <span><Clock size={14} /> {post.readMinutes} min lectura</span>
                        </div>
                        <h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2>
                        <p className="bl-card-excerpt">{post.excerpt}</p>
                        <div className="bl-card-foot">
                            <div className="bl-tags">
                                {post.tags.map((t) => <span key={t} className="bl-tag">#{t}</span>)}
                            </div>
                            <Link to={`/blog/${post.slug}`} className="bl-read">
                                Leer <ArrowRight size={16} />
                            </Link>
                        </div>
                    </article>
                ))}
            </main>

            <footer className="bl-footer">
                <p>
                    ¿Quieres que tu taller opere sin libreta? <Link to="/signup">Crea tu cuenta gratis</Link>.
                </p>
            </footer>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
.bl-page { min-height: 100vh; background: #ffffff; color: #0f172a; font-family: inherit; }
.bl-header { max-width: 1100px; margin: 0 auto; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
.bl-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.bl-brand img { width: 36px; height: 36px; }
.bl-brand-word { font-weight: 800; letter-spacing: -0.3px; }
.bl-moto { color: #1e293b; } .bl-partes { color: #ef4444; }
.bl-nav { display: flex; gap: 20px; align-items: center; }
.bl-nav a { color: #475569; text-decoration: none; font-weight: 500; font-size: 0.92rem; }
.bl-nav a:hover { color: #ef4444; }
.bl-nav .bl-cta { background: linear-gradient(135deg,#ef4444,#dc2626); color: white; padding: 8px 16px; border-radius: 8px; font-weight: 600; }
.bl-nav .bl-cta:hover { color: white; transform: translateY(-1px); }
.bl-hero { background: linear-gradient(135deg, #fef2f2 0%, #fff 100%); padding: 60px 24px; text-align: center; border-bottom: 1px solid #fecaca; }
.bl-hero-inner svg { color: #ef4444; margin-bottom: 8px; }
.bl-hero h1 { font-size: 2.4rem; font-weight: 800; margin: 0 0 10px; color: #0f172a; letter-spacing: -1px; }
.bl-hero p { color: #475569; font-size: 1.05rem; max-width: 600px; margin: 0 auto; line-height: 1.5; }
.bl-list { max-width: 900px; margin: 50px auto; padding: 0 24px; display: flex; flex-direction: column; gap: 24px; }
.bl-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; transition: all 0.2s ease; }
.bl-card:hover { border-color: #ef4444; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.06); }
.bl-card-meta { display: flex; gap: 16px; color: #94a3b8; font-size: 0.85rem; margin-bottom: 10px; }
.bl-card-meta span { display: inline-flex; align-items: center; gap: 4px; }
.bl-card h2 { margin: 0 0 10px; font-size: 1.3rem; line-height: 1.35; }
.bl-card h2 a { color: #0f172a; text-decoration: none; }
.bl-card h2 a:hover { color: #ef4444; }
.bl-card-excerpt { color: #475569; line-height: 1.55; margin: 0 0 18px; font-size: 0.95rem; }
.bl-card-foot { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.bl-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.bl-tag { background: #f1f5f9; color: #475569; padding: 3px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 500; }
.bl-read { display: inline-flex; align-items: center; gap: 4px; color: #ef4444; font-weight: 700; text-decoration: none; font-size: 0.92rem; }
.bl-read:hover { text-decoration: underline; }
.bl-footer { text-align: center; padding: 40px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; color: #475569; }
.bl-footer a { color: #ef4444; font-weight: 600; }
`;
