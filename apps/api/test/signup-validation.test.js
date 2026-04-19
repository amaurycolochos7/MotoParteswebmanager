// Smoke tests for the /register request-validation logic. These cover the
// synchronous branches only (the ones that return 400 without touching the DB)
// so they can run on any CI without a Postgres instance.
//
// The full end-to-end happy-path test (register → login blocked with "pending
// activation") lives in ../../../e2e and needs the docker-compose stack.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

process.env.JWT_SECRET = 'test-secret-not-used-in-prod';

// Stub the Prisma client before the auth route imports it. The validation
// tests never reach `prisma.profile.findUnique`, so we can assert any attempt
// to use the DB is a test-failure rather than silently hitting production.
const prismaMock = {
    profile: {
        findUnique: async () => {
            throw new Error('Prisma should not be called when validation fails');
        },
        create: async () => {
            throw new Error('Prisma should not be called when validation fails');
        },
    },
};

// Trick the ESM loader: monkey-patch the default export of the prisma module
// using import-hooks is overkill here — simpler to inline-import the route
// handler and inject a fake prisma via a thin wrapper.
// Instead we just hit the route and assert the request is rejected pre-DB.
// For this we need the real module but with a DATABASE_URL that won't resolve;
// the validation path returns BEFORE any DB call, so it still passes.
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/none';

const authRoutesModule = await import('../src/routes/auth.js');
const authRoutes = authRoutesModule.default;

async function buildApp() {
    const app = Fastify({ logger: false });
    await app.register(authRoutes, { prefix: '/api/auth' });
    await app.ready();
    return app;
}

test('POST /register rejects empty body with 400', async () => {
    const app = await buildApp();
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/register',
            payload: {},
        });
        assert.equal(res.statusCode, 400);
        const body = res.json();
        assert.match(body.error, /obligatorios/i);
    } finally {
        await app.close();
    }
});

test('POST /register rejects passwords shorter than 8 characters', async () => {
    const app = await buildApp();
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/register',
            payload: {
                email: 'user@example.com',
                password: 'short',
                full_name: 'Test User',
                workshop_name: 'Test Workshop',
            },
        });
        assert.equal(res.statusCode, 400);
        assert.match(res.json().error, /8 caracteres/i);
    } finally {
        await app.close();
    }
});

test('POST /register rejects malformed email', async () => {
    const app = await buildApp();
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/register',
            payload: {
                email: 'not-an-email',
                password: 'passwithlength',
                full_name: 'Test User',
                workshop_name: 'Test Workshop',
            },
        });
        assert.equal(res.statusCode, 400);
        assert.match(res.json().error, /inválido/i);
    } finally {
        await app.close();
    }
});
