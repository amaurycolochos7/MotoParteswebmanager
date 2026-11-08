import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import {
    Search, Phone, MessageCircle, Edit2, Plus, Bike, User, X, Wrench, ClipboardList,
    Loader2, ChevronRight, ArrowLeft, UserCheck, Globe,
} from 'lucide-react';
import { clientsService, motorcyclesService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import './LookupClient.css';

const MX = 'America/Mexico_City';
const money = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: MX }) : '');
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
const waNumber = (raw) => { const d = onlyDigits(raw); return d.length === 10 ? `52${d}` : d; };
const motoLabel = (m) => [m.brand, m.model, m.year].filter(Boolean).join(' ');

const MIN_PHONE = 3;
const MIN_TEXT = 3;

export default function LookupClient() {
    const navigate = useNavigate();
    const location = useLocation();
    const [params] = useSearchParams();
    const { canEditClients, canCreateClients } = useAuth();
    const { users = [], updateClient, addMotorcycle, refreshClients } = useData();
    const area = location.pathname.startsWith('/admin') ? '/admin' : '/mechanic';

    const initialQ = params.get('q') || '';
    const [mode, setMode] = useState(initialQ && /\D/.test(initialQ.replace(/[\s()+-]/g, '')) ? 'text' : 'phone');
    const [query, setQuery] = useState(initialQ);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    const [selectedId, setSelectedId] = useState(null);
    const [selectedMotoId, setSelectedMotoId] = useState(null);
    const [history, setHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');

    const [editing, setEditing] = useState(null);       // { full_name, phone, notes } | null
    const [addingMoto, setAddingMoto] = useState(null); // { brand, model, year, plates, color } | null
    const [modalError, setModalError] = useState('');
    const [saving, setSaving] = useState(false);

    const reqId = useRef(0);
    const pendingMoto = useRef(null);

    const term = query.trim();
    const longEnough = mode === 'phone' ? onlyDigits(term).length >= MIN_PHONE : term.length >= MIN_TEXT;

    // Busqueda con retraso (debounce) y descarte de respuestas viejas.
    useEffect(() => {
        if (!longEnough) {
            reqId.current += 1;
            setResults([]); setSearched(false); setLoading(false); setError('');
            return undefined;
        }
        setLoading(true);
        const mine = ++reqId.current;
        const t = setTimeout(async () => {
            const { data, error: err } = await clientsService.lookup(mode === 'phone' ? onlyDigits(term) : term);
            if (mine !== reqId.current) return;
            setLoading(false);
            setSearched(true);
            if (err) { setError(err.message || 'No se pudo buscar. Revisa tu conexión.'); setResults([]); return; }
            setError('');
            setResults(Array.isArray(data) ? data : []);
        }, 300);
        return () => clearTimeout(t);
    }, [term, mode, longEnough, refreshKey]);

    // Si queda un solo resultado se abre solo; si el seleccionado ya no esta, se limpia.
    useEffect(() => {
        if (results.length === 1) {
            setSelectedId(results[0].id);
        } else if (selectedId && !results.some((c) => c.id === selectedId)) {
            setSelectedId(null);
        }
    }, [results, selectedId]);

    const selected = useMemo(() => results.find((c) => c.id === selectedId) || null, [results, selectedId]);

    // Con una sola moto (o la recien agregada) se abre su historial automaticamente.
    useEffect(() => {
        if (!selected) { setSelectedMotoId(null); return; }
        const want = pendingMoto.current;
        if (want && selected.motorcycles.some((m) => m.id === want)) {
            setSelectedMotoId(want); pendingMoto.current = null; return;
        }
        if (selected.motorcycles.length === 1) setSelectedMotoId(selected.motorcycles[0].id);
        else if (!selected.motorcycles.some((m) => m.id === selectedMotoId)) setSelectedMotoId(null);
    }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!selectedMotoId) { setHistory(null); setHistoryError(''); return undefined; }
        let alive = true;
        setHistoryLoading(true); setHistoryError('');
        motorcyclesService.history(selectedMotoId).then(({ data, error: err }) => {
            if (!alive) return;
            setHistoryLoading(false);
            if (err) { setHistory(null); setHistoryError(err.message || 'No se pudo cargar el historial.'); return; }
            setHistory(data);
        });
        return () => { alive = false; };
    }, [selectedMotoId, refreshKey]);

    const mechanics = useMemo(
        () => (users || []).filter((u) => u.is_active !== false).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'es')),
        [users],
    );

    const reload = useCallback(() => { setRefreshKey((k) => k + 1); refreshClients?.(); }, [refreshClients]);

    const changeMode = (m) => {
        setMode(m);
        setQuery(m === 'phone' ? onlyDigits(query) : query);
    };

    const setPreferred = async (mechanicId) => {
        if (!selected) return;
        setModalError('');
        try {
            await updateClient(selected.id, { preferred_mechanic_id: mechanicId || null });
            reload();
        } catch (e) {
            setError(e?.message || 'No se pudo guardar el mecánico preferido.');
        }
    };

    const saveClient = async () => {
        if (!editing.full_name.trim() || !editing.phone.trim()) { setModalError('Nombre y teléfono son obligatorios.'); return; }
        setSaving(true); setModalError('');
        try {
            await updateClient(selected.id, { full_name: editing.full_name.trim(), phone: editing.phone.trim(), notes: editing.notes?.trim() || null });
            setEditing(null);
            reload();
        } catch (e) {
            setModalError(e?.message || 'No se pudo guardar.');
        } finally {
            setSaving(false);
        }
    };

    const saveMoto = async () => {
        if (!addingMoto.brand.trim() || !addingMoto.model.trim()) { setModalError('Marca y modelo son obligatorios.'); return; }
        setSaving(true); setModalError('');
        try {
            const moto = await addMotorcycle({
                client_id: selected.id,
                brand: addingMoto.brand.trim(),
                model: addingMoto.model.trim(),
                year: addingMoto.year ? parseInt(addingMoto.year, 10) : null,
                plates: addingMoto.plates.trim() || null,
                color: addingMoto.color.trim() || null,
            });
            pendingMoto.current = moto?.id || null;
            setAddingMoto(null);
            reload();
        } catch (e) {
            setModalError(e?.message || 'No se pudo agregar la moto.');
        } finally {
            setSaving(false);
        }
    };

    const newOrderUrl = (motoId) => {
        const q = new URLSearchParams({ client: selected.id });
        if (motoId) q.set('moto', motoId);
        return `/mechanic/new-order?${q.toString()}`;
    };

    const showDetail = !!selected;

    return (
        <div className="lk-page">
            <header className="lk-head">
                <h1>Buscar cliente</h1>
                <p>Escribe el teléfono del cliente (completo o solo los últimos 4 dígitos) y verás sus motos y todo lo que se les ha hecho.</p>
            </header>

            {/* Buscador */}
            <div className="lk-search">
                <div className="lk-tabs" role="tablist" aria-label="Buscar por">
                    <button type="button" role="tab" aria-selected={mode === 'phone'} className={mode === 'phone' ? 'on' : ''} onClick={() => changeMode('phone')}>
                        <Phone size={15} /> Teléfono
                    </button>
                    <button type="button" role="tab" aria-selected={mode === 'text'} className={mode === 'text' ? 'on' : ''} onClick={() => changeMode('text')}>
                        <User size={15} /> Nombre o placas
                    </button>
                </div>
                <div className="lk-input-wrap">
                    <Search size={22} className="lk-input-icon" />
                    <input
                        key={mode}
                        className="lk-input"
                        autoFocus
                        type={mode === 'phone' ? 'tel' : 'search'}
                        inputMode={mode === 'phone' ? 'numeric' : 'search'}
                        autoComplete="off"
                        maxLength={mode === 'phone' ? 14 : 60}
                        placeholder={mode === 'phone' ? 'Ej: 9611234567 o 4567' : 'Nombre, placas o marca'}
                        value={query}
                        onChange={(e) => setQuery(mode === 'phone' ? onlyDigits(e.target.value) : e.target.value)}
                        aria-label={mode === 'phone' ? 'Teléfono del cliente' : 'Nombre, placas o marca'}
                    />
                    {query && (
                        <button type="button" className="lk-clear" onClick={() => setQuery('')} aria-label="Borrar búsqueda"><X size={18} /></button>
                    )}
                </div>
                {!longEnough && (
                    <p className="lk-hint">
                        {mode === 'phone' ? 'Escribe al menos 3 dígitos.' : 'Escribe al menos 3 letras.'}
                    </p>
                )}
            </div>

            {error && <div className="lk-error" role="alert">{error}</div>}

            <div className={`lk-body ${showDetail && results.length > 1 ? 'has-detail' : ''}`}>
                {/* Resultados */}
                <section className={`lk-results ${showDetail && results.length > 1 ? 'compact' : ''}`} aria-live="polite">
                    {loading && <div className="lk-state"><Loader2 size={20} className="lk-spin" /> Buscando...</div>}
                    {!loading && searched && results.length === 0 && !error && (
                        <div className="lk-state lk-empty">
                            <Search size={28} />
                            <strong>No encontramos ese cliente</strong>
                            <span>Revisa el número. Si es nuevo, regístralo desde Nueva orden.</span>
                            <Link className="lk-btn" to="/mechanic/new-order">Registrar cliente nuevo</Link>
                        </div>
                    )}
                    {!loading && results.length > 1 && (
                        <>
                            <div className="lk-count">{results.length} clientes</div>
                            <ul className="lk-list">
                                {results.map((c) => (
                                    <li key={c.id}>
                                        <button type="button" className={`lk-row ${c.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(c.id)}>
                                            <span className="lk-avatar">{c.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                                            <span className="lk-row-main">
                                                <strong>{c.full_name}</strong>
                                                <small>{c.phone} · {c.motorcycles.length} moto{c.motorcycles.length !== 1 ? 's' : ''}</small>
                                            </span>
                                            {c.web_unconfirmed && <span className="lk-tag">Cita web</span>}
                                            <ChevronRight size={18} className="lk-chev" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>

                {/* Detalle del cliente */}
                {selected && (
                    <section className="lk-detail">
                        {results.length > 1 && (
                            <button type="button" className="lk-back" onClick={() => setSelectedId(null)}>
                                <ArrowLeft size={16} /> Volver a los resultados
                            </button>
                        )}

                        <div className="lk-card lk-client">
                            <div className="lk-client-top">
                                <span className="lk-avatar lg">{selected.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                                <div className="lk-client-id">
                                    <h2>{selected.full_name}</h2>
                                    <a className="lk-phone" href={`tel:${onlyDigits(selected.phone)}`}>{selected.phone}</a>
                                    {selected.web_unconfirmed && (
                                        <span className="lk-tag lk-tag--web"><Globe size={12} /> Cita web por confirmar</span>
                                    )}
                                </div>
                            </div>
                            {selected.notes && <p className="lk-notes">{selected.notes}</p>}

                            <div className="lk-prefer">
                                <label htmlFor="lk-pref"><UserCheck size={15} /> Mecánico de preferencia</label>
                                {canEditClients() ? (
                                    <select id="lk-pref" value={selected.preferred_mechanic_id || ''} onChange={(e) => setPreferred(e.target.value)}>
                                        <option value="">Sin preferencia</option>
                                        {mechanics.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                                    </select>
                                ) : (
                                    <span className="lk-pref-text">{selected.preferred_mechanic?.full_name || 'Sin preferencia'}</span>
                                )}
                            </div>

                            <div className="lk-actions">
                                <a className="lk-btn" href={`tel:${onlyDigits(selected.phone)}`}><Phone size={16} /> Llamar</a>
                                <a className="lk-btn lk-btn--wa" href={`https://wa.me/${waNumber(selected.phone)}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> WhatsApp</a>
                                {canEditClients() && (
                                    <button type="button" className="lk-btn" onClick={() => { setModalError(''); setEditing({ full_name: selected.full_name || '', phone: selected.phone || '', notes: selected.notes || '' }); }}>
                                        <Edit2 size={16} /> Editar cliente
                                    </button>
                                )}
                                <button type="button" className="lk-btn lk-btn--primary" onClick={() => navigate(newOrderUrl(selectedMotoId))}>
                                    <Plus size={16} /> Nueva orden
                                </button>
                            </div>
                        </div>

                        {/* Motos */}
                        <div className="lk-sec-head">
                            <h3><Bike size={18} /> Motos ({selected.motorcycles.length})</h3>
                            {canCreateClients() && (
                                <button type="button" className="lk-link" onClick={() => { setModalError(''); setAddingMoto({ brand: '', model: '', year: '', plates: '', color: '' }); }}>
                                    <Plus size={14} /> Agregar moto
                                </button>
                            )}
                        </div>
                        {selected.motorcycles.length === 0 ? (
                            <div className="lk-card lk-muted">Este cliente todavía no tiene motos registradas.</div>
                        ) : (
                            <ul className="lk-motos">
                                {selected.motorcycles.map((m) => (
                                    <li key={m.id}>
                                        <button type="button" className={`lk-moto ${m.id === selectedMotoId ? 'on' : ''}`} onClick={() => setSelectedMotoId(m.id)} aria-pressed={m.id === selectedMotoId}>
                                            <Bike size={22} className="lk-moto-ico" />
                                            <span className="lk-moto-main">
                                                <strong>{motoLabel(m)}</strong>
                                                <small>{[m.plates, m.color].filter(Boolean).join(' · ') || 'Sin placas'}</small>
                                                <small className="lk-moto-stats">
                                                    {m.services_count} servicio{m.services_count !== 1 ? 's' : ''}
                                                    {m.last_service_at ? ` · último ${fmtDate(m.last_service_at)}` : ''}
                                                    {m.open_orders > 0 ? ` · ${m.open_orders} en curso` : ''}
                                                </small>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {/* Historial de la moto */}
                        {selectedMotoId && (
                            <div className="lk-history">
                                {historyLoading && <div className="lk-state"><Loader2 size={20} className="lk-spin" /> Cargando historial...</div>}
                                {historyError && <div className="lk-error" role="alert">{historyError}</div>}
                                {history && !historyLoading && (
                                    <>
                                        <div className="lk-sec-head">
                                            <h3><ClipboardList size={18} /> Historial de {motoLabel(history.motorcycle)}</h3>
                                        </div>
                                        <div className="lk-stats">
                                            <div><strong>{history.summary.services_count}</strong><span>Servicios hechos</span></div>
                                            <div><strong>{money(history.summary.total_spent)}</strong><span>Total gastado</span></div>
                                            <div><strong>{history.summary.last_visit_at ? fmtDate(history.summary.last_visit_at) : 'Sin visitas'}</strong><span>Última visita</span></div>
                                        </div>
                                        <div className="lk-sec-actions">
                                            <button type="button" className="lk-btn lk-btn--primary" onClick={() => navigate(newOrderUrl(selectedMotoId))}>
                                                <Plus size={16} /> Nueva orden para esta moto
                                            </button>
                                        </div>
                                        {history.timeline.length === 0 ? (
                                            <div className="lk-card lk-muted">Todavía no hay servicios registrados para esta moto.</div>
                                        ) : (
                                            <ol className="lk-timeline">
                                                {history.timeline.map((o) => (
                                                    <li key={o.id} className="lk-card lk-order">
                                                        <div className="lk-order-top">
                                                            <span className="lk-date">{fmtDate(o.date)}</span>
                                                            <Link className="lk-folio" to={`${area}/order/${o.id}`}>{o.order_number}</Link>
                                                            {o.status && (
                                                                <span className="lk-status" style={{ background: `${o.status.color || '#6e6e73'}22`, color: o.status.color || '#6e6e73' }}>{o.status.name}</span>
                                                            )}
                                                        </div>
                                                        {o.mechanic && <div className="lk-mech"><Wrench size={13} /> {o.mechanic.full_name}</div>}
                                                        {o.complaint && <p className="lk-complaint">{o.complaint}</p>}
                                                        {(o.services.length > 0 || o.parts.length > 0) ? (
                                                            <ul className="lk-lines">
                                                                {o.services.map((s, i) => (
                                                                    <li key={`s${i}`}><span>{s.quantity} x {s.name}</span><b>{money(Number(s.price) * s.quantity)}</b></li>
                                                                ))}
                                                                {o.parts.map((p, i) => (
                                                                    <li key={`p${i}`}><span>{p.quantity} x {p.name} <em>(refacción)</em></span><b>{money(Number(p.price) * p.quantity)}</b></li>
                                                                ))}
                                                            </ul>
                                                        ) : (
                                                            <p className="lk-muted-line">Sin servicios capturados.</p>
                                                        )}
                                                        {o.notes && <p className="lk-note">Nota del mecánico: {o.notes}</p>}
                                                        <div className="lk-order-foot">
                                                            <span className={`lk-paid ${o.is_paid ? 'yes' : 'no'}`}>{o.is_paid ? 'Pagado' : 'Sin pagar'}</span>
                                                            <strong className="lk-total">{money(o.total_amount)}</strong>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </section>
                )}
            </div>

            {/* Editar cliente */}
            {editing && (
                <div className="lk-modal" role="dialog" aria-modal="true" aria-label="Editar cliente" onClick={() => setEditing(null)}>
                    <div className="lk-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="lk-sheet-head"><h3>Editar cliente</h3><button type="button" onClick={() => setEditing(null)} aria-label="Cerrar"><X size={20} /></button></div>
                        <label>Nombre completo<input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></label>
                        <label>Teléfono<input type="tel" inputMode="numeric" value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></label>
                        <label>Notas<textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></label>
                        {modalError && <div className="lk-error" role="alert">{modalError}</div>}
                        <div className="lk-sheet-actions">
                            <button type="button" className="lk-btn" onClick={() => setEditing(null)}>Cancelar</button>
                            <button type="button" className="lk-btn lk-btn--primary" disabled={saving} onClick={saveClient}>{saving ? 'Guardando...' : 'Guardar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Agregar moto */}
            {addingMoto && (
                <div className="lk-modal" role="dialog" aria-modal="true" aria-label="Agregar moto" onClick={() => setAddingMoto(null)}>
                    <div className="lk-sheet" onClick={(e) => e.stopPropagation()}>
                        <div className="lk-sheet-head"><h3>Agregar moto</h3><button type="button" onClick={() => setAddingMoto(null)} aria-label="Cerrar"><X size={20} /></button></div>
                        <div className="lk-two">
                            <label>Marca *<input value={addingMoto.brand} placeholder="Honda, Italika..." onChange={(e) => setAddingMoto({ ...addingMoto, brand: e.target.value })} /></label>
                            <label>Modelo *<input value={addingMoto.model} placeholder="CB190R, FT150..." onChange={(e) => setAddingMoto({ ...addingMoto, model: e.target.value })} /></label>
                        </div>
                        <div className="lk-two">
                            <label>Año<input inputMode="numeric" maxLength={4} value={addingMoto.year} onChange={(e) => setAddingMoto({ ...addingMoto, year: onlyDigits(e.target.value) })} /></label>
                            <label>Placas<input value={addingMoto.plates} onChange={(e) => setAddingMoto({ ...addingMoto, plates: e.target.value.toUpperCase() })} /></label>
                        </div>
                        <label>Color<input value={addingMoto.color} onChange={(e) => setAddingMoto({ ...addingMoto, color: e.target.value })} /></label>
                        {modalError && <div className="lk-error" role="alert">{modalError}</div>}
                        <div className="lk-sheet-actions">
                            <button type="button" className="lk-btn" onClick={() => setAddingMoto(null)}>Cancelar</button>
                            <button type="button" className="lk-btn lk-btn--primary" disabled={saving} onClick={saveMoto}>{saving ? 'Guardando...' : 'Agregar'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
