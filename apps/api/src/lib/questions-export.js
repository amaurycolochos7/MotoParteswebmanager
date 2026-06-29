// ============================================================================
// MotoPartes Questions — render de respuestas, comparación y exportación.
// Funciones PURAS (sin DB, sin red) para poder probarlas con node:test.
//
// Formas de answer_value esperadas:
//   SINGLE_CHOICE  -> string
//   MULTI_CHOICE   -> string[]
//   SORTABLE_LIST  -> string[] (orden significativo)
//   NUMBER         -> number
//   BOOLEAN        -> boolean
//   TEXT/LONG_TEXT -> (value null; el texto va en answer_text)
// answer_text guarda la explicación de "Otro, explicar" o el texto libre.
// ============================================================================

const OTHER = 'Otro, explicar';

// Convierte una respuesta a texto legible para humanos.
export function renderAnswer(question, answer) {
  if (!answer) return '';
  const v = answer.answer_value;
  const t = (answer.answer_text || '').trim();

  switch (question.type) {
    case 'SINGLE_CHOICE': {
      if (v == null || v === '') return t ? `Otro: ${t}` : '';
      if (v === OTHER) return t ? `Otro: ${t}` : 'Otro';
      return t ? `${v} (Otro: ${t})` : String(v);
    }
    case 'MULTI_CHOICE': {
      const arr = Array.isArray(v) ? v.slice() : (v ? [v] : []);
      const hasOther = arr.includes(OTHER);
      const base = arr.filter((x) => x !== OTHER);
      let out = base.join('; ');
      if (hasOther) out = out ? `${out}; Otro: ${t || '(sin explicar)'}` : `Otro: ${t || '(sin explicar)'}`;
      return out;
    }
    case 'SORTABLE_LIST':
      return Array.isArray(v) ? v.join(' > ') : '';
    case 'NUMBER':
      return v == null || v === '' ? '' : String(v);
    case 'BOOLEAN':
      return v === true ? 'Sí' : v === false ? 'No' : '';
    case 'TEXT':
    case 'LONG_TEXT':
    default:
      return t;
  }
}

function normForCompare(question, answer) {
  if (!answer) return '';
  const rendered = renderAnswer(question, answer);
  if (question.type === 'MULTI_CHOICE') {
    // Orden-insensible para opción múltiple.
    const v = Array.isArray(answer.answer_value) ? answer.answer_value.slice() : [];
    const base = v.filter((x) => x !== OTHER).sort();
    const other = v.includes(OTHER) ? `|otro:${(answer.answer_text || '').trim().toLowerCase()}` : '';
    return base.map((s) => s.toLowerCase()).join('||') + other;
  }
  return rendered.trim().toLowerCase();
}

// Etiqueta de "Diferencia detectada" entre ELIHU y MACIEL.
export function diffLabel(question, aElihu, aMaciel) {
  const eEmpty = !renderAnswer(question, aElihu);
  const mEmpty = !renderAnswer(question, aMaciel);
  if (eEmpty && mEmpty) return 'Sin responder';
  if (eEmpty) return 'Solo respondió MACIEL';
  if (mEmpty) return 'Solo respondió ELIHU';
  return normForCompare(question, aElihu) === normForCompare(question, aMaciel)
    ? 'Ambos respondieron igual'
    : 'Difieren — revisar en reunión';
}

// Construye la matriz comparativa [{section, question, elihu, maciel, diff}].
export function buildComparison(flatQs, answersElihu, answersMaciel) {
  return flatQs.map((q) => {
    const aE = answersElihu[q.key];
    const aM = answersMaciel[q.key];
    return {
      section: q.section_title,
      section_key: q.section_key,
      question_key: q.key,
      question: q.label,
      elihu: renderAnswer(q, aE),
      maciel: renderAnswer(q, aM),
      diff: diffLabel(q, aE, aM),
    };
  });
}

function csvCell(s) {
  const str = String(s ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCSV(comparison) {
  const header = ['Seccion', 'Pregunta', 'Respuesta ELIHU', 'Respuesta MACIEL', 'Diferencia detectada'];
  const lines = [header.map(csvCell).join(',')];
  for (const row of comparison) {
    lines.push([row.section, row.question, row.elihu, row.maciel, row.diff].map(csvCell).join(','));
  }
  // BOM para que Excel respete acentos UTF-8.
  return '\uFEFF' + lines.join('\r\n');
}

export function toJSON(comparison, meta) {
  return JSON.stringify({ meta: meta || {}, rows: comparison }, null, 2);
}

export function toMarkdown(comparison, meta) {
  const out = [];
  out.push('# MotoPartes Questions — comparativa ELIHU vs MACIEL');
  if (meta?.generated_at) out.push(`\n_Generado: ${meta.generated_at}_`);
  if (meta?.survey_version) out.push(`_Versión del cuestionario: ${meta.survey_version}_`);
  out.push('');
  let currentSection = null;
  for (const row of comparison) {
    if (row.section !== currentSection) {
      currentSection = row.section;
      out.push(`\n## ${row.section}\n`);
      out.push('| Pregunta | ELIHU | MACIEL | Diferencia detectada |');
      out.push('| --- | --- | --- | --- |');
    }
    const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    out.push(`| ${esc(row.question)} | ${esc(row.elihu)} | ${esc(row.maciel)} | ${esc(row.diff)} |`);
  }
  return out.join('\n');
}

export function toPlainText(comparison, meta) {
  const out = [];
  out.push('MOTOPARTES QUESTIONS — COMPARATIVA ELIHU vs MACIEL');
  if (meta?.generated_at) out.push(`Generado: ${meta.generated_at}`);
  if (meta?.survey_version) out.push(`Versión del cuestionario: ${meta.survey_version}`);
  let currentSection = null;
  for (const row of comparison) {
    if (row.section !== currentSection) {
      currentSection = row.section;
      out.push('');
      out.push(`==== ${row.section} ====`);
    }
    out.push('');
    out.push(`P: ${row.question}`);
    out.push(`  ELIHU : ${row.elihu || '(sin responder)'}`);
    out.push(`  MACIEL: ${row.maciel || '(sin responder)'}`);
    out.push(`  Diferencia: ${row.diff}`);
  }
  return out.join('\n');
}

export default { renderAnswer, diffLabel, buildComparison, toCSV, toJSON, toMarkdown, toPlainText };
