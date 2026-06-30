import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Clock, ChevronRight, Bike, Trash2 } from 'lucide-react';
import { quotationsService } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { PageHeader, Button, StatusChip, EmptyState, IconButton } from '../../components/ui';

const STATUS_LABELS = {
    pending: 'Pendiente', pendiente: 'Pendiente',
    accepted: 'Aceptada', aceptada: 'Aceptada',
    rejected: 'Rechazada', rechazada: 'Rechazada',
    expired: 'Expirada', expirada: 'Expirada',
    converted: 'Convertida', convertida: 'Convertida',
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
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount || 0);
}
function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diffMs = new Date() - new Date(dateStr);
    const diffH = Math.floor(diffMs / 3600000);
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

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        const { data, error } = await quotationsService.getAll();
        if (error) toast.error('No se pudieron cargar las cotizaciones');
        else setQuotations(Array.isArray(data) ? data : []);
        setLoading(false);
    };

    const handleDelete = async (id, displayNumber, e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!window.confirm(`¿Eliminar la cotización ${displayNumber}? Esta acción no se puede deshacer.`)) return;
        const { error } = await quotationsService.remove(id);
        if (error) {
            toast.error(error?.body?.error || error?.message || 'No se pudo eliminar la cotización');
            return;
        }
        toast.success('Cotización eliminada');
        setQuotations(prev => prev.filter(q => q.id !== id));
    };

    const filtered = useMemo(() => {
        if (filter === 'all') return quotations;
        return quotations.filter(q => {
            const s = (q.status || '').toLowerCase();
            if (filter === 'pending') return s === 'pending' || s === 'pendiente';
            if (filter === 'accepted') return s === 'accepted' || s === 'aceptada';
            if (filter === 'rejected') return s === 'rejected' || s === 'rechazada';
            if (filter === 'expired') return s === 'expired' || s === 'expirada';
            if (filter === 'converted') return s === 'converted' || s === 'convertida';
            return true;
        });
    }, [quotations, filter]);

    return (
        <div className="qlist">
            <PageHeader
                title="Cotizaciones"
                subtitle="Presupuestos antes de abrir orden"
                actions={<Button onClick={() => navigate('/mechanic/quotations/new')} leftIcon={<Plus size={18} />}>Nueva</Button>}
            />

            <div className="qlist__filters" role="tablist">
                {FILTER_CHIPS.map(c => (
                    <button
                        key={c.value}
                        role="tab"
                        aria-selected={filter === c.value}
                        className={`qlist__chip${filter === c.value ? ' is-active' : ''}`}
                        onClick={() => setFilter(c.value)}
                    >
                        {c.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="qlist__items">
                    {[1, 2, 3].map(i => <div key={i} className="qlist__skel" />)}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={<FileText size={26} />}
                    title={`Sin cotizaciones${filter !== 'all' ? ' en este estado' : ''}`}
                    message="Crea una cotización para presentar un presupuesto antes de abrir orden."
                    action={<Button onClick={() => navigate('/mechanic/quotations/new')} leftIcon={<Plus size={16} />} size="sm">Nueva cotización</Button>}
                />
            ) : (
                <div className="qlist__items">
                    {filtered.map(q => {
                        const statusKey = (q.status || 'pending').toLowerCase();
                        const label = STATUS_LABELS[statusKey] || 'Pendiente';
                        const total = calcTotal(q);
                        const client = q.client || {};
                        const moto = q.motorcycle || {};
                        const displayNumber = q.quotation_number || `#${String(q.id).slice(0, 8)}`;
                        return (
                            <div key={q.id} className="qlist__card" role="button" tabIndex={0}
                                onClick={() => navigate(`/mechanic/quotations/${q.id}`)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/mechanic/quotations/${q.id}`); } }}
                            >
                                <div className="qlist__card-top">
                                    <span className="qlist__num">{displayNumber}</span>
                                    <StatusChip status={label} />
                                </div>
                                <div className="qlist__client">{client.full_name || 'Cliente sin nombre'}</div>
                                {moto.brand && (
                                    <div className="qlist__moto"><Bike size={12} /> {moto.brand} {moto.model}{moto.plates ? ` · ${moto.plates}` : ''}</div>
                                )}
                                <div className="qlist__foot">
                                    <span className="qlist__time"><Clock size={12} /> {timeAgo(q.created_at)}</span>
                                    <span className="qlist__total">{formatMXN(total)}</span>
                                    <ChevronRight size={16} className="qlist__chev" />
                                </div>
                                <div className="qlist__del">
                                    <IconButton size="sm" aria-label={`Eliminar ${displayNumber}`} onClick={(e) => handleDelete(q.id, displayNumber, e)}>
                                        <Trash2 size={15} />
                                    </IconButton>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                .qlist { padding: 20px 16px 40px; max-width: 720px; margin: 0 auto; }
                .qlist__filters { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 18px; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
                .qlist__filters::-webkit-scrollbar { display: none; }
                .qlist__chip { flex-shrink: 0; padding: 8px 16px; min-height: 38px; border-radius: var(--radius-pill); border: 1px solid var(--border-color); background: var(--surface-card); color: var(--text-secondary); font-family: var(--font-text); font-size: 14px; font-weight: 500; cursor: pointer; transition: all var(--transition-fast); }
                .qlist__chip:hover { border-color: #d2d2d7; }
                .qlist__chip.is-active { background: var(--color-ink); color: #fff; border-color: var(--color-ink); }
                .qlist__items { display: flex; flex-direction: column; gap: 10px; }
                .qlist__skel { height: 108px; border-radius: var(--radius-card); background: var(--surface-recessed); animation: mp-skel 1.4s infinite; }
                @keyframes mp-skel { 0%,100%{opacity:1;} 50%{opacity:0.55;} }
                .qlist__card { position: relative; padding: 16px 18px; background: var(--surface-card); border: 1px solid var(--border-color); border-radius: var(--radius-card); cursor: pointer; transition: border-color var(--transition-fast), transform var(--transition-fast); }
                .qlist__card:hover { border-color: #d2d2d7; transform: translateY(-1px); }
                .qlist__card-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding-right: 40px; }
                .qlist__num { font-size: 13px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.01em; }
                .qlist__client { font-size: 16px; font-weight: 600; color: var(--color-ink); letter-spacing: -0.01em; }
                .qlist__moto { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--text-secondary); margin-top: 3px; }
                .qlist__foot { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light); }
                .qlist__time { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-muted); }
                .qlist__total { margin-left: auto; font-size: 17px; font-weight: 700; color: var(--color-ink); letter-spacing: -0.02em; }
                .qlist__chev { color: var(--text-muted); }
                .qlist__del { position: absolute; top: 12px; right: 12px; }
            `}</style>
        </div>
    );
}
