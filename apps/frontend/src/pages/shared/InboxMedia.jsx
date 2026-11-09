/* Archivos de la bandeja de Conversaciones: audios y notas de voz (con reproductor), stickers, imágenes, videos y documentos,
   más la grabadora de notas de voz. Los archivos se piden al servidor SOLO cuando se necesitan (el servidor los baja de WhatsApp
   la primera vez y los conserva). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, FileText, Film, Loader2, Pause, Play } from 'lucide-react';
import { inboxService } from '../../lib/api';

/* ---------- Un solo audio suena a la vez ---------- */
let playingAudio = null;
const stopOthers = (current) => { if (playingAudio && playingAudio !== current) playingAudio.pause(); playingAudio = current; };

const LABEL_RE = /^\[(Imagen|Sticker|Nota de voz|Audio|Video|Documento)\]\s*/;
/** Texto del mensaje sin la etiqueta "[Sticker]"…: si trae pie de foto, solo se muestra el pie. */
export const captionOf = (m) => (m.media ? String(m.body || '').replace(LABEL_RE, '') : m.body);

const fmtTime = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

/* ---------- Baja el archivo de un mensaje (con permiso) y lo deja como URL de objeto ---------- */
function useMessageFile(media) {
  const [state, setState] = useState(media.localUrl ? 'ok' : 'idle'); // idle | loading | ok | error
  const [url, setUrl] = useState(media.localUrl || null);
  const [error, setError] = useState('');
  const made = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (made.current) URL.revokeObjectURL(made.current); }; }, []);
  const load = useCallback(async () => {
    if (url) return url;
    setState('loading'); setError('');
    try {
      const r = await inboxService.messageMediaBlob(media.message_id);
      if (!alive.current) { URL.revokeObjectURL(r.url); return null; }
      made.current = r.url; setUrl(r.url); setState('ok');
      return r.url;
    } catch (e) {
      if (alive.current) { setState('error'); setError(e?.message || 'No se pudo cargar el archivo.'); }
      return null;
    }
  }, [media.message_id, url]);
  return { state, url, error, load };
}

/* ---------- Audio / nota de voz ---------- */
function AudioPlayer({ media, out }) {
  const file = useMessageFile(media);
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(Number(media.seconds) || 0);
  const [rate, setRate] = useState(1);

  const toggle = async () => {
    const a = ref.current;
    if (!a) return;
    if (!a.src) {
      const u = await file.load();
      if (!u) return;
      a.src = u;
    }
    if (a.paused) { stopOthers(a); try { await a.play(); } catch { /* el navegador bloqueó la reproducción */ } } else a.pause();
  };
  const seek = (e) => { const a = ref.current; if (a && dur) { a.currentTime = (Number(e.target.value) / 100) * dur; setCur(a.currentTime); } };
  const nextRate = () => { const r = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1; setRate(r); if (ref.current) ref.current.playbackRate = r; };
  const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div className={`ib-audio${out ? ' is-out' : ''}`}>
      <audio
        ref={ref}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); e.currentTarget.playbackRate = rate; }}
      />
      <button type="button" className="ib-audio__btn" onClick={toggle} aria-label={playing ? 'Pausar audio' : 'Reproducir audio'}>
        {file.state === 'loading' ? <Loader2 size={20} className="ib-spin" /> : playing ? <Pause size={20} /> : <Play size={20} />}
      </button>
      <div className="ib-audio__main">
        <input
          type="range" min="0" max="100" step="0.5" value={pct} onChange={seek}
          className="ib-audio__bar" style={{ '--p': `${pct}%` }} aria-label="Posición del audio" disabled={!file.url}
        />
        <div className="ib-audio__meta">
          <span className="ib-audio__time">{playing || cur > 0 ? fmtTime(cur) : fmtTime(dur)}</span>
          {file.state === 'error' && <span className="ib-audio__err" title={file.error}><AlertCircle size={12} /> No disponible</span>}
        </div>
      </div>
      <button type="button" className="ib-audio__rate" onClick={nextRate} aria-label="Velocidad de reproducción">{rate}x</button>
    </div>
  );
}

/* ---------- Imagen y sticker (se cargan solas al aparecer) ---------- */
function PictureMedia({ media, sticker }) {
  const file = useMessageFile(media);
  const { state, load } = file;
  useEffect(() => { if (state === 'idle') load(); }, [state, load]);
  if (file.state === 'error') return <div className={`ib-media ib-media--err${sticker ? ' is-sticker' : ''}`}><AlertCircle size={16} /> {sticker ? 'Sticker no disponible' : 'Imagen no disponible'}</div>;
  if (!file.url) return <div className={`ib-media ib-media--load${sticker ? ' is-sticker' : ''}`}><Loader2 size={18} className="ib-spin" /></div>;
  if (sticker) return <img className="ib-sticker" src={file.url} alt="Sticker" />;
  return <a href={file.url} target="_blank" rel="noreferrer"><img className="ib-media" src={file.url} alt="Imagen del chat" /></a>;
}

