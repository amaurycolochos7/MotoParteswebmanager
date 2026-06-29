// Regresión: los preHandlers del módulo Questions DEBEN ser async.
// Un preHandler síncrono de 2 args hace que Fastify espere un `done` que nunca
// llega y la petición se cuelga (bug detectado en producción 2026-06-29).
// Estos tests no tocan la DB: solo registran los hooks en una ruta dummy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

process.env.JWT_SECRET = 'test-secret-questions';
process.env.MOTOPARTES_QUESTIONS_ADMIN_PIN = '9999';

const { requireAdmin, requireQuestionsAuth } = await import('../src/routes/questions.js');

test('requireAdmin y requireQuestionsAuth son funciones async', () => {
  assert.equal(requireAdmin.constructor.name, 'AsyncFunction');
  assert.equal(requireQuestionsAuth.constructor.name, 'AsyncFunction');
});

test('requireAdmin no cuelga: 403 sin rol admin, pasa con rol admin', async () => {
  const app = Fastify();
  app.addHook('preHandler', async (req) => { req.qauth = req.headers['x-role'] ? { role: req.headers['x-role'] } : null; });
  app.get('/x', { preHandler: requireAdmin }, async () => ({ ok: true }));

  const denied = await app.inject({ method: 'GET', url: '/x' });
  assert.equal(denied.statusCode, 403);

  const allowed = await app.inject({ method: 'GET', url: '/x', headers: { 'x-role': 'admin' } });
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(allowed.json(), { ok: true });

  await app.close();
});
