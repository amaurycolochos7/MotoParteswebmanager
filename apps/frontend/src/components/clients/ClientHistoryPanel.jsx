import { useState, useEffect, useCallback } from 'react';
import { Loader2, ChevronDown, ChevronUp, Bike, FileText, ClipboardList, AlertCircle } from 'lucide-react';
import { clientsService } from '../../lib/api';

// ELIHU 5.2: historial del cliente ANTES de crear cotización/orden.
// Mobile-first, acordeón. Muestra motos, saldo pendiente, última visita,
// órdenes y cotizaciones previas con su estado.

const fmt = (n) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n) || 0);
const dateShort = (d) => (d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function ClientHistoryPanel({ clientId, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        if (!clientId) return;
        setLoading(true);
        const { data: h, error } = await clientsService.getHistory(clientId);
        if (!error) setData(h);
        setLoaded(true);
        setLoading(false);
    }, [clientId]);

    useEffect(() => {
        setLoaded(false); setData(null);
        if (open && clientId) load();
    }, [clientId, open, load]);

    const card = { border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', margin: '10px 0', overflow: 'hidden' };
    const headBtn = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: '#f9fafb', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#111827', fontSize: 14 };

    return (
        <div style={card}>
            <button type="button" style={headBtn} onClick={() => setOpen((o) => !o)}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} /> Historial del cliente</span>
                {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {open && (
                <div style={{ padding: 14 }}>
                    {loading || !loaded ? (
                        <div style={{ textAlign: 'center', color: '#6b7280', padding: 8 }}><Loader2 size={18} className="spinner" /></div>
                    ) : !data ? (
                        <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>No se pudo cargar el historial.</p>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                <Stat label="Última visita" value={dateShort(data.last_visit_at)} />
                                <Stat label="Órdenes" value={data.orders_count} />
                                <Stat label="Cotizaciones" value={data.quotations_count} />
                                <Stat label="Saldo pendiente" value={fmt(data.pending_balance)} danger={data.pending_balance > 0} />
                            </div>

                            {data.pending_balance > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef2f2', color: '#b91c1c', padding: '8px 10px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                                    <AlertCircle size={15} /> Este cliente tiene saldo pendiente de {fmt(data.pending_balance)}.
                                </div>
                            )}

                            <SubHead icon={<Bike size={14} />} label={`Motos (${data.motorcycles?.length || 0})`} />
                            {(data.motorcycles || []).length === 0 ? <Empty /> : (
                                <ul style={listStyle}>
                                    {data.motorcycles.map((m) => (
                                        <li key={m.id} style={liStyle}>{m.brand} {m.model}{m.plates ? ` · ${m.plates}` : ''}{m.year ? ` · ${m.year}` : ''}</li>
                                    ))}
                                </ul>
                            )}

                            <SubHead icon={<ClipboardList size={14} />} label={`Órdenes (${data.orders?.length || 0})`} />
                            {(data.orders || []).length === 0 ? <Empty /> : (
                                <ul style={listStyle}>
                                    {data.orders.slice(0, 8).map((o) => (
                                        <li key={o.id} style={liRow}>
                                            <span>{o.order_number} · {dateShort(o.created_at)}</span>
                                            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <span style={chip}>{o.status || '—'}</span>
                                                <span>{fmt(o.total_amount)}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <SubHead icon={<FileText size={14} />} label={`Cotizaciones (${data.quotations?.length || 0})`} />
                            {(data.quotations || []).length === 0 ? <Empty /> : (
                                <ul style={listStyle}>
                                    {data.quotations.slice(0, 8).map((q) => (
                                        <li key={q.id} style={liRow}>
                                            <span>{q.quotation_number} · {dateShort(q.created_at)}</span>
                                            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <span style={chip}>{q.status}</span>
                                                <span>{fmt(q.total_amount)}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, danger }) {
    return (
        <div style={{ flex: '1 1 calc(50% - 4px)', background: '#f9fafb', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: danger ? '#b91c1c' : '#111827' }}>{value}</div>
        </div>
    );
}
const SubHead = ({ icon, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#374151', margin: '10px 0 4px' }}>{icon} {label}</div>
);
const Empty = () => <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 4px' }}>—</p>;
const listStyle = { listStyle: 'none', padding: 0, margin: 0 };
const liStyle = { fontSize: 13, color: '#374151', padding: '4px 0', borderBottom: '1px solid #f3f4f6' };
const liRow = { ...liStyle, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' };
const chip = { fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#eef2ff', color: '#3730a3', fontWeight: 600 };
