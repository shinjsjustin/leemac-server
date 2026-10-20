const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const auth = require('../../src/lib/auth');

const EIGHT_HOURS = 8 * 60 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;

test('signAdminToken signs role, id, email and access from access_level', () => {
    const token = auth.signAdminToken({ id: 3, email: 'a@b.c', access_level: 2, password: 'x' }, 'sid-a');
    const p = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(p.role, 'admin');
    assert.equal(p.id, 3);
    assert.equal(p.email, 'a@b.c');
    assert.equal(p.access, 2);
    assert.equal(p.sid, 'sid-a');
    assert.equal(p.password, undefined);
    assert.equal(p.exp - p.iat, EIGHT_HOURS);
});

test('signClientToken signs role, id, username, name and company_id', () => {
    const token = auth.signClientToken({ id: 7, username: 'u', name: 'N', company_id: 4, password: 'x' }, 'sid-c');
    const p = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(p.role, 'client');
    assert.equal(p.id, 7);
    assert.equal(p.username, 'u');
    assert.equal(p.name, 'N');
    assert.equal(p.company_id, 4);
    assert.equal(p.sid, 'sid-c');
    assert.equal(p.password, undefined);
    assert.equal(p.exp - p.iat, SEVEN_DAYS);
});

test('credentialLimiter is separate from authLimiter and blocks the 11th call with JSON', async () => {
    assert.notEqual(auth.credentialLimiter, auth.authLimiter);
    const app = express();
    app.use(auth.credentialLimiter, (req, res) => res.json({ ok: true }));
    const s = await start(app);
    try {
        for (let i = 0; i < 10; i++) {
            assert.equal((await fetch(s.baseUrl)).status, 200);
        }
        const res = await fetch(s.baseUrl);
        assert.equal(res.status, 429);
        assert.deepEqual(await res.json(), { error: 'Too many requests, please try again later.' });
    } finally {
        await s.close();
    }
});

test('signToken defaults to 8h and honours an explicit expiresIn', () => {
    const def = jwt.verify(auth.signToken({ a: 1 }), process.env.JWT_SECRET);
    assert.equal(def.exp - def.iat, EIGHT_HOURS);
    const one = jwt.verify(auth.signToken({ a: 1 }, '1h'), process.env.JWT_SECRET);
    assert.equal(one.exp - one.iat, 3600);
});
