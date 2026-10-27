const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const auth = require('../../src/lib/auth');

const TOO_MANY = { error: 'Too many attempts. Try again later.' };

async function serve(limiter, user) {
    const app = express();
    app.use(express.json());
    app.use('/t', (req, _res, next) => {
        if (user) req.user = user(req);
        next();
    }, limiter, (_req, res) => res.json({ ok: true }));
    return start(app);
}

const post = (s, body) => fetch(s.baseUrl + '/t', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
});

async function passCount(s, count, body) {
    let passed = 0;
    for (let i = 0; i < count; i++) if ((await post(s, body)).status === 200) passed++;
    return passed;
}

async function assertTooMany(s, body) {
    const res = await post(s, body);
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), TOO_MANY);
}

test('portalFloodLimiter allows 600 per IP then 429s with the auth body', async () => {
    const s = await serve(auth.portalFloodLimiter);
    try {
        assert.equal(await passCount(s, 600, {}), 600);
        await assertTooMany(s, {});
    } finally {
        await s.close();
    }
});

test('portalLimiter allows 300 per client then 429s, other client id has its own counter', async () => {
    const s = await serve(auth.portalLimiter, (req) => ({ role: 'client', id: req.body.id }));
    try {
        assert.equal(await passCount(s, 300, { id: 1 }), 300);
        await assertTooMany(s, { id: 1 });
        assert.equal((await post(s, { id: 2 })).status, 200);
    } finally {
        await s.close();
    }
});
