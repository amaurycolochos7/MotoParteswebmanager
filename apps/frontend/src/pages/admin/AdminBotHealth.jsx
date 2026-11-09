import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { Activity, RefreshCw, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import './AdminV3.css';

// The bot exposes its internal state at /api/whatsapp-bot/sessions.
// We reuse the same proxy path Traefik already forwards to the bot.

export default function AdminBotHealth() {
    const toast = useToast();
    const [sessions, setSessions] = useState([]);
    const [health, setHealth] = useState(null);
    const [debug, setDebug] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        try {
            const [sRes, hRes, dRes] = await Promise.all([
                fetch('/api/whatsapp-bot/sessions', { headers: authHeaders() }).then((r) => r.json()),
                fetch('/api/whatsapp-bot/health').then((r) => r.json()),
                fetch('/api/whatsapp-bot/debug').then((r) => r.json()).catch(() => null),
            ]);
            setSessions(Array.isArray(sRes) ? sRes : (sRes.sessions || []));
            setHealth(hRes);
            setDebug(dRes);
        } catch (err) {
            toast.error('No pudimos leer el estado del bot: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, 15000);
        return () => clearInterval(t);
    }, []);

    if (loading) return <div className="adm adm-loading">Consultando bot…</div>;

    return (
        <div className="adm">
            <header className="adm-head">
                <div>
                    <h1><Activity size={22} /> Salud del bot de WhatsApp</h1>
                    <p>Sesiones conectadas, memoria y últimos errores del bot.</p>
                </div>
                <button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={refresh}><RefreshCw size={15} /> Refrescar</button>
            </header>

            <div className="adm-stats">
                <Stat label="Estado" value={health?.status === 'ok' ? 'OK' : 'Error'} tone={health?.status === 'ok' ? 'ok' : 'bad'} />
                <Stat label="Sesiones activas" value={`${health?.activeSessions ?? '-'} / ${health?.totalSessions ?? '-'}`} />
                <Stat label="Memoria RSS" value={debug?.memoryMB ? `${debug.memoryMB} MB` : '—'} tone={debug?.memoryMB > 1200 ? 'bad' : 'ok'} />
                <Stat label="Tiempo activo" value={debug?.uptime ? formatUptime(debug.uptime) : '—'} />
            </div>

            <h2 className="adm-h2" style={{ marginTop: 0 }}>Sesiones</h2>
            <div className="adm-list">
                {sessions.map((s) => (
                    <div key={s.mechanicId || s.id} className={`adm-session${s.isConnected ? ' is-on' : ''}`}>
                        <span className="adm-session__ico">{s.isConnected ? <Wifi size={22} /> : <WifiOff size={22} />}</span>
                        <div className="adm-session__main">
                            <div className="adm-session__id">Sesión {s.mechanicId?.slice(0, 13)}…</div>
                            <div className="adm-session__state">
                                {s.isConnected ? `Conectado (${s.phoneNumber || 'sin número'})` : (s.initializing ? 'Inicializando…' : 'Desconectado')}
                            </div>
                            {s.lastError && <div className="adm-error"><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> {s.lastError}</div>}
                        </div>
                    </div>
                ))}
                {sessions.length === 0 && (
                    <div className="adm-empty">
                        <WifiOff size={26} />
                        <h3>No hay sesiones</h3>
                        <p>Conecta el número del taller en <Link to="/admin/whatsapp">WhatsApp del taller</Link>.</p>
                    </div>
                )}
            </div>

            {debug?.logs && debug.logs.length > 0 && (
                <>
                    <h2 className="adm-h2">Últimos 20 registros</h2>
                    <div className="adm-logs">
                        {debug.logs.slice(-20).map((l, i) => (
                            <div key={i} className={l.l === 'ERR' ? 'is-err' : l.l === 'WRN' ? 'is-wrn' : ''}>
                                [{new Date(l.t).toLocaleTimeString('es-MX')}] {l.m}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function Stat({ label, value, tone }) {
    return (
        <div className="adm-stat">
            <div className="adm-stat__label">{label}</div>
            <div className={`adm-stat__value${tone === 'ok' ? ' is-ok' : tone === 'bad' ? ' is-bad' : ''}`}>{value}</div>
        </div>
    );
}

function authHeaders() {
    const token = localStorage.getItem('motopartes_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatUptime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
