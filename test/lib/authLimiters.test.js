const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const auth = require('../../src/lib/auth');
const { signPendingToken } = require('../../src/lib/mfaPending');

const LIMITER_NAMES = [
    'loginLimiter', 'mfaLimiter', 'authFloodLimiter', 'emailLimiter',
    'emailFloodLimiter', 'inviteLimiter', 'credentialLimiter',
];
const TOO_MANY = { error: 'Too many attempts. Try again later.' };

// Serves one limiter on /t; `user` is set as req.user before it when given.
async function serve(limiter, user) {
    const app = express();
    app.use(express.json());
    app.use('/t', (req, _res, next) => {
        if (user) req.user = user(req);
        next();
    }, limiter, (_req, res) => res.json({ ok: true }));
    return start(app);
}

function post(s, body, path = '/t') {
    return fetch(s.baseUrl + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function statuses(s, count, body) {
    const out = [];
    for (let i = 0; i < count; i++) out.push((await post(s, body)).status);
    return out;
}

async function assertLimitedAt(s, limit, body) {
    const ok = await statuses(s, limit, body);
    assert.ok(ok.every((c) => c === 200), `first ${limit} should pass`);
    const res = await post(s, body);
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), TOO_MANY);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
}

test('exports seven distinct limiters', () => {
    const fns = LIMITER_NAMES.map((n) => auth[n]);
    fns.forEach((f, i) => assert.equal(typeof f, 'function', LIMITER_NAMES[i]));
    assert.equal(new Set(fns).size, LIMITER_NAMES.length);
});

test('loginLimiter 429s an account on its 11th request but not another account on the same IP', async () => {
    const s = await serve(auth.loginLimiter);
    try {
        await assertLimitedAt(s, 10, { email: 'a@x.com' });
        assert.equal((await post(s, { email: 'b@x.com' })).status, 200);
    } finally {
        await s.close();
    }
});

test('loginLimiter treats email case and whitespace as the same account', async () => {
    const s = await serve(auth.loginLimiter);
    try {
        await statuses(s, 10, { email: 'c@x.com' });
        assert.equal((await post(s, { email: '  C@X.com ' })).status, 429);
    } finally {
        await s.close();
    }
});

test('mfaLimiter keys on the pending token user and 429s the 21st per account', async () => {
    const s = await serve(auth.mfaLimiter);
    try {
        await assertLimitedAt(s, 20, { pendingToken: signPendingToken('admin', 1) });
        assert.equal((await post(s, { pendingToken: signPendingToken('admin', 2) })).status, 200);
        assert.equal((await post(s, { pendingToken: signPendingToken('client', 1) })).status, 200);
    } finally {
        await s.close();
    }
});

test('mfaLimiter pools unverifiable tokens under one account', async () => {
    const s = await serve(auth.mfaLimiter);
    try {
        await statuses(s, 20, { pendingToken: 'junk-1' });
        assert.equal((await post(s, { pendingToken: 'junk-2' })).status, 429);
    } finally {
        await s.close();
    }
});

test('authFloodLimiter 429s the 101st request per IP across accounts', async () => {
    const s = await serve(auth.authFloodLimiter);
    try {
        const codes = [];
        for (let i = 0; i < 100; i++) codes.push((await post(s, { email: `u${i}@x.com` })).status);
        assert.ok(codes.every((c) => c === 200));
        const res = await post(s, { email: 'last@x.com' });
        assert.equal(res.status, 429);
        assert.deepEqual(await res.json(), TOO_MANY);
        assert.ok(Number(res.headers.get('retry-after')) > 0);
    } finally {
        await s.close();
    }
});

test('emailLimiter 429s an authenticated account on its 11th but not another on the IP', async () => {
    const s = await serve(auth.emailLimiter, (req) => ({ role: 'client', id: req.body.id }));
    try {
        await assertLimitedAt(s, 10, { id: 1 });
        assert.equal((await post(s, { id: 2 })).status, 200);
    } finally {
        await s.close();
    }
});

test('emailLimiter falls back to the pending token user, then the body email', async () => {
    const s = await serve(auth.emailLimiter);
    try {
        await statuses(s, 10, { pendingToken: signPendingToken('admin', 5) });
        assert.equal((await post(s, { pendingToken: signPendingToken('admin', 5) })).status, 429);
        assert.equal((await post(s, { pendingToken: signPendingToken('admin', 6) })).status, 200);
        await statuses(s, 10, { email: 'e@x.com' });
        assert.equal((await post(s, { email: 'E@x.com' })).status, 429);
        assert.equal((await post(s, { email: 'f@x.com' })).status, 200);
    } finally {
        await s.close();
    }
});

test('emailFloodLimiter 429s the 31st request per IP', async () => {
    const s = await serve(auth.emailFloodLimiter);
    try {
        await assertLimitedAt(s, 30, {});
    } finally {
        await s.close();
    }
});

test('inviteLimiter 429s the 51st request per admin id', async () => {
    const s = await serve(auth.inviteLimiter, (req) => ({ role: 'admin', id: req.body.id }));
    try {
        await assertLimitedAt(s, 50, { id: 1 });
        assert.equal((await post(s, { id: 2 })).status, 200);
    } finally {
        await s.close();
    }
});

test('credentialLimiter 429s the 31st request', async () => {
    const s = await serve(auth.credentialLimiter);
    try {
        await assertLimitedAt(s, 30, {});
    } finally {
        await s.close();
    }
});

test('account counters are separate per mount path', async () => {
    const app = express();
    app.use(express.json());
    app.use('/a', auth.loginLimiter, (_req, res) => res.json({ ok: true }));
    app.use('/b', auth.loginLimiter, (_req, res) => res.json({ ok: true }));
    const s = await start(app);
    try {
        for (let i = 0; i < 10; i++) await post(s, { email: 'p@x.com' }, '/a');
        assert.equal((await post(s, { email: 'p@x.com' }, '/a')).status, 429);
        assert.equal((await post(s, { email: 'p@x.com' }, '/b')).status, 200);
    } finally {
        await s.close();
    }
});
