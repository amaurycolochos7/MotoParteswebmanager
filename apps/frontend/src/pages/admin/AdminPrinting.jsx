import { useCallback, useEffect, useState } from 'react';
import {
    Printer,
    Wifi,
    WifiOff,
    KeyRound,
    Copy,
    Check,
    Save,
    Loader2,
    RotateCcw,
    X,
    Unplug,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { printService } from '../../lib/api';
import { TicketPaper } from '../../components/orders/TicketActions';
import './AdminPrinting.css';

// Impresión de tickets: estado de la laptop/impresora, clave para conectarla,
// ajustes del ticket con vista previa e historial. Contrato: docs/IMPRESION-CONTRATO.md

const DEFAULTS = {
    business_name: '',
    tagline: '',
    address: '',
    phone: '',
    footer: 'Gracias por su preferencia',
    warranty_enabled: true,
    warranty_days: 15,
    warranty_text: '',
    paper_cols: 48,
    accents: false,
    show_qr: true,
    show_mechanic: true,
    copies: 1,
};

const STANDARD_WARRANTY =
    'GARANTIA: 15 dias naturales desde la entrega. Vence el [fecha]. UNICAMENTE en mano de obra. Refacciones y piezas electricas NO tienen garantia.';

const JOB_STATUS = {
    pending: { label: 'Pendiente', cls: 'pending' },
    printing: { label: 'Imprimiendo', cls: 'printing' },
    printed: { label: 'Impreso', cls: 'printed' },
    failed: { label: 'Falló', cls: 'failed' },
    cancelled: { label: 'Cancelado', cls: 'cancelled' },
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function normalizeSettings(s) {
    return { ...DEFAULTS, ...(s || {}) };
}

function timeAgo(iso, now) {
    if (!iso) return 'nunca';
    const secs = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
    if (secs < 5) return 'justo ahora';
    if (secs < 60) return `hace ${secs} s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    return `hace ${Math.floor(hours / 24)} d`;
}

function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('es-MX', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function AdminPrinting() {
    const { workspaceRole } = useAuth();
    const { success: toastOk, error: toastError, warning: toastWarn } = useToast();
    const canEdit = workspaceRole === 'owner' || workspaceRole === 'admin';

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [form, setForm] = useState(DEFAULTS);
    const [saving, setSaving] = useState(false);

    const [agent, setAgent] = useState(null);
    const [queue, setQueue] = useState({ pending: 0, printing: 0, failed: 0 });
    const [jobs, setJobs] = useState([]);
    const [now, setNow] = useState(() => Date.now());

    const [sample, setSample] = useState({ text: '', cols: 48, error: null, loading: true });
    const [testing, setTesting] = useState(false);

    const [newKey, setNewKey] = useState(null);
    const [copied, setCopied] = useState(false);
    const [keyBusy, setKeyBusy] = useState(false);
    const [confirm, setConfirm] = useState(null); // 'rotate' | 'revoke' | null
    const [actingJob, setActingJob] = useState(null);

    /* ---- Carga ---- */
    const loadSample = useCallback(async () => {
        const { data, error } = await printService.sample();
        if (error || !data) {
            setSample({ text: '', cols: 48, loading: false, error: error?.message || 'No se pudo cargar la vista previa' });
        } else {
            setSample({ text: data.text || '', cols: data.cols || 48, loading: false, error: null });
        }
    }, []);

    // Latido: estado de la laptop + cola + historial (no toca el formulario).
    const refreshStatus = useCallback(async () => {
        const [st, jb] = await Promise.all([printService.getSettings(), printService.listJobs({ limit: 30 })]);
        if (st.data) {
            setAgent(st.data.agent || null);
            setQueue(st.data.queue || { pending: 0, printing: 0, failed: 0 });
        }
        if (jb.data) setJobs(jb.data.jobs || []);
        setNow(Date.now());
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [st, jb] = await Promise.all([
                printService.getSettings(),
                printService.listJobs({ limit: 30 }),
                loadSample(),
            ]);
            if (cancelled) return;
            if (st.error || !st.data) {
                setLoadError(st.error?.message || 'No pudimos cargar la configuración de impresión.');
            } else {
                setForm(normalizeSettings(st.data.settings));
                setAgent(st.data.agent || null);
                setQueue(st.data.queue || { pending: 0, printing: 0, failed: 0 });
            }
            if (jb.data) setJobs(jb.data.jobs || []);
            setNow(Date.now());
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [loadSample]);

    // Se refresca sola cada 5 s mientras la pantalla está visible.
    useEffect(() => {
        const tick = () => {
            if (!document.hidden) refreshStatus();
        };
        const id = setInterval(tick, 5000);
        document.addEventListener('visibilitychange', tick);
        return () => {
            clearInterval(id);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [refreshStatus]);

    /* ---- Formulario ---- */
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const toggle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

    const save = async () => {
        if (!canEdit || saving) return;
        const payload = {
            business_name: form.business_name.trim(),
            tagline: form.tagline.trim(),
            address: form.address.trim(),
            phone: form.phone.trim(),
            footer: form.footer.trim(),
            warranty_enabled: !!form.warranty_enabled,
            warranty_days: clamp(parseInt(form.warranty_days, 10) || 15, 1, 365),
            warranty_text: form.warranty_text.trim(),
            paper_cols: Number(form.paper_cols) === 32 ? 32 : 48,
            accents: !!form.accents,
            show_qr: !!form.show_qr,
            show_mechanic: !!form.show_mechanic,
            copies: clamp(parseInt(form.copies, 10) || 1, 1, 3),
        };
        setSaving(true);
        const { data, error } = await printService.saveSettings(payload);
        setSaving(false);
        if (error) {
            toastError(error.message || 'No pudimos guardar los ajustes.');
            return;
        }
        setForm(normalizeSettings(data?.settings || payload));
        toastOk('Ajustes del ticket guardados.');
        loadSample();
    };

    /* ---- Prueba ---- */
    const sendTest = async () => {
        if (testing) return;
        setTesting(true);
        const { data, error } = await printService.printTest();
        setTesting(false);
        if (error) {
            toastError(error.message || 'No se pudo mandar el ticket de prueba.');
            return;
        }
        if (data?.agent_connected === false) {
            toastWarn('Prueba en cola. Saldrá cuando la laptop del taller se conecte.', 6000);
        } else {
            toastOk('Ticket de prueba enviado a imprimir.');
        }
        refreshStatus();
    };

    /* ---- Clave de la laptop ---- */
    const generateKey = async () => {
        if (keyBusy) return;
        setKeyBusy(true);
        setConfirm(null);
        const { data, error } = await printService.createAgentKey();
        setKeyBusy(false);
        if (error || !data?.key) {
            toastError(error?.message || 'No se pudo generar la clave.');
            return;
        }
        setNewKey(data.key);
        setCopied(false);
        setAgent(data.agent || null);
    };

    const revokeKey = async () => {
        if (keyBusy) return;
        setKeyBusy(true);
        setConfirm(null);
        const { error } = await printService.revokeAgentKey();
        setKeyBusy(false);
        if (error) {
            toastError(error.message || 'No se pudo quitar la laptop.');
            return;
        }
        setNewKey(null);
        setAgent(null);
        toastOk('Laptop desconectada. Ya no puede imprimir.');
        refreshStatus();
    };

    const copyKey = async () => {
        try {
            await navigator.clipboard.writeText(newKey);
        } catch {
            // Respaldo para navegadores sin portapapeles (http, webviews).
            const ta = document.createElement('textarea');
            ta.value = newKey;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
            } catch {
                toastError('No se pudo copiar. Selecciónala y cópiala a mano.');
                document.body.removeChild(ta);
                return;
            }
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    /* ---- Historial ---- */
    const reprint = async (job) => {
        if (actingJob) return;
        setActingJob(job.id);
        const { data, error } = await printService.reprint(job.id);
        setActingJob(null);
        if (error) {
            toastError(error.message || 'No se pudo reimprimir.');
            return;
        }
        toastOk(data?.agent_connected === false ? 'En cola. Saldrá cuando la laptop se conecte.' : 'Reimpresión enviada.');
        refreshStatus();
    };

    const cancelJob = async (job) => {
        if (actingJob) return;
        setActingJob(job.id);
        const { error } = await printService.cancel(job.id);
        setActingJob(null);
        if (error) {
            toastError(error.message || 'No se pudo cancelar.');
            return;
        }
        toastOk('Impresión cancelada.');
        refreshStatus();
    };

    if (loading) {
        return <div className="pr-page pr-loading"><Loader2 size={18} className="pr-spin" /> Cargando impresión…</div>;
    }

    const connected = Boolean(agent?.connected);

    return (
        <div className="pr-page">
            <header className="pr-head">
                <div>
                    <h1>Impresión de tickets</h1>
                    <p>Conecta la laptop del taller, ajusta cómo se ve el ticket y revisa lo que se imprimió.</p>
                </div>
            </header>

            {loadError && <div className="pr-banner pr-banner--error">{loadError}</div>}
            {!canEdit && (
                <div className="pr-banner pr-banner--warn">
                    Solo el propietario o un admin del taller pueden cambiar esta configuración.
                </div>
            )}

            {/* ---- 1 · Estado ---- */}
            <section className="pr-card">
                <div className="pr-card__head">
                    <Printer size={20} />
                    <h2>Estado de la impresora</h2>
                </div>
                <div className="pr-status">
                    <span className={`pr-chip ${connected ? 'pr-chip--ok' : 'pr-chip--off'}`}>
                        {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
                        {connected ? 'Conectada' : agent ? 'Desconectada' : 'Sin laptop'}
                    </span>
                    <div className="pr-status__meta">
                        {agent ? (
                            <>
                                <span>Última conexión: <strong>{timeAgo(agent.last_seen_at, now)}</strong></span>
                                {agent.printer_name && <span>Impresora: <strong>{agent.printer_name}</strong></span>}
                            </>
                        ) : (
                            <span>Todavía no hay una laptop conectada. Genera una clave abajo.</span>
                        )}
                        <span>
                            Cola: <strong>{queue.pending || 0}</strong> pendientes ·{' '}
                            <strong className={queue.failed ? 'pr-red' : ''}>{queue.failed || 0}</strong> fallidos
                        </span>
                    </div>
                </div>
                {canEdit && (
                    <button type="button" className="pr-btn pr-btn--outline" onClick={sendTest} disabled={testing}>
                        {testing ? <Loader2 size={16} className="pr-spin" /> : <Printer size={16} />}
                        Imprimir ticket de prueba
                    </button>
                )}
            </section>

            {/* ---- 2 · Conectar la laptop ---- */}
            <section className="pr-card">
                <div className="pr-card__head">
                    <KeyRound size={20} />
                    <h2>Conectar la laptop</h2>
                </div>

                {newKey && (
                    <div className="pr-key">
                        <p className="pr-key__warn">Cópiala ahora: esta clave no se vuelve a mostrar.</p>
                        <div className="pr-key__row">
                            <code className="pr-key__code" aria-label="Clave del agente">{newKey}</code>
                            <button type="button" className="pr-btn pr-btn--primary" onClick={copyKey}>
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Copiada' : 'Copiar'}
                            </button>
                        </div>
                        <button type="button" className="pr-link" onClick={() => setNewKey(null)}>
                            Ya la copié, ocultar
                        </button>
                    </div>
                )}

                <ol className="pr-steps">
                    <li><span>1</span> Descarga o abre el instalador del agente de impresión en la laptop del taller.</li>
                    <li><span>2</span> Pega la clave cuando te la pida.</li>
                    <li><span>3</span> Listo: la laptop imprime sola cada ticket que mandes.</li>
                </ol>

                {agent && !newKey && (
                    <p className="pr-muted">
                        Laptop registrada: <strong>{agent.name || 'Laptop del taller'}</strong>
                        {agent.key_prefix ? <> · clave <code>{agent.key_prefix}…</code></> : null}
                        {agent.agent_version ? <> · versión {agent.agent_version}</> : null}
                    </p>
                )}

                {canEdit ? (
                    <div className="pr-actions">
                        {confirm === 'rotate' ? (
                            <div className="pr-confirm">
                                <span>¿Seguro? La laptop actual dejará de imprimir hasta que le pongas la clave nueva.</span>
                                <div>
                                    <button type="button" className="pr-btn pr-btn--danger" onClick={generateKey} disabled={keyBusy}>
                                        Sí, generar clave nueva
                                    </button>
                                    <button type="button" className="pr-btn pr-btn--outline" onClick={() => setConfirm(null)}>
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : confirm === 'revoke' ? (
                            <div className="pr-confirm">
                                <span>¿Quitar la laptop? Dejará de imprimir y tendrás que generar otra clave para volver a conectarla.</span>
                                <div>
                                    <button type="button" className="pr-btn pr-btn--danger" onClick={revokeKey} disabled={keyBusy}>
                                        Sí, quitar laptop
                                    </button>
                                    <button type="button" className="pr-btn pr-btn--outline" onClick={() => setConfirm(null)}>
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="pr-btn pr-btn--primary"
                                    onClick={agent ? () => setConfirm('rotate') : generateKey}
                                    disabled={keyBusy}
                                >
                                    {keyBusy ? <Loader2 size={16} className="pr-spin" /> : <KeyRound size={16} />}
                                    {agent ? 'Generar clave nueva (desconecta la anterior)' : 'Generar clave'}
                                </button>
                                {agent && (
                                    <button type="button" className="pr-btn pr-btn--outline" onClick={() => setConfirm('revoke')}>
                                        <Unplug size={16} /> Quitar laptop
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <p className="pr-muted">Pídele al propietario o a un admin que conecte la laptop.</p>
                )}
            </section>

            {/* ---- 3 · Ajustes del ticket ---- */}
            <section className="pr-card">
                <div className="pr-card__head">
                    <Printer size={20} />
                    <h2>Cómo se ve el ticket</h2>
                </div>
                <div className="pr-settings">
                    <div className="pr-form">
                        <label htmlFor="pr-name">Nombre del taller</label>
                        <input id="pr-name" value={form.business_name} onChange={set('business_name')} disabled={!canEdit} maxLength={40} />

                        <label htmlFor="pr-tagline">Lema (opcional)</label>
                        <input id="pr-tagline" value={form.tagline} onChange={set('tagline')} disabled={!canEdit} maxLength={48} placeholder="Taller de motocicletas" />

                        <label htmlFor="pr-address">Dirección (máx. 2 líneas)</label>
                        <textarea id="pr-address" rows={2} value={form.address} onChange={set('address')} disabled={!canEdit} maxLength={120} placeholder="Av. Ejemplo 123, Col. Centro" />

                        <label htmlFor="pr-phone">Teléfono del taller</label>
                        <input id="pr-phone" value={form.phone} onChange={set('phone')} disabled={!canEdit} maxLength={24} inputMode="tel" />

                        <label htmlFor="pr-footer">Mensaje final</label>
                        <input id="pr-footer" value={form.footer} onChange={set('footer')} disabled={!canEdit} maxLength={48} />

                        <div className="pr-box">
                            <label className="pr-switch">
                                <input type="checkbox" checked={form.warranty_enabled} onChange={toggle('warranty_enabled')} disabled={!canEdit} />
                                <span>Imprimir la garantía</span>
                            </label>
                            {form.warranty_enabled && (
                                <>
                                    <label htmlFor="pr-wdays">Días de garantía</label>
                                    <input id="pr-wdays" type="number" min={1} max={365} value={form.warranty_days} onChange={set('warranty_days')} disabled={!canEdit} />
                                    <label htmlFor="pr-wtext">Texto de la garantía (vacío = texto estándar)</label>
                                    <textarea id="pr-wtext" rows={3} value={form.warranty_text} onChange={set('warranty_text')} disabled={!canEdit} maxLength={240} placeholder={STANDARD_WARRANTY} />
                                </>
                            )}
                        </div>

                        <div className="pr-two">
                            <div>
                                <label htmlFor="pr-paper">Papel</label>
                                <select id="pr-paper" value={form.paper_cols} onChange={set('paper_cols')} disabled={!canEdit}>
                                    <option value={48}>80 mm (normal)</option>
                                    <option value={32}>58 mm (angosto)</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="pr-copies">Copias</label>
                                <select id="pr-copies" value={form.copies} onChange={set('copies')} disabled={!canEdit}>
                                    <option value={1}>1</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3</option>
                                </select>
                            </div>
                        </div>

                        <label className="pr-switch">
                            <input type="checkbox" checked={form.show_qr} onChange={toggle('show_qr')} disabled={!canEdit} />
                            <span>QR para que el cliente siga su orden</span>
                        </label>
                        <label className="pr-switch">
                            <input type="checkbox" checked={form.show_mechanic} onChange={toggle('show_mechanic')} disabled={!canEdit} />
                            <span>Mostrar quién atendió</span>
                        </label>
                        <label className="pr-switch">
                            <input type="checkbox" checked={form.accents} onChange={toggle('accents')} disabled={!canEdit} />
                            <span>Usar acentos y ñ (si salen símbolos raros, apágalo)</span>
                        </label>

                        {canEdit && (
                            <button type="button" className="pr-btn pr-btn--primary pr-save" onClick={save} disabled={saving}>
                                {saving ? <Loader2 size={16} className="pr-spin" /> : <Save size={16} />}
                                {saving ? 'Guardando…' : 'Guardar ajustes'}
                            </button>
                        )}
                    </div>

                    <div className="pr-preview">
                        <h3>Vista previa</h3>
                        {sample.loading ? (
                            <p className="pr-muted"><Loader2 size={14} className="pr-spin" /> Cargando…</p>
                        ) : sample.error ? (
                            <p className="pr-error">{sample.error}</p>
                        ) : (
                            <TicketPaper text={sample.text} cols={sample.cols} />
                        )}
                        <p className="pr-muted">Se actualiza al guardar. Los datos del ticket son de ejemplo.</p>
                    </div>
                </div>
            </section>

            {/* ---- 4 · Historial ---- */}
            <section className="pr-card">
                <div className="pr-card__head">
                    <RotateCcw size={20} />
                    <h2>Historial de impresiones</h2>
                </div>
                {jobs.length === 0 ? (
                    <p className="pr-muted">Todavía no hay impresiones.</p>
                ) : (
                    <ul className="pr-jobs">
                        {jobs.map((job) => {
                            const st = JOB_STATUS[job.status] || { label: job.status, cls: 'pending' };
                            const acting = actingJob === job.id;
                            return (
                                <li key={job.id} className="pr-job">
                                    <div className="pr-job__main">
                                        <div className="pr-job__top">
                                            <span className={`pr-badge pr-badge--${st.cls}`}>{st.label}</span>
                                            <strong>{job.title || (job.kind === 'test' ? 'Ticket de prueba' : 'Ticket')}</strong>
                                        </div>
                                        <div className="pr-job__meta">
                                            {fmtDate(job.created_at)}
                                            {job.printed_at ? ` · impreso ${fmtDate(job.printed_at)}` : ''}
                                            {job.copies > 1 ? ` · ${job.copies} copias` : ''}
                                            {job.attempts > 1 ? ` · ${job.attempts} intentos` : ''}
                                        </div>
                                        {job.error && <div className="pr-job__error">{job.error}</div>}
                                    </div>
                                    <div className="pr-job__actions">
                                        {job.status === 'pending' && (
                                            <button type="button" className="pr-btn pr-btn--outline pr-btn--sm" onClick={() => cancelJob(job)} disabled={Boolean(actingJob)}>
                                                {acting ? <Loader2 size={14} className="pr-spin" /> : <X size={14} />} Cancelar
                                            </button>
                                        )}
                                        {job.status !== 'pending' && job.status !== 'printing' && (
                                            <button type="button" className="pr-btn pr-btn--outline pr-btn--sm" onClick={() => reprint(job)} disabled={Boolean(actingJob)}>
                                                {acting ? <Loader2 size={14} className="pr-spin" /> : <RotateCcw size={14} />} Reimprimir
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
