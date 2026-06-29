// ============================================================================
// MotoPartes Questions — ruta backend (montada en /api/questions)
// ----------------------------------------------------------------------------
// Módulo INTERNO y AISLADO:
//   - NO usa resolveWorkspace → no interfiere con el aislamiento multi-tenant.
//   - Sus modelos (SurveyParticipant/Answer/Event) no están en SCOPED_MODELS,
//     así que el auto-scoping de Prisma nunca los toca.
//   - Acceso solo por PIN (variables de entorno) + JWT con scope 'questions'.
//   - No modifica el login principal ni ningún flujo existente.
// ============================================================================

import prisma from '../lib/prisma.js';
import {
  isConfigured,
  matchPin,
  signQuestionsToken,
  verifyQuestionsToken,
  PARTICIPANTS,
} from '../lib/questions-auth.js';
import {
  SURVEY_VERSION,
  SURVEY_INTRO,
  PARTICIPANT_INSTRUCTION,
  SECTIONS,
  flatQuestions,
  requiredQuestionKeys,
  questionIndex,
} from '../lib/questions-survey.js';
import {
  renderAnswer,
  buildComparison,
  toCSV,
  toJSON,
  toMarkdown,
  toPlainText,
} from '../lib/questions-export.js';

// preHandler: valida el JWT del módulo y deja request.qauth = {role, participant}.
export async function requireQuestionsAuth(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'PIN requerido' });
  }
  try {
    request.qauth = verifyQuestionsToken(authHeader.split(' ')[1]);
  } catch {
    return reply.status(401).send({ error: 'Sesión inválida o expirada' });
  }
}

// async: un preHandler síncrono de 2 args hace que Fastify espere un callback
// `done` que nunca se llama y la petición se cuelga. Debe devolver una promesa.
export async function requireAdmin(request, reply) {
  if (request.qauth?.role !== 'admin') {
    return reply.status(403).send({ error: 'Acceso solo para administrador' });
  }
}

async function ensureParticipant(key) {
  const meta = PARTICIPANTS[key];
  return prisma.surveyParticipant.upsert({
    where: { key },
    update: {},
    create: { key, display_name: meta?.display_name || key, status: 'NOT_STARTED' },
  });
}

async function answersMap(participantId) {
  const rows = await prisma.surveyAnswer.findMany({ where: { participant_id: participantId } });
  const map = {};
  for (const r of rows) map[r.question_key] = { answer_value: r.answer_value, answer_text: r.answer_text };
  return map;
}

function completion(map) {
  const flat = flatQuestions();
  const idx = questionIndex();
  let answered = 0;
  for (const q of flat) {
    if (renderAnswer(idx[q.key], map[q.key])) answered += 1;
  }
  return { answered, total: flat.length, percent: Math.round((answered / flat.length) * 100) };
}

function logEvent(actor, action, participant_key, detail, ip) {
  // Nunca registramos PINs ni tokens.
  return prisma.surveyEvent
    .create({ data: { actor, action, participant_key: participant_key || null, detail: detail || {}, ip_address: ip || null } })
    .catch(() => {});
}

