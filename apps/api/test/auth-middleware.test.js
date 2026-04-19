// Minimal smoke tests for the JWT auth middleware.
// Uses Node's built-in test runner (node --test) — no extra deps.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// The middleware reads process.env.JWT_SECRET at import time. Set it BEFORE
// importing so the tests don't depend on the legacy fallback banner.
process.env.JWT_SECRET = 'test-secret-not-used-in-prod';

const { authenticate, generateToken, verifyToken } = await import('../src/middleware/auth.js');

function makeReply() {
    const state = { statusCode: null, body: null };
    return {
        state,
        status(code) { state.statusCode = code; return this; },
        send(payload) { state.body = payload; return this; },
    };
}

test('generateToken → verifyToken roundtrip preserves id/email/role', () => {
    const user = { id: 'u1', email: 'a@b.mx', role: 'admin' };
    const token = generateToken(user);
    const decoded = verifyToken(token);
    assert.equal(decoded.id, 'u1');
    assert.equal(decoded.email, 'a@b.mx');
    assert.equal(decoded.role, 'admin');
});

test('authenticate rejects requests with no Authorization header', async () => {
    const request = { headers: {} };
    const reply = makeReply();
    await authenticate(request, reply);
    assert.equal(reply.state.statusCode, 401);
    assert.equal(reply.state.body.error, 'No autorizado');
});

test('authenticate rejects non-Bearer schemes', async () => {
    const request = { headers: { authorization: 'Basic abc' } };
    const reply = makeReply();
    await authenticate(request, reply);
    assert.equal(reply.state.statusCode, 401);
});

test('authenticate rejects tokens signed with the wrong secret', async () => {
    const token = jwt.sign({ id: 'x', email: 'x@y.z', role: 'admin' }, 'a-different-secret');
    const request = { headers: { authorization: `Bearer ${token}` } };
    const reply = makeReply();
    await authenticate(request, reply);
    assert.equal(reply.state.statusCode, 401);
    assert.equal(reply.state.body.error, 'Token inválido');
});

test('authenticate rejects expired tokens', async () => {
    const token = jwt.sign({ id: 'x' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    const reply = makeReply();
    await authenticate(request, reply);
    assert.equal(reply.state.statusCode, 401);
});

test('authenticate accepts a freshly-generated token and sets request.user', async () => {
    const user = { id: 'u42', email: 'mech@shop.mx', role: 'mechanic' };
    const token = generateToken(user);
    const request = { headers: { authorization: `Bearer ${token}` } };
    const reply = makeReply();
    await authenticate(request, reply);
    assert.equal(reply.state.statusCode, null, 'authenticate should not call reply.status for valid tokens');
    assert.equal(request.user.id, 'u42');
    assert.equal(request.user.email, 'mech@shop.mx');
    assert.equal(request.user.role, 'mechanic');
});
