/* Piezas del CRM de WhatsApp (Conversaciones): foto de perfil del contacto y secciones por maestro. */
import { useEffect, useState } from 'react';
import { inboxService } from '../../lib/api';
import { Avatar } from '../../components/ui/kit';

/* ---------- Foto de perfil ----------
   La foto de WhatsApp se pide al servidor con el JWT (como cualquier archivo del chat) y se guarda como URL de objeto.
   Caché por conversación + versión (el servidor cambia `avatar` cuando cambia la foto) y de 4 en 4 para no saturar. */
const cache = new Map();   // "id:versión" -> url | null
const pending = new Map(); // "id:versión" -> Promise
const waiting = [];
let active = 0;
const MAX_PARALLEL = 4;

function pump() {
  while (active < MAX_PARALLEL && waiting.length) {
    const job = waiting.shift();
    active += 1;
    job().finally(() => { active -= 1; pump(); });
  }
}

function loadAvatar(key, id) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);
  const p = new Promise((resolve) => {
    waiting.push(async () => {
      try { const url = await inboxService.avatarBlobUrl(id); cache.set(key, url); resolve(url); } catch { resolve(null); }
      pending.delete(key);
    });
    pump();
  });
  pending.set(key, p);
  return p;
}

export function useConvAvatar(id, version) {
  const key = id && version ? `${id}:${version}` : null;
  const [loaded, setLoaded] = useState({}); // "id:versión" -> url, para las que llegan después de pintar
  useEffect(() => {
    if (!key || cache.has(key)) return undefined;
    let off = false;
    loadAvatar(key, id).then((u) => { if (!off) setLoaded((l) => ({ ...l, [key]: u })); });
    return () => { off = true; };
  }, [key, id]);
  if (!key) return null;
  return cache.has(key) ? cache.get(key) : (loaded[key] ?? null);
}

/** Avatar de un chat: la foto de WhatsApp si tiene y, si no, las iniciales. */
export function ChatAvatar({ conv, name, size = 'md' }) {
  const url = useConvAvatar(conv?.id, conv?.avatar);
  return <Avatar name={name} size={size} src={url} />;
}

/* ---------- Secciones por maestro ----------
   items = [{ id, label, total, unread }]; `id` es el filtro: all | me | none | <id de maestro>. */
export function SectionTabs({ items, value, onChange }) {
  return (
    <div className="ib-sections" role="tablist" aria-label="Secciones de chats">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          className={`ib-section${value === it.id ? ' is-active' : ''}`}
          onClick={() => onChange(it.id)}
          title={`${it.label}${it.total != null ? ` · ${it.total} chats` : ''}`}
        >
          <span className="ib-section__name">{it.label}</span>
          {it.unread > 0 && <span className="ib-section__badge">{it.unread > 99 ? '99+' : it.unread}</span>}
        </button>
      ))}
    </div>
  );
}

/** ¿Este chat pertenece a la sección activa? (para aplicar al instante lo que llega por el sondeo) */
export function inSection(conv, section, ownIds = []) {
  if (!section || section === 'all') return true;
  const owner = conv.assigned_to?.id || null;
  if (section === 'none') return !owner;
  if (section === 'me') return !!owner && ownIds.includes(owner);
  return owner === section;
}

export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
