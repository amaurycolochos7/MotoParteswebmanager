import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { ticketsService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import './AdminV3.css';

const CATEGORIES = [
    { value: 'technical', label: 'Problema técnico' },
    { value: 'whatsapp', label: 'WhatsApp / bot' },
    { value: 'billing', label: 'Facturación o pago' },
    { value: 'feature_request', label: 'Sugerencia de mejora' },
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
        <div className="adm" style={{ maxWidth: 720 }}>
            <Link to="/admin/support" className="adm-back"><ArrowLeft size={15} /> Volver</Link>
            <header className="adm-head"><div><h1>Nuevo ticket de soporte</h1></div></header>

            <form onSubmit={submit} className="adm-form">
                <div className="adm-field">
                    <label htmlFor="sp-cat">Categoría</label>
                    <select id="sp-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                        {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                </div>
                <div className="adm-field">
                    <label htmlFor="sp-sub">Asunto</label>
                    <input id="sp-sub" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Breve descripción del problema" maxLength={200} required />
                </div>
                <div className="adm-field">
                    <label htmlFor="sp-pri">Prioridad</label>
                    <select id="sp-pri" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                        <option value="low">Baja: no urgente</option>
                        <option value="normal">Normal</option>
                        <option value="high">Alta: afecta la operación</option>
                    </select>
                </div>
                <div className="adm-field">
                    <label htmlFor="sp-body">Descripción</label>
                    <textarea id="sp-body" value={form.body_md} onChange={(e) => setForm({ ...form, body_md: e.target.value })} rows={8} placeholder="Cuéntanos con detalle. Si es un error, incluye pasos para reproducirlo y capturas si tienes." required />
                </div>

                <button type="submit" disabled={busy} className="k-btn k-btn--block">
                    {busy ? <Loader2 size={16} className="adm-spin" /> : <Send size={16} />} Enviar ticket
                </button>
                <p className="adm-hint" style={{ marginTop: 14, textAlign: 'center' }}>
                    Respondemos en menos de 24 h hábiles. Urgencias reales por WhatsApp directo.
                </p>
            </form>
        </div>
    );
}
