// Tests del módulo "MotoPartes Questions" — solo lógica pura (sin DB ni red).
// Runner nativo: node --test test/*.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// Configurar env ANTES de importar los módulos que la leen al cargar.
process.env.JWT_SECRET = 'test-secret-questions';
process.env.MOTOPARTES_QUESTIONS_ELIHU_PIN = '1111';
process.env.MOTOPARTES_QUESTIONS_MACIEL_PIN = '2222';
process.env.MOTOPARTES_QUESTIONS_ADMIN_PIN = '9999';

const auth = await import('../src/lib/questions-auth.js');
const survey = await import('../src/lib/questions-survey.js');
const xport = await import('../src/lib/questions-export.js');

// ── PIN auth ──
test('matchPin resuelve cada PIN a su rol/participante', () => {
  assert.deepEqual(auth.matchPin('1111'), { role: 'participant', participant: 'ELIHU' });
  assert.deepEqual(auth.matchPin('2222'), { role: 'participant', participant: 'MACIEL' });
  assert.deepEqual(auth.matchPin('9999'), { role: 'admin', participant: null });
});

test('matchPin rechaza PIN incorrecto o vacío', () => {
  assert.equal(auth.matchPin('0000'), null);
  assert.equal(auth.matchPin(''), null);
  assert.equal(auth.matchPin('11111'), null);
});

test('token del módulo: roundtrip y scope', () => {
  const token = auth.signQuestionsToken({ role: 'participant', participant: 'ELIHU' });
  const payload = auth.verifyQuestionsToken(token);
  assert.equal(payload.scope, 'questions');
  assert.equal(payload.role, 'participant');
  assert.equal(payload.participant, 'ELIHU');
});

test('verifyQuestionsToken rechaza tokens de otro scope', () => {
  // Un token JWT válido pero sin scope 'questions' (p. ej. del auth principal).
  const bad = jwt.sign({ id: 'u1', role: 'admin' }, process.env.JWT_SECRET);
  assert.throws(() => auth.verifyQuestionsToken(bad));
});

// ── Estructura del cuestionario ──
test('el cuestionario tiene 15 secciones', () => {
  assert.equal(survey.SECTIONS.length, 15);
});

test('flatQuestions incluye q1..q70 + los 3 followups', () => {
  const flat = survey.flatQuestions();
  const keys = flat.map((q) => q.key);
  for (let i = 1; i <= 70; i++) assert.ok(keys.includes('q' + i), `falta q${i}`);
  assert.ok(keys.includes('q2_detail'));
  assert.ok(keys.includes('q8_detail'));
  assert.ok(keys.includes('q20_example'));
  assert.equal(flat.length, 73);
});

test('q1 solo permite ELIHU o MACIEL', () => {
  const q1 = survey.flatQuestions().find((q) => q.key === 'q1');
  assert.deepEqual(q1.options, ['ELIHU', 'MACIEL']);
  assert.equal(q1.required, true);
});

// ── Render / comparación / export ──
test('renderAnswer formatea cada tipo correctamente', () => {
  const idx = survey.questionIndex();
  assert.equal(xport.renderAnswer(idx.q1, { answer_value: 'ELIHU' }), 'ELIHU');
  assert.equal(
    xport.renderAnswer(idx.q2, { answer_value: ['Creo órdenes', 'Cobro trabajos'] }),
    'Creo órdenes; Cobro trabajos'
  );
  assert.equal(
    xport.renderAnswer(idx.q2, { answer_value: ['Otro, explicar'], answer_text: 'organizo' }),
    'Otro: organizo'
  );
  assert.equal(xport.renderAnswer(idx.q6, { answer_value: ['Revisar moto', 'Crear orden'] }), 'Revisar moto > Crear orden');
  assert.equal(xport.renderAnswer(idx.q44, { answer_text: 'cobro al final' }), 'cobro al final');
});

test('diffLabel detecta igualdad, diferencia y respuestas parciales', () => {
  const idx = survey.questionIndex();
  const q = idx.q1;
  assert.equal(xport.diffLabel(q, { answer_value: 'ELIHU' }, { answer_value: 'ELIHU' }), 'Ambos respondieron igual');
  assert.ok(xport.diffLabel(q, { answer_value: 'ELIHU' }, { answer_value: 'MACIEL' }).startsWith('Difieren'));
  assert.equal(xport.diffLabel(q, { answer_value: 'ELIHU' }, null), 'Solo respondió ELIHU');
  assert.equal(xport.diffLabel(q, null, { answer_value: 'MACIEL' }), 'Solo respondió MACIEL');
  assert.equal(xport.diffLabel(q, null, null), 'Sin responder');
});

test('MULTI_CHOICE compara sin importar el orden', () => {
  const idx = survey.questionIndex();
  const d = xport.diffLabel(idx.q2, { answer_value: ['A', 'B'] }, { answer_value: ['B', 'A'] });
  assert.equal(d, 'Ambos respondieron igual');
});

test('toCSV genera encabezado, BOM y escapa comas', () => {
  const comparison = [{ section: 'Perfil', question: 'Hola, mundo', elihu: 'Sí', maciel: 'No', diff: 'Difieren — revisar en reunión' }];
  const csv = xport.toCSV(comparison);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Hola, mundo"'));
  assert.ok(csv.includes('Respuesta ELIHU'));
});

test('toJSON y toMarkdown producen salida válida', () => {
  const comparison = [{ section: 'Perfil', section_key: 'perfil', question_key: 'q1', question: 'Q', elihu: 'ELIHU', maciel: 'MACIEL', diff: 'Difieren' }];
  const parsed = JSON.parse(xport.toJSON(comparison, { survey_version: 'x' }));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.meta.survey_version, 'x');
  const md = xport.toMarkdown(comparison, {});
  assert.ok(md.includes('| Pregunta | ELIHU | MACIEL | Diferencia detectada |'));
});

test('buildComparison cubre todas las preguntas del cuestionario', () => {
  const flat = survey.flatQuestions();
  const cmp = xport.buildComparison(flat, {}, {});
  assert.equal(cmp.length, flat.length);
  assert.ok(cmp.every((r) => r.diff === 'Sin responder'));
});
