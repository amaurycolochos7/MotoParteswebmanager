import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, UserCog, Phone, AlertTriangle, ShieldCheck, Wrench, Users, Crown, MessagesSquare, Trash2, UserX, UserCheck, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { teamService } from '../../lib/api';
import { Avatar, Chip, Drawer, Segmented, Skeleton, Switch } from '../../components/ui/kit';
import './Team.css';

const ROLE_LABEL = { owner: 'Dueño', admin: 'Administrador', maestro: 'Mecánico maestro', mecanico: 'Mecánico', auxiliar: 'Auxiliar' };
const ROLE_TONE = { owner: 'ink', admin: 'ink', maestro: 'warn', mecanico: 'neutral', auxiliar: 'info' };

const PERMS = [
  { key: 'can_create_appointments', label: 'Crear citas' },
  { key: 'can_send_messages', label: 'Enviar mensajes a clientes' },
  { key: 'can_create_clients', label: 'Registrar clientes' },
  { key: 'can_edit_clients', label: 'Editar clientes' },
  { key: 'can_create_services', label: 'Crear servicios en el catálogo' },
  { key: 'can_view_approved_orders', label: 'Ver órdenes aprobadas' },
  { key: 'can_delete_orders', label: 'Eliminar órdenes' },
];

// Plantillas de permisos por rol (se pueden afinar a mano)
const PERM_TEMPLATES = {
  admin: { can_create_appointments: true, can_send_messages: true, can_create_clients: true, can_edit_clients: true, can_create_services: true, can_view_approved_orders: true, can_delete_orders: true },
  maestro: { can_create_appointments: true, can_send_messages: true, can_create_clients: true, can_edit_clients: true, can_create_services: true, can_view_approved_orders: true, can_delete_orders: false },
  mecanico: { can_create_appointments: true, can_send_messages: true, can_create_clients: true, can_edit_clients: false, can_create_services: false, can_view_approved_orders: true, can_delete_orders: false },
  auxiliar: { can_create_appointments: true, can_send_messages: true, can_create_clients: true, can_edit_clients: false, can_create_services: false, can_view_approved_orders: true, can_delete_orders: false },
};

const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'admin', label: 'Administración' },
  { id: 'maestro', label: 'Maestros' },
  { id: 'mecanico', label: 'Mecánicos' },
  { id: 'auxiliar', label: 'Auxiliares' },
];

const blank = (role = 'mecanico', supervisedBy = '') => ({
  id: null,
  role,
  full_name: '',
  email: '',
  phone: '',
  password: '',
  commission_percentage: role === 'auxiliar' ? 20 : 40,
  supervised_by: supervisedBy,
  can_view_inbox: false,
  online_booking_visible: true,
  permissions: { ...PERM_TEMPLATES[role] },
});

