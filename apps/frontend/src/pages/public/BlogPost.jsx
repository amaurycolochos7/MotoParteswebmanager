import { useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, ArrowRight } from 'lucide-react';
import { POSTS, getPost } from '../../content/blog/posts.jsx';

function fmtDate(iso) {
    try {
        return new Date(iso).toLocaleDateString('es-MX', {
            day: '2-digit', month: 'long', year: 'numeric',
        });
    } catch { return iso; }
}

export default function BlogPost() {
    const { slug } = useParams();
    const post = getPost(slug);

    useEffect(() => {
        if (post) document.title = `${post.title} — MotoPartes`;
    }, [post]);

    if (!post) return <Navigate to="/blog" replace />;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        author: { '@type': 'Organization', name: post.author },
        datePublished: post.publishedAt,
        inLanguage: 'es-MX',
        publisher: {
            '@type': 'Organization',
            name: 'MotoPartes',
            logo: { '@type': 'ImageObject', url: 'https://motopartes.cloud/logo.png' },
        },
        mainEntityOfPage: `https://motopartes.cloud/blog/${post.slug}`,
    };

    const Body = post.body;
    const related = POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

    return (
        <div className="bp-page">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

            <header className="bp-header">
                <Link to="/" className="bp-brand">
                    <img src="/logo.png" alt="MotoPartes" />
                    <span className="bp-brand-word">
                        <span className="bp-moto">MOTO</span><span className="bp-partes">PARTES</span>
                    </span>
                </Link>
                <nav className="bp-nav">
                    <Link to="/blog">Blog</Link>
                    <Link to="/casos">Casos</Link>
                    <Link to="/signup" className="bp-cta">Crear cuenta</Link>
                </nav>
            </header>

            <article className="bp-article">
                <Link to="/blog" className="bp-back"><ArrowLeft size={14} /> Volver al blog</Link>
                <h1>{post.title}</h1>
                <div className="bp-meta">
                    <span><Calendar size={14} /> {fmtDate(post.publishedAt)}</span>
                    <span><Clock size={14} /> {post.readMinutes} min lectura</span>
                    <span className="bp-author">por {post.author}</span>
                </div>

                <div className="bp-body">
                    <Body />
                </div>

                <div className="bp-cta-box">
                    <h3>¿Quieres dejar la libreta y usar MotoPartes en tu taller?</h3>
                    <p>Crea tu cuenta gratis en 2 minutos. 7 días de plan Pro sin costo.</p>
                    <Link to="/signup" className="bp-cta-btn">Crear cuenta <ArrowRight size={16} /></Link>
                </div>

                {related.length > 0 && (
                    <section className="bp-related">
                        <h3>Sigue leyendo</h3>
                        <div className="bp-related-grid">
                            {related.map((p) => (
                                <Link key={p.slug} to={`/blog/${p.slug}`} className="bp-related-card">
                                    <h4>{p.title}</h4>
                                    <p>{p.excerpt}</p>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
            </article>

            <footer className="bp-footer">
                <p>© 2026 MotoPartes • Sistema de gestión para talleres de motos</p>
            </footer>

            <style>{styles}</style>
        </div>
    );
}

const styles = `
.bp-page { min-height: 100vh; background: #ffffff; color: #0f172a; font-family: inherit; }
.bp-header { max-width: 900px; margin: 0 auto; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
.bp-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.bp-brand img { width: 36px; height: 36px; }
.bp-brand-word { font-weight: 800; letter-spacing: -0.3px; }
.bp-moto { color: #1e293b; } .bp-partes { color: #ef4444; }
.bp-nav { display: flex; gap: 18px; align-items: center; }
.bp-nav a { color: #475569; text-decoration: none; font-weight: 500; font-size: 0.92rem; }
.bp-nav a:hover { color: #ef4444; }
.bp-nav .bp-cta { background: linear-gradient(135deg,#ef4444,#dc2626); color: white; padding: 8px 16px; border-radius: 8px; font-weight: 600; }
.bp-article { max-width: 720px; margin: 40px auto; padding: 0 24px 60px; }
.bp-back { color: #64748b; text-decoration: none; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 20px; }
.bp-back:hover { color: #ef4444; }
.bp-article h1 { font-size: 2.2rem; line-height: 1.2; letter-spacing: -0.5px; margin: 0 0 14px; color: #0f172a; }
.bp-meta { display: flex; gap: 16px; flex-wrap: wrap; color: #94a3b8; font-size: 0.88rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 28px; }
.bp-meta span { display: inline-flex; align-items: center; gap: 4px; }
.bp-author { color: #475569; font-weight: 500; }
.bp-body { color: #1e293b; line-height: 1.75; font-size: 1.05rem; }
.bp-body p { margin: 0 0 18px; }
.bp-body h2 { font-size: 1.45rem; font-weight: 800; margin: 36px 0 14px; color: #0f172a; letter-spacing: -0.3px; }
.bp-body h3 { font-size: 1.2rem; font-weight: 700; margin: 28px 0 10px; color: #0f172a; }
.bp-body ul, .bp-body ol { margin: 0 0 18px; padding-left: 24px; }
.bp-body li { margin-bottom: 6px; }
.bp-body pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 10px; overflow-x: auto; font-size: 0.92rem; margin: 0 0 18px; }
.bp-body strong { color: #0f172a; font-weight: 700; }
.bp-cta-box { background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 1px solid #fecaca; border-radius: 16px; padding: 28px; margin: 40px 0; text-align: center; }
.bp-cta-box h3 { margin: 0 0 8px; color: #0f172a; font-size: 1.2rem; }
.bp-cta-box p { margin: 0 0 18px; color: #475569; }
.bp-cta-btn { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg,#ef4444,#dc2626); color: white; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 0.95rem; box-shadow: 0 6px 18px rgba(239,68,68,0.25); }
.bp-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(239,68,68,0.3); color: white; }
.bp-related { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 30px; }
.bp-related h3 { font-size: 1rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 14px; }
.bp-related-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.bp-related-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; text-decoration: none; transition: all 0.2s; }
.bp-related-card:hover { border-color: #ef4444; transform: translateY(-2px); }
.bp-related-card h4 { font-size: 0.95rem; color: #0f172a; margin: 0 0 6px; line-height: 1.3; }
.bp-related-card p { font-size: 0.82rem; color: #64748b; margin: 0; line-height: 1.4; }
.bp-footer { text-align: center; padding: 30px 24px; background: #0f172a; color: #64748b; font-size: 0.85rem; }
`;
