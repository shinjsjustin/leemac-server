const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const auth = require('../../src/lib/auth');

const TOO_MANY = { error: 'Too many attempts. Try again later.' };
const WRITES_ALLOWED = 120;

async function serve(limiter, user) {
    const app = express();
    app.use(express.json());
    app.use('/t', (req, _res, next) => {
        req.user = user(req);
        next();
    }, limiter, (_req, res) => res.json({ ok: true }));
    return start(app);
}

const post = (s, body) => fetch(s.baseUrl + '/t', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
});

test('portalListWriteLimiter allows 120 writes per client then 429s, a second client still passes', async () => {
    const s = await serve(auth.portalListWriteLimiter, (req) => ({ role: 'client', id: req.body.id }));
    try {
        let passed = 0;
        for (let i = 0; i < WRITES_ALLOWED; i++) if ((await post(s, { id: 1 })).status === 200) passed++;
        assert.equal(passed, WRITES_ALLOWED);
        const limited = await post(s, { id: 1 });
        assert.equal(limited.status, 429);
        assert.deepEqual(await limited.json(), TOO_MANY);
        assert.equal((await post(s, { id: 2 })).status, 200);
    } finally {
        await s.close();
    }
});