/* ---------- Video (se baja al tocar) ---------- */
function VideoMedia({ media }) {
  const file = useMessageFile(media);
  if (file.url) return <video className="ib-video" src={file.url} controls autoPlay playsInline />;
  return (
    <button type="button" className="ib-filecard ib-filecard--video" onClick={file.load} disabled={file.state === 'loading'}>
      <span className="ib-filecard__ico">{file.state === 'loading' ? <Loader2 size={22} className="ib-spin" /> : <Film size={22} />}</span>
      <span className="ib-filecard__txt"><b>Video</b><small>{file.state === 'error' ? file.error : (Number(media.seconds) ? `${fmtTime(media.seconds)} · toca para verlo` : 'Toca para verlo')}</small></span>
    </button>
  );
}

/* ---------- Documento (se baja al tocar) ---------- */
function DocumentMedia({ media }) {
  const file = useMessageFile(media);
  const download = async () => {
    const u = await file.load();
    if (!u) return;
    const a = document.createElement('a');
    a.href = u; a.download = media.name || 'documento'; document.body.appendChild(a); a.click(); a.remove();
  };
  return (
    <button type="button" className="ib-filecard" onClick={download} disabled={file.state === 'loading'}>
      <span className="ib-filecard__ico">{file.state === 'loading' ? <Loader2 size={22} className="ib-spin" /> : <FileText size={22} />}</span>
      <span className="ib-filecard__txt"><b>{media.name || 'Documento'}</b><small>{file.state === 'error' ? file.error : 'Toca para descargar'}</small></span>
      <Download size={18} className="ib-filecard__dl" />
    </button>
  );
}

/** Dibuja el archivo de un mensaje según su tipo. */
export function MessageMedia({ m }) {
  const media = m.media;
  if (!media) return null;
  const out = m.direction === 'out';
  switch (media.type) {
    case 'ptt':
    case 'audio': return <AudioPlayer media={media} out={out} />;
    case 'sticker': return <PictureMedia media={media} sticker />;
    case 'image': return <PictureMedia media={media} />;
    case 'video': return <VideoMedia media={media} />;
    case 'document': return <DocumentMedia media={media} />;
    default: return <DocumentMedia media={media} />;
  }
}

/* ---------- Grabadora de notas de voz ---------- */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
export const MAX_SECONDS = 300; // 5 minutos

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
  fr.onerror = () => reject(new Error('No se pudo leer el audio.'));
  fr.readAsDataURL(blob);
});

/**
 * Grabadora: `start()` pide el micrófono y empieza; `stop()` termina y devuelve { blob, mime, seconds, base64 };
 * `cancel()` descarta. `state`: idle | recording.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const rec = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const timer = useRef(null);
  const startedAt = useRef(0);

  const release = useCallback(() => {
    clearInterval(timer.current); timer.current = null;
    if (stream.current) { stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; }
    rec.current = null; chunks.current = [];
    setSeconds(0); setState('idle');
  }, []);

  const cancel = useCallback(() => {
    const r = rec.current;
    if (r && r.state !== 'inactive') { r.onstop = null; try { r.stop(); } catch { /* ya estaba detenida */ } }
    release();
  }, [release]);

  useEffect(() => () => cancel(), [cancel]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Este navegador no permite grabar audio.');
    let s;
    try { s = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { throw new Error('Permite el micrófono en el navegador para grabar notas de voz.'); }
    stream.current = s;
    const mime = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
    rec.current = r;
    startedAt.current = Date.now();
    r.start(250);
    setState('recording'); setSeconds(0);
    timer.current = setInterval(() => {
      const sec = Math.round((Date.now() - startedAt.current) / 1000);
      setSeconds(sec);
    }, 250);
  }, []);

  const stop = useCallback(() => new Promise((resolve, reject) => {
    const r = rec.current;
    if (!r) { reject(new Error('No hay una grabación en curso.')); return; }
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    r.onstop = async () => {
      const type = r.mimeType || 'audio/webm';
      const blob = new Blob(chunks.current, { type });
      release();
      if (!blob.size) { reject(new Error('El audio quedó vacío.')); return; }
      try { resolve({ blob, mime: type, seconds: elapsed, base64: await blobToBase64(blob) }); } catch (e) { reject(e); }
    };
    try { r.stop(); } catch (e) { release(); reject(e); }
  }), [release]);

  return { state, seconds, start, stop, cancel, fmt: fmtTime };
}
