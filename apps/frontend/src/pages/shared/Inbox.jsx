import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Search, ArrowLeft, Send, EyeOff, UserRound, Bike, ClipboardList, CalendarClock, Plus, Printer,
  Check, CheckCheck, Clock, AlertCircle, MessageSquare, Bot, Smartphone, ImageOff, PanelRight, Loader2, RefreshCw, History, Mic, Trash2, UserCheck,
} from 'lucide-react';
import { inboxService, printService } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Chip, Drawer, Segmented, Skeleton, fmtWhen } from '../../components/ui/kit';
import { MessageMedia, captionOf, useVoiceRecorder, MAX_SECONDS } from './InboxMedia';
import { ChatAvatar, SectionTabs, inSection, firstName } from './InboxParts';
import { AttachButton, AttachPreview, prepareAttachment, attachmentKind, ATTACH_LABELS } from './InboxAttach';
import './Inbox.css';

const POLL_MS = 4000;

const fmtPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  const l = d.length >= 10 ? d.slice(-10) : d;
  return l.length === 10 ? `${l.slice(0, 3)} ${l.slice(3, 6)} ${l.slice(6)}` : (p || '');
};
/** '[Nota de voz]' -> 'Nota de voz'; '[Imagen] pie' -> 'Imagen: pie' */
const cleanPreview = (p) => String(p || '').replace(/^\[([^\]]+)\]\s*(.*)$/, (_m, a, b) => (b ? a + ': ' + b : a));
const nameOf = (c) => c?.client?.full_name || c?.display_name || fmtPhone(c?.phone) || 'Número sin nombre';

function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Hoy';
  if (d.toDateString() === y.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

function Ticks({ status }) {
  if (status === 'failed') return <AlertCircle size={13} className="ib-tick ib-tick--fail" aria-label="No se envió" />;
  if (status === 'queued') return <Clock size={13} className="ib-tick" aria-label="En cola" />;
  if (status === 'read') return <CheckCheck size={14} className="ib-tick ib-tick--read" aria-label="Leído" />;
  if (status === 'delivered') return <CheckCheck size={14} className="ib-tick" aria-label="Entregado" />;
  return <Check size={13} className="ib-tick" aria-label="Enviado" />;
}

/* Imagen protegida: se baja con el JWT y se muestra como URL de objeto */
function MediaImage({ media }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let off = false;
    let made = null;
    inboxService.mediaBlobUrl(media.id).then((u) => { made = u; if (!off) setUrl(u); else URL.revokeObjectURL(u); }).catch(() => { if (!off) setErr(true); });
    return () => { off = true; if (made) URL.revokeObjectURL(made); };
  }, [media.id]);
  if (err) return <div className="ib-media ib-media--err"><ImageOff size={18} /> Imagen no disponible</div>;
  if (!url) return <div className="ib-media ib-media--load"><Loader2 size={18} className="ib-spin" /></div>;
  return <a href={url} target="_blank" rel="noreferrer"><img className="ib-media" src={url} alt="Imagen del chat" /></a>;
}