export default function Team() {
  const { user, teamRole, isManager } = useAuth();
  const toast = useToast();
  const isOwner = teamRole === 'owner';

  const [members, setMembers] = useState([]);
  const [state, setState] = useState('loading'); // loading | ok | error
  const [cap, setCap] = useState(40);
  const [capDraft, setCapDraft] = useState('40');
  const [savingCap, setSavingCap] = useState(false);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('todos');

  const [form, setForm] = useState(null); // null = cerrado
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: 'remove'|'permanent', member }
  const [showFine, setShowFine] = useState(false);

  const load = useCallback(async () => {
    setState((s) => (s === 'ok' ? 'ok' : 'loading'));
    try {
      const list = await teamService.list();
      setMembers(Array.isArray(list) ? list : []);
      setState('ok');
    } catch {
      setState('error');
    }
    if (isManager) {
      try {
        const st = await teamService.getSettings();
        if (st?.aux_commission_cap != null) { setCap(Number(st.aux_commission_cap)); setCapDraft(String(st.aux_commission_cap)); }
      } catch { /* aun sin ajuste */ }
    }
  }, [isManager]);

  useEffect(() => { load(); }, [load]);

  const maestros = useMemo(() => members.filter((m) => m.role === 'maestro' && m.is_active !== false), [members]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return members.filter((m) => {
      if (filter === 'admin' && !['owner', 'admin'].includes(m.role)) return false;
      if (filter !== 'todos' && filter !== 'admin' && m.role !== filter) return false;
      if (!needle) return true;
      return `${m.full_name} ${m.email} ${m.phone || ''}`.toLowerCase().includes(needle);
    });
  }, [members, q, filter]);

  const counts = useMemo(() => ({
    todos: members.length,
    admin: members.filter((m) => ['owner', 'admin'].includes(m.role)).length,
    maestro: members.filter((m) => m.role === 'maestro').length,
    mecanico: members.filter((m) => m.role === 'mecanico').length,
    auxiliar: members.filter((m) => m.role === 'auxiliar').length,
  }), [members]);

  const openNew = () => {
    setShowFine(false);
    if (teamRole === 'maestro') setForm({ ...blank('auxiliar', user.id), creating: true });
    else setForm({ ...blank('mecanico'), creating: true });
  };
  const openEdit = (m) => {
    setShowFine(false);
    setForm({
      id: m.id,
      creating: false,
      role: m.role,
      full_name: m.full_name || '',
      email: m.email || '',
      phone: m.phone || '',
      password: '',
      commission_percentage: Number(m.commission_percentage ?? 0),
      supervised_by: m.supervised_by || '',
      can_view_inbox: !!m.can_view_inbox,
      online_booking_visible: m.online_booking_visible !== false,
      permissions: { ...PERM_TEMPLATES[m.role === 'owner' ? 'admin' : m.role], ...(m.permissions || {}) },
    });
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setRole = (role) => setForm((f) => ({
    ...f,
    role,
    commission_percentage: role === 'auxiliar' ? Math.min(f.commission_percentage || 20, cap) : (f.role === 'auxiliar' ? 40 : f.commission_percentage),
    permissions: { ...PERM_TEMPLATES[role] },
    supervised_by: role === 'auxiliar' ? (f.supervised_by || (teamRole === 'maestro' ? user.id : '')) : '',
    can_view_inbox: ['admin', 'maestro'].includes(role) ? true : (role === 'auxiliar' ? f.can_view_inbox : false),
  }));

  const capForMaster = form?.role === 'auxiliar' ? cap : 100;
  const pct = Number(form?.commission_percentage);
  const pctError = form && (Number.isNaN(pct) || pct < 0 || pct > capForMaster)
    ? (form.role === 'auxiliar' ? `El máximo para un auxiliar es ${cap}%.` : 'Escribe un porcentaje entre 0 y 100.')
    : '';
  const formErrors = form ? [
    !form.full_name.trim() && 'Escribe el nombre.',
    !form.email.trim() && 'Escribe el correo.',
    form.creating && form.password.length < 6 && 'La contraseña debe tener al menos 6 caracteres.',
    form.role === 'auxiliar' && !form.supervised_by && 'Elige a qué maestro reporta.',
    pctError,
  ].filter(Boolean) : [];

  const save = async () => {
    if (!form || formErrors.length) return;
    setSaving(true);
    try {
      const body = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.replace(/\D/g, '').slice(-10),
        role: form.role,
        // El administrador también puede trabajar órdenes (como Elihu): su % se guarda igual.
        commission_percentage: Number.isFinite(pct) ? pct : undefined,
        supervised_by: form.role === 'auxiliar' ? form.supervised_by : null,
        can_view_inbox: form.role === 'auxiliar' ? !!form.can_view_inbox : undefined,
        permissions: form.permissions,
      };
      if (form.password) body.password = form.password;
      let saved;
      if (form.creating) saved = await teamService.create(body);
      else saved = await teamService.update(form.id, body);
      // Interruptor de citas en línea (solo gerencia)
      if (isManager && (saved?.id || form.id)) {
        try { await teamService.setOnlineBooking(saved?.id || form.id, !!form.online_booking_visible); } catch { /* opcional */ }
      }
      toast.success(form.creating ? 'Persona agregada al equipo' : 'Cambios guardados');
      setForm(null);
      load();
    } catch (e) {
      toast.error(e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    try {
      await teamService.setActive(m.id, m.is_active === false);
      toast.success(m.is_active === false ? `${m.full_name} activado` : `${m.full_name} desactivado`);
      load();
    } catch (e) { toast.error(e.message || 'No se pudo cambiar'); }
  };

  const doConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'permanent') await teamService.removePermanent(confirm.member.id);
      else await teamService.remove(confirm.member.id);
      toast.success(confirm.kind === 'permanent' ? 'Cuenta eliminada definitivamente' : 'Persona quitada del taller');
      setConfirm(null);
      setForm(null);
      load();
    } catch (e) { toast.error(e.message || 'No se pudo eliminar'); }
  };

  const saveCap = async () => {
    const v = Number(capDraft);
    if (Number.isNaN(v) || v < 0 || v > 100) { toast.error('El tope debe estar entre 0 y 100'); return; }
    setSavingCap(true);
    try { await teamService.saveSettings({ aux_commission_cap: v }); setCap(v); toast.success('Tope guardado'); }
    catch (e) { toast.error(e.message || 'No se pudo guardar'); }
    finally { setSavingCap(false); }
  };

  const roleOptions = isManager
    ? [
      { id: 'admin', title: 'Administrador', text: 'Gestiona equipo, comisiones, WhatsApp y ajustes.', icon: ShieldCheck },
      { id: 'maestro', title: 'Mecánico maestro', text: 'Trabaja órdenes, aprueba y crea a sus auxiliares.', icon: Crown },
      { id: 'mecanico', title: 'Mecánico', text: 'Trabaja sus propias órdenes y citas.', icon: Wrench },
      { id: 'auxiliar', title: 'Auxiliar', text: 'Sus órdenes necesitan la aprobación de su maestro.', icon: Users },
    ]
    : [{ id: 'auxiliar', title: 'Auxiliar', text: 'Sus órdenes necesitan tu aprobación.', icon: Users }];

  return (
    <div className="tm k-rise">
      <header className="k-pagehead">
        <div>
          <h1>{teamRole === 'maestro' ? 'Mi equipo' : 'Equipo'}</h1>
          <p>{teamRole === 'maestro' ? 'Tus auxiliares y lo que ganan por orden.' : 'Quién trabaja en el taller, su rol, su comisión y lo que puede hacer.'}</p>
        </div>
        <div className="k-pagehead__actions">
          <button type="button" className="k-btn k-btn--red" onClick={openNew}><Plus size={18} /> {teamRole === 'maestro' ? 'Agregar auxiliar' : 'Agregar persona'}</button>
        </div>
      </header>

      {isManager && (
        <section className="tm-cap">
          <div className="tm-cap__txt">
            <h3>Tope de comisión para auxiliares</h3>
            <p>Los maestros pueden fijar a sus auxiliares un porcentaje hasta este máximo. El resto de la mano de obra es del maestro.</p>
          </div>
          <div className="tm-cap__ctl">
            <div className="tm-cap__input"><input className="k-input" inputMode="numeric" value={capDraft} onChange={(e) => setCapDraft(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Tope de comisión" /><span>%</span></div>
            <button type="button" className="k-btn k-btn--ghost" onClick={saveCap} disabled={savingCap || Number(capDraft) === cap}>Guardar</button>
          </div>
        </section>
      )}

      <div className="tm-bar">
        <label className="k-search tm-search"><Search size={18} /><input placeholder="Buscar por nombre, correo o teléfono" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {teamRole !== 'maestro' && <Segmented items={FILTERS.map((f) => ({ ...f, count: counts[f.id] }))} value={filter} onChange={setFilter} />}
      </div>

      {state === 'loading' && (
        <div className="tm-list">{[0, 1, 2].map((i) => <div key={i} className="tm-row"><Skeleton w={40} h={40} r={8} /><div style={{ flex: 1 }}><Skeleton w="40%" h={14} /><Skeleton w="25%" h={11} style={{ marginTop: 8 }} /></div></div>)}</div>
      )}

      {state === 'error' && (
        <div className="k-note k-note--red"><AlertTriangle size={18} /><div>No se pudo cargar el equipo. <button type="button" className="tm-link" onClick={load}>Reintentar</button></div></div>
      )}

      {state === 'ok' && visible.length === 0 && (
        <div className="k-empty">
          <div className="k-empty__ico"><UserCog size={24} /></div>
          <h3>{members.length === 0 ? 'Aún no hay equipo' : 'Sin resultados'}</h3>
          <p>{members.length === 0 ? 'Agrega a la primera persona para empezar.' : 'Prueba con otro nombre o cambia el filtro.'}</p>
        </div>
      )}

      {state === 'ok' && visible.length > 0 && (
        <ul className="tm-list">
          {visible.map((m) => {
            const inactive = m.is_active === false;
            const noPhone = !m.phone;
            return (
              <li key={m.id}>
                <button type="button" className={`tm-row${inactive ? ' is-off' : ''}`} onClick={() => openEdit(m)}>
                  <Avatar name={m.full_name} size="md" />
                  <span className="tm-row__main">
                    <strong>{m.full_name}</strong>
                    <span className="tm-row__sub">{m.email}{m.phone ? ` · ${m.phone}` : ''}</span>
                  </span>
                  <span className="tm-row__chips">
                    <Chip tone={ROLE_TONE[m.role]}>{ROLE_LABEL[m.role] || m.role}</Chip>
                    {m.role === 'auxiliar' && m.supervisor_name && <Chip>Con {m.supervisor_name.split(' ')[0]}</Chip>}
                    {m.can_view_inbox && ['auxiliar'].includes(m.role) && <Chip icon={<MessagesSquare />}>Conversaciones</Chip>}
                    {noPhone && !inactive && <Chip tone="warn" icon={<Phone />}>Sin teléfono</Chip>}
                    {inactive && <Chip tone="red">Inactivo</Chip>}
                  </span>
                  <span className="tm-row__pct tnum">{(m.role === 'admin' || m.role === 'owner') && !Number(m.commission_percentage) ? '—' : `${Number(m.commission_percentage ?? 0)}%`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isManager && (
        <p className="tm-foot"><Globe size={14} /> Quién aparece al agendar citas en línea se ajusta en la ficha de cada persona. <Link to="/admin/whatsapp">WhatsApp del taller</Link></p>
      )}

      {/* ----------------------------- Ficha / alta ----------------------------- */}
      <Drawer
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.creating ? (teamRole === 'maestro' ? 'Nuevo auxiliar' : 'Nueva persona') : form?.full_name || 'Ficha'}
        subtitle={form?.creating ? 'Alta guiada en 4 pasos' : ROLE_LABEL[form?.role]}
        width={520}
        footer={form && (
          <>
            {!form.creating && form.role !== 'owner' && (
              <button type="button" className="k-btn k-btn--danger k-btn--sm tm-foot-left" onClick={() => setConfirm({ kind: 'remove', member: form })}><Trash2 size={15} /> Quitar del taller</button>
            )}
            <button type="button" className="k-btn k-btn--ghost" onClick={() => setForm(null)}>Cancelar</button>
            <button type="button" className="k-btn k-btn--red" onClick={save} disabled={saving || formErrors.length > 0}>{saving ? 'Guardando…' : form.creating ? 'Crear' : 'Guardar'}</button>
          </>
        )}
      >
        {form && (
          <div className="tm-form">
            {/* 1 Rol */}
            <section className="tm-step">
              <h4><span>1</span> Rol</h4>
              {form.role === 'owner' ? (
                <div className="k-note"><ShieldCheck size={16} /> Esta cuenta es la del dueño del taller. Su rol no se puede cambiar.</div>
              ) : (
                <div className="tm-roles">
                  {roleOptions.map((r) => {
                    const Icon = r.icon;
                    return (
                      <button key={r.id} type="button" className={`tm-role${form.role === r.id ? ' is-on' : ''}`} onClick={() => setRole(r.id)} disabled={roleOptions.length === 1}>
                        <span className="tm-role__ico"><Icon size={18} /></span>
                        <span><strong>{r.title}</strong><small>{r.text}</small></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 2 Datos */}
            <section className="tm-step">
              <h4><span>2</span> Datos de acceso</h4>
              <div className="tm-grid">
                <div className="k-field tm-span"><label htmlFor="tm-name">Nombre completo</label><input id="tm-name" className="k-input" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} placeholder="Nombre y apellidos" /></div>
                <div className="k-field"><label htmlFor="tm-email">Correo</label><input id="tm-email" type="email" className="k-input" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="correo@ejemplo.com" autoComplete="off" /></div>
                <div className="k-field"><label htmlFor="tm-phone">Teléfono (WhatsApp)</label><input id="tm-phone" className="k-input" inputMode="numeric" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="10 dígitos" /><span className="k-hint">Aquí recibe sus avisos de citas.</span></div>
                <div className="k-field tm-span"><label htmlFor="tm-pass">{form.creating ? 'Contraseña' : 'Nueva contraseña (opcional)'}</label><input id="tm-pass" type="password" className="k-input" value={form.password} onChange={(e) => setField('password', e.target.value)} placeholder={form.creating ? 'Mínimo 6 caracteres' : 'Déjala vacía para no cambiarla'} autoComplete="new-password" /></div>
              </div>
            </section>

            {/* 3 Comisión */}
            {(
              <section className="tm-step">
                <h4><span>3</span> Comisión</h4>
                <div className="tm-grid">
                  {form.role === 'auxiliar' && (
                    <div className="k-field tm-span">
                      <label htmlFor="tm-sup">Reporta al maestro</label>
                      <select id="tm-sup" className="k-select" value={form.supervised_by} onChange={(e) => setField('supervised_by', e.target.value)} disabled={teamRole === 'maestro'}>
                        <option value="">Elige un maestro…</option>
                        {maestros.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                        {teamRole === 'maestro' && !maestros.some((m) => m.id === user.id) && <option value={user.id}>{user.full_name}</option>}
                      </select>
                    </div>
                  )}
                  <div className="k-field">
                    <label htmlFor="tm-pct">{form.role === 'auxiliar' ? 'Lo que gana el auxiliar' : 'Porcentaje de la mano de obra'}</label>
                    <div className="tm-pct"><input id="tm-pct" className="k-input" inputMode="decimal" value={form.commission_percentage} onChange={(e) => setField('commission_percentage', e.target.value.replace(/[^\d.]/g, ''))} /><span>%</span></div>
                    {form.role === 'auxiliar' && <span className="k-hint">Máximo permitido: {cap}%. El resto de la mano de obra es del maestro.</span>}
                    {pctError && <span className="tm-err">{pctError}</span>}
                  </div>
                  <div className="tm-example">
                    <span>Ejemplo con $1,000 de mano de obra</span>
                    <b className="tnum">{`$${((Number(form.commission_percentage) || 0) * 10).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}</b>
                    {form.role === 'auxiliar' && <small>para el auxiliar · ${(1000 - (Number(form.commission_percentage) || 0) * 10).toLocaleString('es-MX', { minimumFractionDigits: 2 })} para el maestro</small>}
                  </div>
                </div>
              </section>
            )}

            {/* 4 Permisos */}
            <section className="tm-step">
              <h4><span>{form.role === 'admin' || form.role === 'owner' ? 3 : 4}</span> Qué puede hacer</h4>
              {form.role === 'auxiliar' && (
                <Switch label="Puede ver Conversaciones de WhatsApp" hint="Solo si lo marcas, este auxiliar verá la bandeja del taller." checked={form.can_view_inbox} onChange={(v) => setField('can_view_inbox', v)} />
              )}
              {['admin', 'maestro'].includes(form.role) && <p className="tm-p">Ve Conversaciones de WhatsApp automáticamente por su rol.</p>}
              {isManager && <Switch label="Aparece al agendar citas en línea" hint="Los clientes lo ven en la lista de quién atiende. Necesita teléfono para recibir los avisos." checked={form.online_booking_visible} onChange={(v) => setField('online_booking_visible', v)} />}
              <button type="button" className="tm-link" onClick={() => setShowFine((v) => !v)}>{showFine ? 'Ocultar ajuste fino' : 'Ajuste fino de permisos'}</button>
              {showFine && (
                <div className="tm-perms">
                  {PERMS.map((p) => (
                    <Switch key={p.key} label={p.label} checked={!!form.permissions[p.key]} onChange={(v) => setForm((f) => ({ ...f, permissions: { ...f.permissions, [p.key]: v } }))} />
                  ))}
                </div>
              )}
            </section>

            {formErrors.length > 0 && (
              <div className="k-note k-note--warn"><AlertTriangle size={16} /><div>{formErrors.map((e) => <div key={e}>{e}</div>)}</div></div>
            )}

            {!form.creating && form.role !== 'owner' && (
              <div className="tm-danger">
                <button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={() => toggleActive(members.find((x) => x.id === form.id) || { id: form.id, full_name: form.full_name })}>
                  {members.find((x) => x.id === form.id)?.is_active === false ? <><UserCheck size={15} /> Activar</> : <><UserX size={15} /> Desactivar</>}
                </button>
                {isOwner && <button type="button" className="k-btn k-btn--danger k-btn--sm" onClick={() => setConfirm({ kind: 'permanent', member: form })}><Trash2 size={15} /> Eliminar definitivamente</button>}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Confirmación */}
      <Drawer
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'permanent' ? 'Eliminar definitivamente' : 'Quitar del taller'}
        width={420}
        footer={(
          <>
            <button type="button" className="k-btn k-btn--ghost" onClick={() => setConfirm(null)}>Cancelar</button>
            <button type="button" className="k-btn k-btn--red" onClick={doConfirm}>{confirm?.kind === 'permanent' ? 'Eliminar para siempre' : 'Quitar'}</button>
          </>
        )}
      >
        {confirm && (
          <div className="tm-confirm">
            <p><strong>{confirm.member.full_name}</strong></p>
            {confirm.kind === 'permanent' ? (
              <div className="k-note k-note--red"><AlertTriangle size={16} /><div>Se borra la cuenta completa, sus comisiones, solicitudes y su sesión. Sus órdenes se conservan sin mecánico asignado. <b>No se puede deshacer.</b></div></div>
            ) : (
              <div className="k-note k-note--warn"><AlertTriangle size={16} /><div>Pierde el acceso al taller. Se conserva su historial de órdenes y comisiones, y se puede volver a agregar.</div></div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
