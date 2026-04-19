import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function SuperLogin() {
    const navigate = useNavigate();
    const { login, user } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (user?.is_super_admin) navigate('/super');
    }, [user, navigate]);

    const submit = async (e) => {
        e.preventDefault();
        setErr('');
        setBusy(true);
        try {
            const u = await login(email, password);
            if (u?.is_super_admin) navigate('/super');
            else setErr('Esta cuenta no es super-admin. Ingresa con el panel normal.');
        } catch (ex) { setErr(ex.message || 'Credenciales incorrectas.'); }
        finally { setBusy(false); }
    };

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                <div style={styles.logo}>
                    <ShieldCheck size={28} />
                </div>
                <h1 style={styles.title}>Super Admin</h1>
                <p style={styles.subtitle}>Panel operativo de MotoPartes</p>

                {err && (
                    <div style={styles.err}>
                        <AlertCircle size={16} style={{ marginRight: 6 }} /> {err}
                    </div>
                )}

                <form onSubmit={submit}>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        autoComplete="email"
                        required
                        style={styles.input}
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contraseña"
                        autoComplete="current-password"
                        required
                        style={{ ...styles.input, marginTop: 10 }}
                    />
                    <button disabled={busy} style={styles.btn}>
                        {busy ? <Loader2 size={16} className="spin" /> : 'Entrar'}
                    </button>
                </form>

                <p style={styles.note}>Acceso restringido. Si no eres super-admin usa el <a href="/login">login normal</a>.</p>
            </div>
            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

const styles = {
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0f1a', padding: 20 },
    card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 20, padding: 40, maxWidth: 420, width: '100%', color: '#e5e7eb' },
    logo: { width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(135deg,#ef4444,#dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'white' },
    title: { fontSize: '1.5rem', fontWeight: 800, textAlign: 'center', margin: '0 0 4px' },
    subtitle: { color: '#64748b', fontSize: '0.88rem', textAlign: 'center', margin: '0 0 24px' },
    err: { background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', padding: 12, borderRadius: 10, fontSize: '0.86rem', marginBottom: 14, display: 'flex', alignItems: 'center' },
    input: { width: '100%', background: '#0b0f1a', color: '#e5e7eb', border: '1px solid #334155', borderRadius: 10, padding: '12px 14px', fontSize: '0.92rem' },
    btn: { width: '100%', marginTop: 14, padding: 14, borderRadius: 10, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    note: { color: '#64748b', fontSize: '0.78rem', textAlign: 'center', marginTop: 20 },
};