function Bubble({ m }) {
  const out = m.direction === 'out';
  const origin = m.origin;
  const isSticker = m.media?.type === 'sticker';
  const text = captionOf(m);
  return (
    <div className={`ib-msg ${out ? 'is-out' : 'is-in'} ib-msg--${origin}${isSticker ? ' ib-msg--sticker' : ''}`}>
      <div className="ib-bubble">
        {out && origin === 'auto' && <span className="ib-tag"><Bot size={11} /> Mensaje automático</span>}
        {out && origin === 'phone' && <span className="ib-tag"><Smartphone size={11} /> Desde el teléfono</span>}
        {out && origin === 'panel' && m.sent_by?.full_name && <span className="ib-tag">{m.sent_by.full_name.split(' ')[0]}</span>}
        {m.media && <MessageMedia m={m} />}
        {text && <p>{text}</p>}
        <span className="ib-meta">
          {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
          {out && <Ticks status={m.status} />}
        </span>
      </div>
    </div>
  );
}

function InboxView() {
  const { pathname } = useLocation();
  const base = pathname.startsWith('/admin') ? '/admin' : '/mechanic';
  const { isManager, teamRole } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [list, setList] = useState([]);
  const [listState, setListState] = useState('loading');
  const [q, setQ] = useState('');
  const [onlyUnread, setOnlyUnread] = useState('todas');
  // Sección del CRM: all | me | none | <id de maestro>. Un maestro empieza en "Mis chats"; el administrador, en "Todos".
  const [section, setSection] = useState(params.get('s') || (teamRole && !['owner', 'admin'].includes(teamRole) ? 'me' : 'all'));
  const [sections, setSections] = useState(null);
  const sectionTouched = useRef(!!params.get('s'));
  const [attach, setAttach] = useState(null); // { file, asDocument } esperando confirmar el envío
  const [attachBusy, setAttachBusy] = useState(false);
  const [activeId, setActiveId] = useState(params.get('c') || null);
  const [info, setInfo] = useState(null); // ficha de la conversación abierta
  const [msgs, setMsgs] = useState([]);
  const [msgState, setMsgState] = useState('idle');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [sync, setSync] = useState({ busy: false, kind: '', msg: '' }); // importación manual de chats
  const [older, setOlder] = useState({ loading: false, none: false, note: '' }); // mensajes anteriores del chat abierto
  const recorder = useVoiceRecorder();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const sinceRef = useRef(new Date(0).toISOString());
  const endRef = useRef(null);
  const stickRef = useRef(true);
  const scrollerRef = useRef(null);
  const activeRef = useRef(null);
  activeRef.current = activeId;
  const sectionRef = useRef(section);
  sectionRef.current = section;
  const ownIdsRef = useRef([]);
  ownIdsRef.current = sections?.own_ids || [];

  /* ---------------------------- Lista ---------------------------- */
  const loadList = useCallback(async () => {
    try {
      const r = await inboxService.conversations({ q, unread: onlyUnread === 'no_leidas', owner: section });
      setList(r.items || []);
      setListState('ok');
      sinceRef.current = new Date().toISOString();
    } catch { setListState((s) => (s === 'ok' ? 'ok' : 'error')); }
  }, [q, onlyUnread, section]);

  useEffect(() => { setListState((s) => (s === 'ok' ? s : 'loading')); const t = setTimeout(loadList, q ? 250 : 0); return () => clearTimeout(t); }, [loadList, q]);

  /* Secciones (contadores por maestro): al abrir y cada 10 s */
  const loadSections = useCallback(async () => {
    try { setSections(await inboxService.sections()); } catch { /* se conserva lo último */ }
  }, []);
  useEffect(() => {
    loadSections();
    const t = setInterval(() => { if (!document.hidden) loadSections(); }, 10000);
    return () => clearInterval(t);
  }, [loadSections]);
  // Un maestro sin chats asignados todavía no se queda en una lista vacía: pasa a "Todos" (si no eligió otra cosa).
  useEffect(() => {
    if (sections && !sectionTouched.current && section === 'me' && sections.mine.total === 0 && sections.all.total > 0) setSection('all');
  }, [sections, section]);
  const changeSection = (id) => {
    sectionTouched.current = true;
    setSection(id);
    setParams((p) => { const n = new URLSearchParams(p); if (id === 'all') n.delete('s'); else n.set('s', id); return n; }, { replace: true });
  };

  const mergeConv = useCallback((items) => {
    if (!items?.length) return;
    setList((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]));
      items.forEach((c) => {
        const merged = { ...(map.get(c.id) || {}), ...c };
        // Con la ficha completa se respeta la sección activa; un cambio parcial (leído, vista previa) solo actualiza lo que ya está.
        if (!('assigned_to' in merged) && !map.has(c.id)) return;
        if ('assigned_to' in merged && !inSection(merged, sectionRef.current, ownIdsRef.current)) map.delete(c.id);
        else map.set(c.id, merged);
      });
      return [...map.values()].sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
    });
  }, []);

  /* ---------------------------- Mensajes ---------------------------- */
  const loadMsgs = useCallback(async (id, { quiet = false } = {}) => {
    if (!quiet) setMsgState('loading');
    try {
      const r = await inboxService.messages(id, { limit: 60 });
      if (activeRef.current !== id) return;
      setMsgs((prev) => {
        const incoming = r.items || [];
        if (quiet) {
          const have = new Set(prev.map((m) => m.id));
          const pending = prev.filter((m) => String(m.id).startsWith('tmp-'));
          const fresh = incoming.filter((m) => !have.has(m.id));
          // Reemplaza los estados (ticks) de lo ya cargado y agrega lo nuevo
          const byId = new Map(incoming.map((m) => [m.id, m]));
          const merged = prev.filter((m) => !String(m.id).startsWith('tmp-')).map((m) => byId.get(m.id) || m);
          return [...merged, ...fresh, ...pending.filter((p) => !incoming.some((m) => m.direction === 'out' && m.body === p.body && Math.abs(new Date(m.created_at) - new Date(p.created_at)) < 60000))];
        }
        return incoming;
      });
      setMsgState('ok');
    } catch { if (!quiet) setMsgState('error'); }
  }, []);

  const open = useCallback(async (id) => {
    setActiveId(id);
    setParams((p) => { const n = new URLSearchParams(p); n.set('c', id); return n; }, { replace: true });
    setMsgs([]);
    setInfo(null);
    setOlder({ loading: false, none: false, note: '' });
    stickRef.current = true;
    loadMsgs(id);
    try { setInfo(await inboxService.conversation(id)); } catch { /* sin ficha */ }
    inboxService.markRead(id).then(() => setList((l) => l.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)))).catch(() => {});
  }, [loadMsgs, setParams]);

  useEffect(() => { if (activeId && !info && msgs.length === 0) open(activeId); /* abre desde ?c= */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeChat = () => {
    setActiveId(null); setInfo(null); setMsgs([]);
    setParams((p) => { const n = new URLSearchParams(p); n.delete('c'); return n; }, { replace: true });
  };

  /* ---------------------------- Polling cada 4 s ---------------------------- */
  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await inboxService.updates(sinceRef.current);
        if (r.now) sinceRef.current = r.now;
        if (r.conversations?.length) {
          mergeConv(r.conversations);
          const cur = activeRef.current;
          const touched = r.conversations.find((c) => c.id === cur);
          if (touched) {
            loadMsgs(cur, { quiet: true });
            if (touched.unread_count > 0) { inboxService.markRead(cur).catch(() => {}); mergeConv([{ id: cur, unread_count: 0 }]); }
          }
        }
      } catch { /* siguiente intento */ }
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [mergeConv, loadMsgs]);

  /* Scroll al final cuando llegan mensajes y el usuario estaba abajo */
  useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs, activeId]);
  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  /* ---------------------------- Enviar ---------------------------- */
  const send = async () => {
    const t = text.trim();
    if (!t || !activeId || sending) return;
    setSending(true);
    const tmp = { id: `tmp-${Date.now()}`, direction: 'out', origin: 'panel', body: t, status: 'queued', created_at: new Date().toISOString(), sent_by: null };
    stickRef.current = true;
    setMsgs((m) => [...m, tmp]);
    setText('');
    try {
      const saved = await inboxService.send(activeId, t);
      setMsgs((m) => m.map((x) => (x.id === tmp.id ? { ...tmp, ...saved } : x)));
      mergeConv([{ id: activeId, last_message_preview: t, last_message_at: new Date().toISOString(), last_direction: 'out' }]);
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === tmp.id ? { ...x, status: 'failed' } : x)));
      toast.error(e.message || 'No se pudo enviar el mensaje');
    } finally { setSending(false); }
  };
  /* Notas de voz: grabar -> (cancelar | enviar). Se muestra al instante y se reemplaza por la respuesta del servidor. */
  const startVoice = async () => {
    try { await recorder.start(); } catch (e) { toast.error(e.message || 'No se pudo iniciar la grabación'); }
  };
  const sendVoice = async () => {
    if (voiceBusy || !activeId) return;
    if (recorder.seconds < 1) { recorder.cancel(); toast.error('La nota de voz es muy corta.'); return; }
    setVoiceBusy(true);
    let rec;
    try { rec = await recorder.stop(); } catch (e) { setVoiceBusy(false); toast.error(e.message || 'No se pudo terminar la grabación'); return; }
    const localUrl = URL.createObjectURL(rec.blob);
    const tmp = { id: `tmp-${Date.now()}`, direction: 'out', origin: 'panel', body: '[Nota de voz]', status: 'queued', created_at: new Date().toISOString(), sent_by: null,
      media: { type: 'ptt', seconds: rec.seconds, available: true, localUrl, message_id: null } };
    stickRef.current = true;
    setMsgs((m) => [...m, tmp]);
    try {
      const saved = await inboxService.sendVoice(activeId, { audio_base64: rec.base64, mime: rec.mime, seconds: rec.seconds });
      setMsgs((m) => m.map((x) => (x.id === tmp.id ? { ...saved, media: { ...(saved.media || {}), localUrl } } : x)));
      mergeConv([{ id: activeId, last_message_preview: 'Nota de voz', last_message_at: new Date().toISOString(), last_direction: 'out' }]);
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === tmp.id ? { ...x, status: 'failed' } : x)));
      toast.error(e.message || 'No se pudo enviar la nota de voz');
    } finally { setVoiceBusy(false); }
  };
  useEffect(() => { if (recorder.state === 'recording' && recorder.seconds >= MAX_SECONDS) sendVoice(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.seconds, recorder.state]);
  // Cambiar de conversación descarta una grabación a medias
  useEffect(() => { recorder.cancel(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /* Foto, video o documento: se elige (clip, pegar o arrastrar), se previsualiza con pie de foto y se envía. */
  const pickFile = (file, asDocument = false) => {
    if (!activeId || !file) return;
    if (file.size > 60 * 1024 * 1024) { toast.error('El archivo es demasiado grande (máximo 12 MB).'); return; }
    const asDoc = asDocument || !/^(image|video)\//.test(file.type);
    setAttach({ file, asDocument: asDoc, url: asDoc ? null : URL.createObjectURL(file) });
  };
  const closeAttach = () => { setAttach((a) => { if (a?.url) URL.revokeObjectURL(a.url); return null; }); };
  const sendAttach = async (caption) => {
    if (!attach || !activeId || attachBusy) return;
    setAttachBusy(true);
    let prepared;
    try { prepared = await prepareAttachment(attach.file, attach.asDocument); } catch (e) { setAttachBusy(false); toast.error(e.message || 'No se pudo preparar el archivo'); return; }
    const { blob, ...payload } = prepared;
    const kind = attachmentKind(payload.mime, payload.as_document);
    const localUrl = URL.createObjectURL(blob);
    const body = caption ? `[${ATTACH_LABELS[kind]}] ${caption}` : `[${ATTACH_LABELS[kind]}]`;
    const tmp = { id: `tmp-${Date.now()}`, direction: 'out', origin: 'panel', body, status: 'queued', created_at: new Date().toISOString(), sent_by: null,
      media: { type: kind, name: payload.name, mime: payload.mime, available: true, localUrl, message_id: null } };
    const id = activeId;
    closeAttach(); setAttachBusy(false);
    stickRef.current = true;
    setMsgs((m) => [...m, tmp]);
    try {
      const saved = await inboxService.sendAttachment(id, { ...payload, caption });
      setMsgs((m) => m.map((x) => (x.id === tmp.id ? { ...saved, media: { ...(saved.media || {}), localUrl } } : x)));
      mergeConv([{ id, last_message_preview: body, last_message_at: new Date().toISOString(), last_direction: 'out' }]);
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === tmp.id ? { ...x, status: 'failed' } : x)));
      toast.error(e.message || 'No se pudo enviar el archivo');
    }
  };
  const onPaste = (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type));
    if (f) { e.preventDefault(); pickFile(f, false); }
  };
  const onDrop = (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f || !activeId) return;
    e.preventDefault();
    pickFile(f, false);
  };

  /* Pasar el chat a otro maestro (o dejar que se asigne solo) */
  const assignTo = async (profileId) => {
    if (!activeId) return;
    try {
      const r = await inboxService.assign(activeId, profileId);
      setInfo((i) => (i ? { ...i, assigned_to: r.assigned_to } : i));
      mergeConv([{ id: activeId, assigned_to: r.assigned_to }]);
      loadSections();
      toast.success(r.assigned_to ? `Chat asignado a ${firstName(r.assigned_to.full_name)}` : 'Chat sin responsable (se asigna solo)');
    } catch (e) { toast.error(e.message || 'No se pudo asignar el chat'); }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  /* Importar los chats recientes de WhatsApp (corre en segundo plano en el bot). El polling de 4 s recoge lo nuevo. */
  const syncChats = async () => {
    if (sync.busy) return;
    setSync({ busy: true, kind: 'info', msg: 'Importando tus chats… aparecerán en unos segundos' });
    try {
      await inboxService.sync();
      setSync({ busy: false, kind: 'info', msg: 'Importando tus chats… aparecerán en unos segundos' });
      [5000, 12000, 25000].forEach((ms) => setTimeout(loadList, ms));
      setTimeout(() => setSync((s) => (s.kind === 'info' ? { busy: false, kind: '', msg: '' } : s)), 30000);
    } catch (e) {
      setSync({ busy: false, kind: 'error', msg: e?.message || 'No se pudo iniciar la importación.' });
    }
  };

  /* Mensajes anteriores: primero los que ya están guardados; si no quedan, se piden a WhatsApp (como hacer scroll hacia arriba). */
  const loadOlder = async () => {
    const id = activeRef.current;
    if (!id || older.loading) return;
    const first = msgs.find((m) => !String(m.id).startsWith('tmp-'));
    if (!first) return;
    setOlder({ loading: true, none: false, note: '' });
    try {
      let items = (await inboxService.messages(id, { before: first.created_at, limit: 80 })).items || [];
      if (!items.length) {
        const r = await inboxService.loadOlder(id);
        if (r?.added > 0) items = (await inboxService.messages(id, { before: first.created_at, limit: 120 })).items || [];
      }
      if (activeRef.current !== id) return;
      if (!items.length) { setOlder({ loading: false, none: true, note: '' }); return; }
      const el = scrollerRef.current;
      const prevH = el ? el.scrollHeight : 0; const prevTop = el ? el.scrollTop : 0;
      stickRef.current = false;
      setMsgs((prev) => { const have = new Set(prev.map((m) => m.id)); return [...items.filter((m) => !have.has(m.id)), ...prev]; });
      requestAnimationFrame(() => { const e2 = scrollerRef.current; if (e2) e2.scrollTop = e2.scrollHeight - prevH + prevTop; });
      setOlder({ loading: false, none: false, note: '' });
    } catch (e) {
      setOlder({ loading: false, none: false, note: e?.message || 'No se pudieron cargar los mensajes anteriores.' });
    }
  };

  const hide = async () => {
    if (!activeId) return;
    try { await inboxService.hide(activeId); setList((l) => l.filter((c) => c.id !== activeId)); closeChat(); toast.success('Conversación oculta. Reaparece si el cliente escribe.'); }
    catch (e) { toast.error(e.message || 'No se pudo ocultar'); }
  };

  const sendTicket = async (orderId) => {
    const { data, error } = await printService.sendTicketWhatsApp(orderId);
    if (error) toast.error(error.message || 'No se pudo enviar el ticket');
    else if (data?.fallback) toast.error('WhatsApp no está conectado');
    else toast.success('Ticket enviado por WhatsApp');
  };

  const activeConv = useMemo(() => list.find((c) => c.id === activeId) || null, [list, activeId]);
  const active = { ...(activeConv || {}), ...(info || {}) };
  const unreadTotal = list.reduce((a, c) => a + (c.unread_count || 0), 0);

  // Mensajes agrupados por día
  const grouped = useMemo(() => {
    const out = [];
    let last = '';
    msgs.forEach((m) => {
      const k = new Date(m.created_at).toDateString();
      if (k !== last) { out.push({ sep: dayLabel(m.created_at), key: `s-${k}` }); last = k; }
      out.push(m);
    });
    return out;
  }, [msgs]);

  const client = info?.client || null;

  /* Pestañas: un maestro ve "Mis chats", "Todos" y "Sin asignar"; el administrador ve además una por cada maestro. */
  const tabItems = useMemo(() => {
    if (!sections) return [];
    const admin = teamRole === 'owner' || teamRole === 'admin';
    const items = [];
    if (!admin || sections.mine.total > 0) items.push({ id: 'me', label: 'Mis chats', ...sections.mine });
    items.push({ id: 'all', label: 'Todos', ...sections.all });
    if (admin) sections.masters.filter((m) => !(sections.own_ids || []).includes(m.id)).forEach((m) => items.push({ id: m.id, label: firstName(m.full_name), total: m.total, unread: m.unread }));
    if (sections.none.total > 0 || section === 'none') items.push({ id: 'none', label: 'Sin asignar', ...sections.none });
    return items;
  }, [sections, teamRole, section]);

  /* Ficha del cliente (columna derecha / cajón) */
  const CardBody = (
    <div className="ib-card">
      <div className="ib-card__who">
        <ChatAvatar conv={active} name={nameOf(active)} size="lg" />
        <div>
          <h3>{nameOf(active)}</h3>
          <p className="mono">{fmtPhone(active.phone)}</p>
          {active.assigned_to && <p className="ib-card__owner"><UserCheck size={13} /> Atiende {firstName(active.assigned_to.full_name)}</p>}
        </div>
      </div>
      {!client && (
        <div className="ib-card__block">
          <p className="ib-p">Este número aún no está registrado como cliente.</p>
          <Link className="k-btn k-btn--sm k-btn--block" to={`/mechanic/new-order?phone=${encodeURIComponent(String(active.phone || '').replace(/\D/g, '').slice(-10))}${active.display_name ? `&name=${encodeURIComponent(active.display_name)}` : ''}`}><UserRound size={15} /> Registrar y crear orden</Link>
        </div>
      )}
      {client && (
        <>
          <Link className="k-btn k-btn--sm k-btn--block" to={`/mechanic/new-order?client=${client.id}`}><Plus size={15} /> Nueva orden</Link>

          <div className="ib-card__block">
            <h4><Bike size={14} /> Motos</h4>
            {(client.motorcycles || []).length === 0 && <p className="ib-p">Sin motos registradas.</p>}
            {(client.motorcycles || []).map((mo) => (
              <div key={mo.id} className="ib-line"><b>{mo.brand} {mo.model}</b><span className="mono">{mo.plates || mo.year || ''}</span></div>
            ))}
          </div>

          <div className="ib-card__block">
            <h4><ClipboardList size={14} /> Órdenes abiertas</h4>
            {(client.open_orders || []).length === 0 && <p className="ib-p">Ninguna por ahora.</p>}
            {(client.open_orders || []).map((o) => (
              <div key={o.id} className="ib-order">
                <Link to={`${base}/order/${o.id}`} className="ib-order__main"><b className="mono">{o.order_number}</b><span>{o.status}{o.motorcycle ? ` · ${o.motorcycle}` : ''}</span></Link>
                <button type="button" className="ib-iconbtn" onClick={() => sendTicket(o.id)} title="Enviar ticket por WhatsApp" aria-label="Enviar ticket por WhatsApp"><Printer size={15} /></button>
              </div>
            ))}
          </div>

          <div className="ib-card__block">
            <h4><CalendarClock size={14} /> Citas próximas</h4>
            {(client.upcoming_appointments || []).length === 0 && <p className="ib-p">Sin citas próximas.</p>}
            {(client.upcoming_appointments || []).map((a) => (
              <Link key={a.id} className="ib-line ib-line--link" to={`/mechanic/appointments?cita=${a.id}`}>
                <b>{new Date(a.scheduled_date).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>
                <span>{a.service_type || 'Servicio'}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      <button type="button" className="k-btn k-btn--ghost k-btn--sm k-btn--block" onClick={hide}><EyeOff size={15} /> Ocultar conversación</button>
    </div>
  );

  return (
    <div className={`ib${activeId ? ' has-chat' : ''}`}>
      {/* ------------------- Lista ------------------- */}
      <section className="ib-list">
        <header className="ib-list__head">
          <div className="ib-list__title">
            <h1>Conversaciones</h1>
            {unreadTotal > 0 && <Chip tone="red">{unreadTotal} sin leer</Chip>}
          </div>
          <button type="button" className="k-btn k-btn--ghost k-btn--sm ib-sync" onClick={syncChats} disabled={sync.busy} title="Importar tus chats de WhatsApp">
            <RefreshCw size={15} className={sync.busy ? 'ib-spin' : ''} /> Sincronizar chats
          </button>
        </header>
        {sync.msg && (
          <div className={`k-note ${sync.kind === 'error' ? 'k-note--red' : 'k-note--info'} ib-sync-note`} role="status">
            {sync.kind === 'error' ? <AlertCircle size={16} /> : <Loader2 size={16} className="ib-spin" />}
            <span>{sync.msg}</span>
          </div>
        )}
        {tabItems.length > 1 && <SectionTabs items={tabItems} value={section} onChange={changeSection} />}
        <div className="ib-list__tools">
          <label className="k-search"><Search size={17} /><input placeholder="Buscar nombre o número" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <Segmented items={[{ id: 'todas', label: 'Todas' }, { id: 'no_leidas', label: 'No leídas' }]} value={onlyUnread} onChange={setOnlyUnread} />
        </div>

        <div className="ib-list__scroll">
          {listState === 'loading' && [0, 1, 2, 3].map((i) => (
            <div key={i} className="ib-item"><Skeleton w={40} h={40} r={8} /><div style={{ flex: 1 }}><Skeleton w="50%" h={13} /><Skeleton w="80%" h={11} style={{ marginTop: 8 }} /></div></div>
          ))}
          {listState === 'error' && <div className="ib-empty"><AlertCircle size={22} /><p>No se pudo cargar la bandeja.</p><button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={loadList}>Reintentar</button></div>}
          {listState === 'ok' && list.length === 0 && (
            <div className="ib-empty">
              <MessageSquare size={26} />
              {q || onlyUnread === 'no_leidas' ? (
                <>
                  <h3>Sin resultados</h3>
                  <p>Prueba con otra búsqueda.</p>
                </>
              ) : section !== 'all' ? (
                <>
                  <h3>{section === 'me' ? 'Aún no tienes chats asignados' : section === 'none' ? 'Todo está asignado' : 'Sin chats en esta sección'}</h3>
                  <p>{section === 'me'
                    ? 'Aquí aparecen los clientes con una orden o cita contigo y los chats que respondes. Mira "Todos" para ver el resto.'
                    : 'Los chats se reparten solos según las órdenes, citas y respuestas; también puedes asignarlos a mano.'}</p>
                  <button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={() => changeSection('all')}>Ver todos los chats</button>
                </>
              ) : (
                <>
                  <h3>Aún no hay conversaciones</h3>
                  <p>Al conectar WhatsApp se importan tus chats recientes. Si no aparecen, toca Sincronizar chats.</p>
                  <button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={syncChats} disabled={sync.busy}>
                    <RefreshCw size={15} className={sync.busy ? 'ib-spin' : ''} /> Sincronizar chats
                  </button>
                </>
              )}
            </div>
          )}
          {list.map((c) => (
            <button key={c.id} type="button" className={`ib-item${c.id === activeId ? ' is-active' : ''}${c.unread_count > 0 ? ' is-unread' : ''}`} onClick={() => open(c.id)}>
              <ChatAvatar conv={c} name={nameOf(c)} size="md" />
              <span className="ib-item__main">
                <span className="ib-item__top"><strong>{nameOf(c)}</strong><time>{fmtWhen(c.last_message_at)}</time></span>
                <span className="ib-item__bot">
                  <span className="ib-item__prev">{c.last_direction === 'out' ? 'Tú: ' : ''}{cleanPreview(c.last_message_preview) || 'Archivo'}</span>
                  {c.assigned_to && section !== c.assigned_to.id && section !== 'me' && <span className="ib-owner" title={`Atiende ${c.assigned_to.full_name || ''}`}>{firstName(c.assigned_to.full_name)}</span>}
                  {c.unread_count > 0 && <span className="ib-badge">{c.unread_count > 99 ? '99+' : c.unread_count}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ------------------- Chat ------------------- */}
      <section className="ib-chat" onDragOver={(e) => { if (activeId && e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }} onDrop={onDrop}>
        {!activeId ? (
          <div className="ib-chat__none">
            <div className="k-empty__ico"><MessageSquare size={26} /></div>
            <h3>Elige una conversación</h3>
            <p>Responde a tus clientes desde el número del taller y ve su ficha al lado.</p>
          </div>
        ) : (
          <>
            <header className="ib-chat__head">
              <button type="button" className="ib-back" onClick={closeChat} aria-label="Volver a la lista"><ArrowLeft size={20} /></button>
              <ChatAvatar conv={active} name={nameOf(active)} size="md" />
              <div className="ib-chat__who">
                <strong>{nameOf(active)}</strong>
                <span className="ib-chat__sub">{active.phone ? fmtPhone(active.phone) : 'Contacto de WhatsApp'}</span>
              </div>
              {sections?.can_assign ? (
                <label className="ib-assign" title="Maestro a cargo de este chat">
                  <UserCheck size={15} />
                  <select value={active.assigned_to?.id || ''} onChange={(e) => assignTo(e.target.value || null)} aria-label="Maestro a cargo">
                    <option value="">Sin asignar</option>
                    {(sections.assignable || []).map((m) => <option key={m.id} value={m.id}>{firstName(m.full_name)}</option>)}
                  </select>
                </label>
              ) : active.assigned_to && <span className="ib-owner ib-owner--head"><UserCheck size={13} /> {firstName(active.assigned_to.full_name)}</span>}
              <button type="button" className="ib-iconbtn ib-cardbtn" onClick={() => setShowCard(true)} aria-label="Ver ficha del cliente"><PanelRight size={18} /></button>
            </header>

            <div className="ib-chat__scroll" ref={scrollerRef} onScroll={onScroll}>
              {msgState === 'loading' && <div className="ib-chat__load"><Loader2 size={20} className="ib-spin" /> Cargando mensajes…</div>}
              {msgState === 'error' && <div className="ib-empty"><AlertCircle size={22} /><p>No se pudieron cargar los mensajes.</p><button type="button" className="k-btn k-btn--ghost k-btn--sm" onClick={() => loadMsgs(activeId)}>Reintentar</button></div>}
              {msgState === 'ok' && msgs.length === 0 && <div className="ib-chat__load">Sin mensajes todavía.</div>}
              {msgState === 'ok' && msgs.length > 0 && (
                <div className="ib-older">
                  {older.none
                    ? <span className="ib-older__end">Ya no hay mensajes anteriores disponibles</span>
                    : <button type="button" className="ib-older__btn" onClick={loadOlder} disabled={older.loading}>
                        {older.loading ? <Loader2 size={15} className="ib-spin" /> : <History size={15} />}
                        {older.loading ? 'Cargando…' : 'Cargar mensajes anteriores'}
                      </button>}
                  {older.note && <span className="ib-older__err">{older.note}</span>}
                </div>
              )}
              {grouped.map((g) => (g.sep
                ? <div key={g.key} className="ib-sep"><span>{g.sep}</span></div>
                : <Bubble key={g.id} m={g} />))}
              <div ref={endRef} />
            </div>

            <footer className="ib-compose">
              {recorder.state === 'recording' ? (
                <div className="ib-rec" role="status" aria-live="polite">
                  <button type="button" className="ib-rec__cancel" onClick={recorder.cancel} aria-label="Cancelar grabación" disabled={voiceBusy}><Trash2 size={20} /></button>
                  <span className="ib-rec__dot" aria-hidden="true" />
                  <span className="ib-rec__time">{recorder.fmt(recorder.seconds)}</span>
                  <span className="ib-rec__hint">Grabando nota de voz…</span>
                  <button type="button" className="ib-send" onClick={sendVoice} disabled={voiceBusy} aria-label="Enviar nota de voz"><Send size={19} /></button>
                </div>
              ) : (
                <>
                  <AttachButton disabled={voiceBusy} onPick={pickFile} />
                  <textarea
                    rows={1}
                    placeholder="Escribe un mensaje…"
                    value={text}
                    onPaste={onPaste}
                    onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`; }}
                    onKeyDown={onKey}
                    aria-label="Mensaje"
                  />
                  {text.trim()
                    ? <button type="button" className="ib-send" onClick={send} disabled={sending} aria-label="Enviar"><Send size={19} /></button>
                    : <button type="button" className="ib-send ib-send--mic" onClick={startVoice} aria-label="Grabar nota de voz"><Mic size={20} /></button>}
                </>
              )}
            </footer>
            <p className="ib-hint">Enter envía · Shift+Enter nueva línea. {isManager ? 'Sale del número del taller.' : 'Sale del número del taller, con tu nombre en el registro.'}</p>
          </>
        )}
      </section>

      {attach && <AttachPreview file={attach.file} asDocument={attach.asDocument} url={attach.url} who={nameOf(active)} busy={attachBusy} onCancel={closeAttach} onSend={sendAttach} />}

      {/* ------------------- Ficha ------------------- */}
      {activeId && <aside className="ib-side">{CardBody}</aside>}
      <Drawer open={showCard} onClose={() => setShowCard(false)} title="Ficha del cliente" width={400}>{CardBody}</Drawer>
    </div>
  );
}

/* Acceso: gerencia y maestros siempre; un auxiliar solo si se marcó "puede ver Conversaciones". */
export default function Inbox() {
  const { canViewInbox } = useAuth();
  if (!canViewInbox) {
    return (
      <div className="k-empty" style={{ margin: '48px auto', maxWidth: 420 }}>
        <div className="k-empty__ico"><MessageSquare size={24} /></div>
        <h3>Sin acceso a Conversaciones</h3>
        <p>Pide a tu maestro o al administrador que active este permiso en tu ficha de Equipo.</p>
      </div>
    );
  }
  return <InboxView />;
}
