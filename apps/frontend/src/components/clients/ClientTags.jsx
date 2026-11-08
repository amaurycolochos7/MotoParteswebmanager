import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import './ClientTags.css';

/** Etiquetas de una tarjeta de cliente: "Cita web por confirmar" y mecánico preferido. */
export function ClientTags({ client }) {
    if (!client?.web_unconfirmed && !client?.preferred_mechanic?.full_name) return null;
    return (
        <div className="ct-tags">
            {client.web_unconfirmed && <span className="ct-tag ct-tag--web">Cita web por confirmar</span>}
            {client.preferred_mechanic?.full_name && (
                <span className="ct-tag ct-tag--mech">Prefiere a {client.preferred_mechanic.full_name}</span>
            )}
        </div>
    );
}

/** Filtro rápido: todos / por confirmar, más acceso a "Buscar cliente". */
export function ClientQuickFilter({ onlyWeb, onChange, webCount, lookupPath }) {
    return (
        <div className="ct-filter">
            <button type="button" className={!onlyWeb ? 'on' : ''} onClick={() => onChange(false)}>Todos</button>
            <button type="button" className={onlyWeb ? 'on' : ''} onClick={() => onChange(true)}>
                Por confirmar{webCount > 0 ? ` (${webCount})` : ''}
            </button>
            <Link to={lookupPath} className="ct-lookup"><Search size={14} /> Buscar por teléfono</Link>
        </div>
    );
}
