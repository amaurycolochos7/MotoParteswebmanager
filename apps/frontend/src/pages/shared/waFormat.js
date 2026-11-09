// Formato de texto de WhatsApp, con sus mismas reglas (sin dependencias; se prueba desde apps/api/test/wa-format.test.js):
//   *negritas*   _cursiva_   ~tachado~   `código`   ```bloque de código```
//   líneas que empiezan con "* " o "- "  -> viñeta •      "> texto" -> cita      enlaces http(s):// y www.
// Reglas de WhatsApp: la marca que abre va al inicio o después de un espacio/signo y NO pegada a un espacio por dentro;
// la que cierra va justo después de una letra y antes de un espacio/signo/final. Así "snake_case" o "2 * 3 * 4" no se tocan.
// Devuelve bloques: { kind:'pre', text } | { kind:'line'|'bullet'|'quote', nodes }; nodos: { t:'text', v } | { t:'b'|'i'|'s'|'code', c } | { t:'link', href, v }.

const MARKS = { '*': 'b', _: 'i', '~': 's', '`': 'code' };
const EDGE = /[\s\p{P}\p{S}]/u; // lo que puede rodear una marca por fuera
const SPACE = /\s/;

const canOpen = (s, i) => {
  const next = s[i + 1];
  if (!next || SPACE.test(next) || next === s[i]) return false;
  return i === 0 || EDGE.test(s[i - 1]);
};
const canClose = (s, j) => {
  if (SPACE.test(s[j - 1])) return false;
  const next = s[j + 1];
  return next === undefined || EDGE.test(next);
};

export function parseInline(s) {
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (MARKS[ch] && canOpen(s, i)) {
      let end = -1;
      for (let j = i + 2; j < s.length; j += 1) {
        if (s[j] === ch && canClose(s, j)) { end = j; break; }
      }
      if (end > 0) {
        flush();
        const inner = s.slice(i + 1, end);
        out.push({ t: MARKS[ch], c: ch === '`' ? [{ t: 'text', v: inner }] : parseInline(inner) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const TRAIL = /[*_~.,;:!?)\]}'"»]+$/;

/** Una línea: separa los enlaces y da formato al resto. */
function parseLine(line) {
  const nodes = [];
  line.split(URL_RE).forEach((part, idx) => {
    if (!part) return;
    if (idx % 2 === 1) {
      const trail = (part.match(TRAIL) || [''])[0];
      const url = trail ? part.slice(0, -trail.length) : part;
      if (url) nodes.push({ t: 'link', href: /^www\./i.test(url) ? `https://${url}` : url, v: url });
      if (trail) nodes.push(...parseInline(trail));
    } else {
      nodes.push(...parseInline(part));
    }
  });
  return nodes;
}

export function parseWa(text) {
  const blocks = [];
  // Los bloques ``` ``` pueden ocupar varias líneas y no llevan formato por dentro.
  String(text ?? '').replace(/\r\n/g, '\n').split(/```([\s\S]+?)```/).forEach((chunk, idx) => {
    if (idx % 2 === 1) { blocks.push({ kind: 'pre', text: chunk.replace(/^\n|\n$/g, '') }); return; }
    if (!chunk) return;
    chunk.split('\n').forEach((line, k, all) => {
      // un salto pegado a un bloque ``` no deja línea vacía de más
      if (line === '' && (k === 0 || k === all.length - 1) && all.length > 1) return;
      const bullet = line.match(/^\s*[*-]\s+(\S.*)$/);
      if (bullet) { blocks.push({ kind: 'bullet', nodes: parseLine(bullet[1]) }); return; }
      const quote = line.match(/^>\s?(.*)$/);
      if (quote) { blocks.push({ kind: 'quote', nodes: parseLine(quote[1]) }); return; }
      blocks.push({ kind: 'line', nodes: parseLine(line) });
    });
  });
  return blocks;
}

const plainOf = (nodes) => nodes.map((n) => (n.t === 'text' || n.t === 'link' ? n.v : plainOf(n.c))).join('');

/** Texto sin marcas de formato (para la vista previa de la lista de chats). */
export function plainWa(text) {
  return parseWa(text)
    .map((b) => (b.kind === 'pre' ? b.text : (b.kind === 'bullet' ? '• ' : '') + plainOf(b.nodes)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
