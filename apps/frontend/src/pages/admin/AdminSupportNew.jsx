import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { ticketsService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const CATEGORIES = [
    { value: 'technical', label: 'Problema técnico' },
    { value: 'whatsapp', label: 'WhatsApp / bot' },
    { value: 'billing', label: 'Facturación o pago' },
    { value: 'feature_request', label: 'Sugerencia de feature' },
    { value: 'account', label: 'Cuenta / acceso' },
    { value: 'onboarding', label: 'Ayuda para empezar' },
    { value: 'other', label: 'Otro' },
];

export default function AdminSupportNew() {
    const navigate = useNavigate();
    const toast = useToast();
    const [form, setForm] = useState({ subject: '', category: 'technical', priority: 'normal', body_md: '' });
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        if (!form.subject.trim() || !form.body_md.trim()) return toast.error('Completa asunto y descripción.');
        setBusy(true);
        try {
            const res = await ticketsService.create(form);
            toast.success(`Ticket #${res.ticket.ticket_number} creado. Te respondemos pronto.`);
            navigate(`/admin/support/${res.ticket.id}`);
        } catch (e) { toast.error(e.message); }
        finally { setBusy(false); }
    };

    return (
        <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
            <Link to="/admin/support" style={{ color: '#64748b', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
                <ArrowLeft size={14} /> Volver
            </Link>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 24px' }}>Nuevo ticket de soporte</h1>

            <form onSubmit={submit} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24 }}>
                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: 6 }}>Categoría</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={{ width: '100%', padding: 10, border: '1.5px solid #cbd5e1', borderRadius: 10 }}>
                        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: 6 }}>Asunto</label>
                    <input
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                        placeholder="Breve descripción del problema"
                        style={{ width: '100%', padding: 10, border: '1.5px solid #cbd5e1', borderRadius: 10 }}
                        maxLength={200}
                        required
                    />
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: 6 }}>Prioridad</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={{ width: '100%', padding: 10, border: '1.5px solid #cbd5e1', borderRadius: 10 }}>
                        <option value="low">Baja — no urgente</option>
                        <option value="normal">Normal</option>
                        <option value="high">Alta — afecta operación</option>
                    </select>
                </div>

                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: 6 }}>Descripción</label>
                    <textarea
                        value={form.body_md}
                        onChange={(e) => setForm({ ...form, body_md: e.target.value })}
                        rows={8}
                        placeholder="Cuéntanos con detalle. Si es un error, incluye pasos para reproducirlo y capturas si tienes."
                        style={{ width: '100%', padding: 12, border: '1.5px solid #cbd5e1', borderRadius: 10, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.95rem' }}
                        required
                    />
                </div>

                <button type="submit" disabled={busy} style={{
                    width: '100%', padding: 14, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white',
                    border: 'none', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                    {busy ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Enviar ticket
                </button>

                <p style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 14, textAlign: 'center' }}>
                    Respondemos en menos de 24h hábiles. Urgencias reales por WhatsApp directo.
                </p>
            </form>
            <style>{`.spin { animation: spin 0.9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