export default async function questionsRoutes(fastify) {
  // ── POST /api/questions/auth — validar PIN (rate-limit agresivo) ──
  fastify.post('/auth', { config: { rateLimit: { max: 8, timeWindow: '5 minutes' } } }, async (request, reply) => {
    if (!isConfigured()) {
      return reply.status(503).send({ error: 'El cuestionario no está configurado todavía.' });
    }
    const { pin } = request.body || {};
    if (!pin || typeof pin !== 'string') {
      return reply.status(400).send({ error: 'Ingresa tu PIN.' });
    }
    const match = matchPin(pin);
    if (!match) {
      // Sin pistas sobre qué PIN era. Sin loggear el intento de PIN.
      return reply.status(401).send({ error: 'PIN incorrecto.' });
    }

    if (match.role === 'participant') {
      const p = await ensureParticipant(match.participant);
      await logEvent(match.participant, 'login', match.participant, {}, request.ip);
      const token = signQuestionsToken(match);
      return reply.send({
        token,
        role: 'participant',
        participant: { key: p.key, display_name: p.display_name, status: p.status, locked: p.locked },
      });
    }

    await logEvent('admin', 'login', null, {}, request.ip);
    return reply.send({ token: signQuestionsToken(match), role: 'admin' });
  });

  // ── Resto de rutas: requieren JWT del módulo ──
  fastify.register(async function authed(app) {
    app.addHook('preHandler', requireQuestionsAuth);

    // GET /api/questions/form — definición del cuestionario (una sola verdad).
    app.get('/form', async () => ({
      survey_version: SURVEY_VERSION,
      intro: SURVEY_INTRO,
      participant_instruction: PARTICIPANT_INSTRUCTION,
      sections: SECTIONS,
    }));

    // ── PARTICIPANTE ──

    // GET /api/questions/me — estado + respuestas propias (para continuar).
    app.get('/me', async (request, reply) => {
      if (request.qauth.role !== 'participant') {
        return reply.status(403).send({ error: 'Solo participantes.' });
      }
      const p = await ensureParticipant(request.qauth.participant);
      const map = await answersMap(p.id);
      return {
        participant: {
          key: p.key,
          display_name: p.display_name,
          status: p.status,
          locked: p.locked,
          submitted_at: p.submitted_at,
        },
        answers: map,
        completion: completion(map),
        survey_version: SURVEY_VERSION,
      };
    });

    // PUT /api/questions/answers — guardar borrador (autosave / por sección).
    app.put('/answers', async (request, reply) => {
      if (request.qauth.role !== 'participant') {
        return reply.status(403).send({ error: 'Solo participantes.' });
      }
      const p = await ensureParticipant(request.qauth.participant);
      if (p.locked) {
        return reply.status(409).send({ error: 'Tus respuestas fueron enviadas. Pide al administrador que las desbloquee para editar.' });
      }
      const { answers } = request.body || {};
      if (!Array.isArray(answers)) {
        return reply.status(400).send({ error: 'Formato inválido.' });
      }
      const idx = questionIndex();
      const valid = answers.filter((a) => a && typeof a.question_key === 'string' && idx[a.question_key]);

      await prisma.$transaction(
        valid.map((a) =>
          prisma.surveyAnswer.upsert({
            where: { participant_id_question_key: { participant_id: p.id, question_key: a.question_key } },
            update: { answer_value: a.answer_value ?? null, answer_text: a.answer_text ?? null },
            create: {
              participant_id: p.id,
              question_key: a.question_key,
              answer_value: a.answer_value ?? null,
              answer_text: a.answer_text ?? null,
            },
          })
        )
      );

      if (p.status === 'NOT_STARTED') {
        await prisma.surveyParticipant.update({ where: { id: p.id }, data: { status: 'IN_PROGRESS' } });
      }
      await logEvent(p.key, 'save', p.key, { count: valid.length }, request.ip);

      const map = await answersMap(p.id);
      return { ok: true, completion: completion(map), updated_at: new Date().toISOString() };
    });

    // POST /api/questions/submit — marcar enviado (valida obligatorias).
    app.post('/submit', async (request, reply) => {
      if (request.qauth.role !== 'participant') {
        return reply.status(403).send({ error: 'Solo participantes.' });
      }
      const p = await ensureParticipant(request.qauth.participant);
      if (p.locked) {
        return reply.status(409).send({ error: 'Ya enviaste tus respuestas.' });
      }
      const map = await answersMap(p.id);
      const idx = questionIndex();
      const missing = requiredQuestionKeys().filter((k) => !renderAnswer(idx[k], map[k]));
      if (missing.length > 0) {
        return reply.status(400).send({
          error: 'Faltan preguntas obligatorias por contestar.',
          missing,
        });
      }
      const updated = await prisma.surveyParticipant.update({
        where: { id: p.id },
        data: { status: 'SUBMITTED', locked: true, submitted_at: new Date(), survey_version: SURVEY_VERSION },
      });
      await logEvent(p.key, 'submit', p.key, {}, request.ip);
      return { ok: true, status: updated.status, submitted_at: updated.submitted_at };
    });

    // ── ADMIN ──

    // GET /api/questions/admin/summary — estado de avance de ambos.
    app.get('/admin/summary', { preHandler: requireAdmin }, async () => {
      const out = [];
      for (const key of ['ELIHU', 'MACIEL']) {
        const p = await ensureParticipant(key);
        const map = await answersMap(p.id);
        out.push({
          key: p.key,
          display_name: p.display_name,
          status: p.status,
          locked: p.locked,
          submitted_at: p.submitted_at,
          last_edit: p.updated_at,
          completion: completion(map),
        });
      }
      return { participants: out, survey_version: SURVEY_VERSION };
    });

    // GET /api/questions/admin/responses/:key — respuestas individuales.
    app.get('/admin/responses/:key', { preHandler: requireAdmin }, async (request, reply) => {
      const key = String(request.params.key || '').toUpperCase();
      if (!PARTICIPANTS[key]) return reply.status(404).send({ error: 'Participante no válido.' });
      const p = await ensureParticipant(key);
      const map = await answersMap(p.id);
      const idx = questionIndex();
      const rows = flatQuestions().map((q) => ({
        section: q.section_title,
        question_key: q.key,
        question: q.label,
        answer: renderAnswer(idx[q.key], map[q.key]),
        raw: map[q.key] || null,
      }));
      return {
        participant: { key: p.key, display_name: p.display_name, status: p.status, submitted_at: p.submitted_at },
        rows,
      };
    });

    // GET /api/questions/admin/compare — matriz comparativa ELIHU vs MACIEL.
    app.get('/admin/compare', { preHandler: requireAdmin }, async () => {
      const e = await ensureParticipant('ELIHU');
      const m = await ensureParticipant('MACIEL');
      const comparison = buildComparison(flatQuestions(), await answersMap(e.id), await answersMap(m.id));
      return { comparison, survey_version: SURVEY_VERSION };
    });

    // POST /api/questions/admin/unlock/:key — desbloquear para corrección.
    app.post('/admin/unlock/:key', { preHandler: requireAdmin }, async (request, reply) => {
      const key = String(request.params.key || '').toUpperCase();
      if (!PARTICIPANTS[key]) return reply.status(404).send({ error: 'Participante no válido.' });
      const p = await ensureParticipant(key);
      const updated = await prisma.surveyParticipant.update({
        where: { id: p.id },
        data: { locked: false, status: 'IN_PROGRESS' },
      });
      await logEvent('admin', 'unlock', key, { reason: request.body?.reason || null }, request.ip);
      return { ok: true, status: updated.status, locked: updated.locked };
    });

    // GET /api/questions/admin/export?format=csv|json|md|txt
    app.get('/admin/export', { preHandler: requireAdmin }, async (request, reply) => {
      const format = String(request.query.format || 'csv').toLowerCase();
      const e = await ensureParticipant('ELIHU');
      const m = await ensureParticipant('MACIEL');
      const comparison = buildComparison(flatQuestions(), await answersMap(e.id), await answersMap(m.id));
      const meta = { generated_at: new Date().toISOString(), survey_version: SURVEY_VERSION };
      await logEvent('admin', 'export', null, { format }, request.ip);

      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        reply.header('Content-Type', 'application/json; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="motopartes-questions-${stamp}.json"`);
        return reply.send(toJSON(comparison, meta));
      }
      if (format === 'md' || format === 'markdown') {
        reply.header('Content-Type', 'text/markdown; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="motopartes-questions-${stamp}.md"`);
        return reply.send(toMarkdown(comparison, meta));
      }
      if (format === 'txt' || format === 'text') {
        reply.header('Content-Type', 'text/plain; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="motopartes-questions-${stamp}.txt"`);
        return reply.send(toPlainText(comparison, meta));
      }
      // CSV por defecto
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="motopartes-questions-${stamp}.csv"`);
      return reply.send(toCSV(comparison));
    });
  });
}
