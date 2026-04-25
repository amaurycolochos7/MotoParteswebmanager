import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Clock, ChevronRight, Bike } from 'lucide-react';
import { quotationsService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

const STATUS_LABELS = {
    pending: { label: 'Pendiente', bg: '#FEF9C3', color: '#A16207', border: '#FDE68A' },
    pendiente: { label: 'Pendiente', bg: '#FEF9C3', color: '#A16207', border: '#FDE68A' },
    accepted: { label: 'Aceptada', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
    aceptada: { label: 'Aceptada', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' },
    rejected: { label: 'Rechazada', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
    rechazada: { label: 'Rechazada', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' },
    expired: { label: 'Expirada', bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
    expirada: { label: 'Expirada', bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
    converted: { label: 'Convertida', bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
    convertida: { label: 'Convertida', bg: '#DBEAFE', color: '#1D4ED8', border: '#BFDBFE' },
};

const FILTER_CHIPS = [
    { value: 'all', label: 'Todas' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'accepted', label: 'Aceptadas' },
    { value: 'rejected', label: 'Rechazadas' },
    { value: 'expired', label: 'Expiradas' },
    { value: 'converted', label: 'Convertidas' },
];

function formatMXN(amount) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount || 0);
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const created = new Date(dateStr);
    const now = new Date();
    const diffMs = now - created;
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    const diffD = Math.floor(diffH / 24);
    if (diffD > 0) return `${diffD}d`;
    if (diffH > 0) return `${diffH}h`;
    return 'Ahora';
}

function calcTotal(q) {
    if (q.total_amount != null) return parseFloat(q.total_amount) || 0;
    const labor = (q.labor || []).reduce((s, l) => s + (parseFloat(l.price) || 0), 0);
    const parts = (q.parts || []).reduce((s, p) => s + ((parseFloat(p.price) || 0) * (parseInt(p.quantity) || 1)), 0);
    return labor + parts;
}

export default function Quotations() {
    const navigate = useNavigate();
    const toast = useToast();
    const [quotations, setQuotations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        setLoading(true);
        const { data, error } = await quotationsService.getAll();
        if (error) {
            toast.error('No se pudieron cargar las cotizaciones');
        } else {
            setQuotations(Array.isArray(data) ? data : []);
        }
        setLoading(false);
    };

    const filtered = useMemo(() => {
        if (filter === 'all') return quotations;
        return quotations.filter(q => {
            const s = (q.status || '').toLowerCase();
            // accept both spanish and english forms
            if (filter === 'pending') return s === 'pending' || s === 'pendiente';
            if (filter === 'accepted') return s === 'accepted' || s === 'aceptada';
            if (filter === 'rejected') return s === 'rejected' || s === 'rechazada';
            if (filter === 'expired') return s === 'expired' || s === 'expirada';
            if (filter === 'converted') return s === 'converted' || s === 'convertida';
            return true;
        });
    }, [quotations, filter]);

    return (
        <div className="quotations-page">
            <div className="qp-header">
                <h1 className="qp-title">
                    <FileText size={22} /> Cotizaciones
                </h1>
                <Link to="/mechanic/quotations/new" className="qp-new-btn">
                    <Plus size={18} /> Nueva cotización
                </Link>
            </div>

            <div className="qp-filters">
                {FILTER_CHIPS.map(c => (
                    <button
                        key={c.value}
                        className={`qp-chip ${filter === c.value ? 'active' : ''}`}
                        onClick={() => setFilter(c.value)}
                    >
                        {c.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="qp-loading">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="qp-skeleton" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="qp-empty">
                    <FileText size={48} className="qp-empty-icon" />
                    <h3>Sin cotizaciones {filter !== 'all' ? 'en este estado' : ''}</h3>
                    <p>Crea una cotización para presentar un presupuesto antes de abrir orden.</p>
                    <Link to="/mechanic/quotations/new" className="qp-empty-btn">
                        <Plus size={16} /> Nueva cotización
                    </Link>
                </div>
            ) : (
                <div className="qp-list">
                    {filtered.map(q => {
                        const statusKey = (q.status || 'pending').toLowerCase();
                        const chip = STATUS_LABELS[statusKey] || STATUS_LABELS.pending;
                        const total = calcTotal(q);
                        const client = q.client || {};
                        const moto = q.motorcycle || {};
                        return (
                            <button
                                key={q.id}
                                className="qp-card"
                                onClick={() => navigate(`/mechanic/quotations/${q.id}`)}
                            >
                                <div className="qp-card-head">
                                    <span className="qp-card-num">
                                        {q.quotation_number || `#${String(q.id).slice(0, 8)}`}
                                    </span>
                                    <span
                                        className="qp-card-badge"
                                        style={{ background: chip.bg, color: chip.color, borderColor: chip.border }}
                                    >
                                        {chip.label}
                                    </span>
                                </div>
                                <div className="qp-card-client">
                                    {client.full_name || 'Cliente sin nombre'}
                                </div>
                                {moto.brand && (
                                    <div className="qp-card-moto">
                                        <Bike size={12} /> {moto.brand} {moto.model}
                                        {moto.plates && ` • ${moto.plates}`}
                                    </div>
                                )}
                                <div className="qp-card-foot">
                                    <span className="qp-card-time">
                                        <Clock size={12} /> {timeAgo(q.created_at)}
                                    </span>
                                    <span className="qp-card-total">{formatMXN(total)}</span>
                                    <ChevronRight size={16} className="qp-card-arrow" />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            <style>{`
                .quotations-page {
                    padding: 16px 18px 100px;
                }
                .qp-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 18px;
                    flex-wrap: wrap;
                }
                .qp-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 1.4rem;
                    font-weight: 800;
                    color: #0F172A;
                    margin: 0;
                }
                .qp-new-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: #111827;
                    color: white;
                    padding: 9px 14px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    text-decoration: none;
                    border: none;
                    cursor: pointer;
                }
                .qp-new-btn:hover { background: #000; }

                .qp-filters {
                    display: flex;
                    gap: 6px;
                    overflow-x: auto;
                    margin-bottom: 14px;
                    padding-bottom: 4px;
                }
                .qp-chip {
                    background: white;
                    border: 1px solid #E5E7EB;
                    color: #374151;
                    padding: 6px 12px;
                    border-radius: 999px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .qp-chip.active {
                    background: #111827;
                    color: white;
                    border-color: #111827;
                }

                .qp-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .qp-card {
                    display: block;
                    width: 100%;
                    text-align: left;
                    padding: 14px;
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 10px;
                    cursor: pointer;
                    font-family: inherit;
                    transition: border-color 0.12s;
                }
                .qp-card:hover { border-color: #D1D5DB; }
                .qp-card-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 6px;
                }
                .qp-card-num {
                    font-size: 13px;
                    font-weight: 700;
                    color: #0F172A;
                }
                .qp-card-badge {
                    padding: 3px 9px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 700;
                    border: 1px solid;
                }
                .qp-card-client {
                    font-size: 15px;
                    font-weight: 600;
                    color: #0F172A;
                }
                .qp-card-moto {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: #6B7280;
                    margin-top: 2px;
                }
                .qp-card-foot {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-top: 8px;
                }
                .qp-card-time {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    font-size: 11px;
                    color: #9CA3AF;
                }
                .qp-card-total {
                    margin-left: auto;
                    font-size: 14px;
                    font-weight: 800;
                    color: #0F172A;
                }
                .qp-card-arrow {
                    color: #D1D5DB;
                }

                .qp-empty {
                    background: white;
                    border: 1px dashed #E5E7EB;
                    border-radius: 10px;
                    padding: 40px 20px;
                    text-align: center;
                }
                .qp-empty-icon {
                    color: #D1D5DB;
                    margin-bottom: 8px;
                }
                .qp-empty h3 {
                    font-size: 16px;
                    font-weight: 700;
                    color: #0F172A;
                    margin: 6px 0 4px;
                }
                .qp-empty p {
                    font-size: 13px;
                    color: #6B7280;
                    margin: 0 0 12px;
                }
                .qp-empty-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 9px 16px;
                    background: #111827;
                    color: white;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    text-decoration: none;
                }

                .qp-loading {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .qp-skeleton {
                    height: 92px;
                    background: #F3F4F6;
                    border-radius: 10px;
                    animation: pulse 1.2s ease-in-out infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.55; }
                }
            `}</style>
        </div>
    );
}
