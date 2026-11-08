import { useState } from 'react';
import { Globe, AlertCircle, Phone, Check } from 'lucide-react';
import { authService } from '../../lib/api';
import './OnlineBookingCard.css';

const ROLE_LABEL = { owner: 'Dueño', admin: 'Administrador', mechanic: 'Mecánico', auxiliary: 'Auxiliar' };
const digits = (s) => String(s || '').replace(/\D/g, '');

/**
 * "Quién atiende en las citas en línea": una fila por persona del taller con un interruptor
 * para aparecer (o no) en la lista de la página de citas, y aviso si no tiene teléfono
 * (sin teléfono no le llegan los avisos de WhatsApp).
 */
export default function OnlineBookingCard({ users, onPatched }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    const [phones, setPhones] = useState({});

    const members = (users || []).filter((u) => u.is_active !== false);
    const visibleCount = members.filter((u) => u.online_booking_visible !== false).length;

    const toggle = async (u) => {
        const next = u.online_booking_visible === false;
        setBusy(u.id); setError('');
        onPatched(u.id, { online_booking_visible: next }); // optimista
        const { error: err } = await authService.setOnlineBooking(u.id, next);
        if (err) {
            onPatched(u.id, { online_booking_visible: !next });
            setError(err.message || 'No se pudo guardar el cambio.');
        }
        setBusy(null);
    };

    const savePhone = async (u) => {
        const phone = digits(phones[u.id]);
        if (phone.length !== 10) { setError('El teléfono debe tener 10 dígitos.'); return; }
        setBusy(u.id); setError('');
        const { error: err } = await authService.updateUser(u.id, { phone });
        if (err) setError(err.message || 'No se pudo guardar el teléfono.');
        else onPatched(u.id, { phone });
        setBusy(null);
    };

    if (members.length === 0) return null;

    return (
        <section className="ob-card">
            <div className="ob-head">
                <Globe size={20} />
                <div>
                    <h2>Quién atiende en las citas en línea</h2>
                    <p>
                        Estas personas aparecen en la página de citas para que el cliente elija quién lo atiende.
                        {visibleCount === 0 && ' Ahora no aparece nadie: el cliente no podrá agendar.'}
                    </p>
                </div>
            </div>
            {error && <div className="ob-error" role="alert">{error}</div>}
            <ul className="ob-list">
                {members.map((u) => {
                    const on = u.online_booking_visible !== false;
                    const hasPhone = digits(u.phone).length >= 10;
                    return (
                        <li key={u.id} className="ob-row">
                            <div className="ob-who">
                                <strong>{u.full_name}</strong>
                                <small>{ROLE_LABEL[u.workspace_role] || u.workspace_role || ''}</small>
                                {on && !hasPhone && (
                                    <span className="ob-warn"><AlertCircle size={13} /> Sin teléfono guardado: no le llegarán los avisos de citas.</span>
                                )}
                                {on && !hasPhone && (
                                    <span className="ob-phone">
                                        <Phone size={14} />
                                        <input
                                            type="tel" inputMode="numeric" maxLength={14} placeholder="10 dígitos"
                                            value={phones[u.id] || ''}
                                            onChange={(e) => setPhones((p) => ({ ...p, [u.id]: e.target.value }))}
                                            aria-label={`Teléfono de ${u.full_name}`}
                                        />
                                        <button type="button" disabled={busy === u.id} onClick={() => savePhone(u)}><Check size={14} /> Guardar</button>
                                    </span>
                                )}
                            </div>
                            <label className="ob-switch">
                                <input type="checkbox" checked={on} disabled={busy === u.id} onChange={() => toggle(u)} aria-label={`Aparecer en citas en línea: ${u.full_name}`} />
                                <span className="ob-slider" />
                                <span className="ob-switch-text">{on ? 'Aparece' : 'Oculto'}</span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
