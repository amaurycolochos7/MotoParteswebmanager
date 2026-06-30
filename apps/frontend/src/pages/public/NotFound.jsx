import { Link } from 'react-router-dom';
import { Home, Compass } from 'lucide-react';

/**
 * Página 404 con el lenguaje visual MotoPartes (fondo fog, tarjeta blanca,
 * acento rojo de marca, tipografía de sistema). Sin gradientes ni look de IA.
 */
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-canvas)',
        padding: 'var(--space-24)',
      }}
    >
      <div
        style={{
          background: 'var(--surface-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-card)',
          padding: 'var(--space-48) var(--space-32)',
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
        }}
      >
        <img
          src="/logo-motopartes.png"
          alt="MotoPartes"
          style={{ height: 56, width: 'auto', margin: '0 auto var(--space-24)' }}
        />
        <div
          style={{
            fontSize: 'clamp(56px, 14vw, 88px)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            color: 'var(--primary)',
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            margin: '12px 0 8px',
          }}
        >
          Página no encontrada
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16, margin: '0 0 28px' }}>
          La ruta que buscas no existe o fue movida. Volvamos a un lugar conocido.
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-12)', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn btn-primary">
            <Home size={18} /> Ir al inicio
          </Link>
          <Link to="/mechanic" className="btn btn-secondary">
            <Compass size={18} /> Mi panel
          </Link>
        </div>
      </div>
    </div>
  );
}
