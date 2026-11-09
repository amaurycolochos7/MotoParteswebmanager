/* Adjuntos de Conversaciones: botón del clip (foto/video o documento) y vista previa con pie de foto antes de enviar. */
import { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Send, X } from 'lucide-react';

export const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_SIDE = 1600; // las fotos se reducen a este lado máximo (como hace WhatsApp) para que suban rápido

const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
  fr.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  fr.readAsDataURL(file);
});

/** Reduce una foto (JPG/PNG/WebP) a MAX_SIDE y la pasa a JPEG; si no mejora, deja el original. Devuelve un Blob. */
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1048576) { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

/** Tipo con el que se enviará (igual que decide el servidor): image | video | document. */
export function attachmentKind(mime, asDocument) {
  const m = String(mime || '').toLowerCase();
  if (asDocument) return 'document';
  if (/^image\/(jpeg|jpg|png|webp|gif)/.test(m)) return 'image';
  if (/^video\/(mp4|quicktime|3gpp)/.test(m)) return 'video';
  return 'document';
}
export const ATTACH_LABELS = { image: 'Imagen', video: 'Video', document: 'Documento' };

/** Prepara el archivo para enviarlo: { file_base64, mime, name, as_document, blob } (con foto reducida si aplica). */
export async function prepareAttachment(file, asDocument) {
  const blob = asDocument ? file : await shrinkImage(file);
  if (blob.size > MAX_FILE_BYTES) throw new Error(`El archivo pesa ${fmtSize(blob.size)}; el máximo es 12 MB.`);
  const converted = blob !== file;
  const name = converted ? String(file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg' : (file.name || 'archivo');
  return { file_base64: await fileToBase64(blob), mime: converted ? 'image/jpeg' : (file.type || 'application/octet-stream'), name, as_document: !!asDocument, blob };
}

/** Botón del clip con menú: Foto o video / Documento. `onPick(file, asDocument)`. */
export function AttachButton({ disabled, onPick }) {
  const [open, setOpen] = useState(false);
  const media = useRef(null);
  const docs = useRef(null);
  const wrap = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const chosen = (asDocument) => (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    setOpen(false);
    if (f) onPick(f, asDocument);
  };
  return (
    <div className="ib-attach" ref={wrap}>
      <button type="button" className="ib-clip" onClick={() => setOpen((o) => !o)} disabled={disabled} aria-label="Adjuntar archivo" aria-haspopup="menu" aria-expanded={open}>
        <Paperclip size={21} />
      </button>
      {open && (
        <div className="ib-attach__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => media.current?.click()}><span className="ib-attach__ico ib-attach__ico--photo"><ImageIcon size={18} /></span>Foto o video</button>
          <button type="button" role="menuitem" onClick={() => docs.current?.click()}><span className="ib-attach__ico ib-attach__ico--doc"><FileText size={18} /></span>Documento</button>
        </div>
      )}
      <input ref={media} type="file" accept="image/*,video/mp4,video/quicktime,video/3gpp" hidden onChange={chosen(false)} />
      <input ref={docs} type="file" hidden onChange={chosen(true)} />
    </div>
  );
}

/** Vista previa a pantalla completa con pie de foto. `url` es la URL de objeto del archivo (la crea y libera quien lo abre). */
export function AttachPreview({ file, asDocument, url, who, busy, onCancel, onSend }) {
  const [caption, setCaption] = useState('');
  const isImage = !asDocument && /^image\//.test(file.type);
  const isVideo = !asDocument && /^video\//.test(file.type);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [busy, onCancel]);
  const submit = (e) => { e?.preventDefault(); if (!busy) onSend(caption.trim()); };
  return (
    <div className="ib-modal" role="dialog" aria-modal="true" aria-label="Enviar archivo">
      <form className="ib-prev" onSubmit={submit}>
        <header className="ib-prev__head">
          <button type="button" className="ib-iconbtn" onClick={onCancel} disabled={busy} aria-label="Cancelar"><X size={20} /></button>
          <div><strong>Enviar {isImage ? 'foto' : isVideo ? 'video' : 'documento'}</strong>{who && <span>a {who}</span>}</div>
        </header>
        <div className="ib-prev__body">
          {isImage && url && <img src={url} alt="Vista previa" />}
          {isVideo && url && <video src={url} controls playsInline />}
          {!isImage && !isVideo && (
            <div className="ib-prev__doc">
              <span className="ib-prev__docico"><FileText size={34} /></span>
              <b>{file.name}</b>
              <small>{fmtSize(file.size)}</small>
            </div>
          )}
        </div>
        <footer className="ib-prev__foot">
          <input
            type="text" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={1000}
            placeholder="Añade un comentario…" aria-label="Pie de foto" disabled={busy} autoFocus
          />
          <button type="submit" className="ib-send" disabled={busy} aria-label="Enviar archivo">
            {busy ? <Loader2 size={19} className="ib-spin" /> : <Send size={19} />}
          </button>
        </footer>
      </form>
    </div>
  );
}
