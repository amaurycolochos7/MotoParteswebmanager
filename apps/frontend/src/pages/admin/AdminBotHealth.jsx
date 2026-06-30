import { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { Activity, RefreshCw, Wifi, WifiOff, AlertTriangle } from 'lucide-react';

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

    if (loading) return <div style={{ padding: 24 }}>Consultando bot…</div>;

    return (
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 20, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
                        <Activity size={22} style={{ verticalAlign: '-4px' }} /> Salud del bot WhatsApp
                    </h1>
                    <p style={{ color: '#6e6e73', margin: '4px 0 0' }}>
                        Sesiones conectadas, memoria y últimos errores del bot.
                    </p>
                </div>
                <button className="btn-ghost" onClick={refresh}><RefreshCw size={14} /> Refrescar</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
                <Stat label="Estado" value={health?.status === 'ok' ? 'OK' : 'Error'} color={health?.status === 'ok' ? '#16a34a' : '#dc2626'} />
                <Stat label="Sesiones activas" value={`${health?.activeSessions ?? '-'} / ${health?.totalSessions ?? '-'}`} />
                <Stat label="Memoria RSS" value={debug?.memoryMB ? `${debug.memoryMB} MB` : '—'} color={debug?.memoryMB > 1200 ? '#dc2626' : '#16a34a'} />
                <Stat label="Uptime" value={debug?.uptime ? formatUptime(debug.uptime) : '—'} />
            </div>

            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 12px' }}>Sesiones</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sessions.map((s) => (
                    <div key={s.mechanicId || s.id} style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: 14,
                        background: 'white', border: '1px solid', borderColor: s.isConnected ? '#86efac' : '#e8e8ed',
                        borderLeft: s.isConnected ? '4px solid #16a34a' : '4px solid #d2d2d7',
                        borderRadius: 10,
                    }}>
                        <div>
                            {s.isConnected ? <Wifi size={22} color="#16a34a" /> : <WifiOff size={22} color="#86868b" />}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6e6e73' }}>mecánico: {s.mechanicId?.slice(0, 13)}…</div>
                            <div style={{ fontWeight: 600, color: s.isConnected ? '#15803d' : '#474747' }}>
                                {s.isConnected ? `Conectado (${s.phoneNumber || 'sin número'})` : (s.initializing ? 'Inicializando…' : 'Desconectado')}
                            </div>
                            {s.lastError && (
                                <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: 4 }}>
                                    <AlertTriangle size={11} /> {s.lastError}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {sessions.length === 0 && (
                    <div style={{ padding: 32, textAlign: 'center', color: '#6e6e73', background: '#f5f5f7', borderRadius: 10 }}>
                        No hay sesiones. Ve a <code>/mechanic/whatsapp</code> para conectar.
                    </div>
                )}
            </div>

            {debug?.logs && debug.logs.length > 0 && (
                <>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '24px 0 10px' }}>Últimos 20 logs</h2>
                    <div style={{ background: '#1d1d1f', color: '#d2d2d7', borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: '0.75rem', maxHeight: 300, overflow: 'auto' }}>
                        {debug.logs.slice(-20).map((l, i) => (
                            <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: l.l === 'ERR' ? '#fca5a5' : l.l === 'WRN' ? '#fde68a' : '#d2d2d7' }}>
                                [{new Date(l.t).toLocaleTimeString('es-MX')}] {l.m}
                            </div>
                        ))}
                    </div>
                </>
            )}

            <style>{`
                .btn-ghost { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; border: 1px solid #e8e8ed; background: white; color: #1d1d1f; cursor: pointer; }
                .btn-ghost:hover { background: #f5f5f7; }
            `}</style>
        </div>
    );
}

function Stat({ label, value, color = '#1d1d1f' }) {
    return (
        <div style={{ padding: 14, background: 'white', border: '1px solid #e8e8ed', borderRadius: 10 }}>
            <div style={{ fontSize: '0.78rem', color: '#6e6e73', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>{label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color, marginTop: 4 }}>{value}</div>
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
