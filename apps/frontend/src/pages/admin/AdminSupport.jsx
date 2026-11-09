import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, Plus, Clock, Loader2 } from 'lucide-react';
import { ticketsService } from '../../lib/api';
import './AdminV3.css';

function fmtDate(d) {
    const delta = Date.now() - new Date(d).getTime();
    if (delta < 60000) return 'ahora';
    if (delta < 3600000) return `hace ${Math.floor(delta / 60000)} min`;
    if (delta < 86400000) return `hace ${Math.floor(delta / 3600000)} h`;
    return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function statusLabel(s) {
    return {
        open: 'Abierto',
        waiting_admin: 'Esperando soporte',
        waiting_customer: 'Esperando tu respuesta',
        resolved: 'Resuelto',
        closed: 'Cerrado',
    }[s] || s;
}

function statusTone(s) {
    return {
        open: 'brand',
        waiting_admin: 'warn',
        waiting_customer: 'info',
        resolved: 'ok',
        closed: '',
    }[s] || '';
}

export default function AdminSupport() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        ticketsService.list()
            .then((r) => setItems(r.items || []))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="adm" style={{ maxWidth: 1000 }}>
            <header className="adm-head">
                <div>
                    <h1><LifeBuoy size={22} /> Soporte</h1>
                    <p>Abre un ticket y te respondemos personalmente.</p>
                </div>
                <Link to="/admin/support/new" className="k-btn">
                    <Plus size={16} /> Nuevo ticket
                </Link>
            </header>

            {loading ? (
                <div className="adm-loading"><Loader2 className="adm-spin" size={26} /></div>
            ) : items.length === 0 ? (
                <div className="adm-empty">
                    <LifeBuoy size={28} />
                    <h3>Todavía no tienes tickets</h3>
                    <p>Crea uno cuando necesites ayuda.</p>
                </div>
            ) : (
                <div className="adm-tickets">
                    {items.map((t) => (
                        <Link key={t.id} to={`/admin/support/${t.id}`} className="adm-ticket">
                            <div className="adm-ticket__main">
                                <div className="adm-ticket__top">
                                    <span>#{t.ticket_number}</span>
                                    <span className={`adm-badge${statusTone(t.status) ? ` adm-badge--${statusTone(t.status)}` : ''}`}>{statusLabel(t.status)}</span>
                                    {t.customer_unread > 0 && <span className="adm-badge adm-badge--brand">Nuevo</span>}
                                </div>
                                <div className="adm-ticket__subject">{t.subject}</div>
                                <div className="adm-ticket__cat">{t.category}</div>
                            </div>
                            <div className="adm-ticket__when"><Clock size={13} /> {fmtDate(t.last_message_at)}</div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
