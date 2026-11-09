/* Texto de un mensaje con el formato de WhatsApp (negritas, cursivas, tachado, código, viñetas, citas y enlaces). */
import { parseWa } from './waFormat';

function Nodes({ nodes }) {
  return nodes.map((n, i) => {
    switch (n.t) {
      case 'b': return <strong key={i}><Nodes nodes={n.c} /></strong>;
      case 'i': return <em key={i}><Nodes nodes={n.c} /></em>;
      case 's': return <s key={i}><Nodes nodes={n.c} /></s>;
      case 'code': return <code key={i} className="wa-code"><Nodes nodes={n.c} /></code>;
      case 'link': return <a key={i} href={n.href} target="_blank" rel="noreferrer noopener" className="wa-link">{n.v}</a>;
      default: return n.v;
    }
  });
}

export default function WaText({ text }) {
  const blocks = parseWa(text);
  return (
    <div className="wa-text">
      {blocks.map((b, i) => {
        if (b.kind === 'pre') return <pre key={i} className="wa-pre">{b.text}</pre>;
        if (b.kind === 'bullet') return <div key={i} className="wa-li"><span className="wa-li__dot" aria-hidden="true">•</span><span><Nodes nodes={b.nodes} /></span></div>;
        if (b.kind === 'quote') return <div key={i} className="wa-quote"><Nodes nodes={b.nodes} /></div>;
        return <div key={i} className="wa-line">{b.nodes.length ? <Nodes nodes={b.nodes} /> : ' '}</div>;
      })}
    </div>
  );
}
