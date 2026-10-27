const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { auditPortal } = require('../../src/lib/portalAudit');

async function serve({ log, user, handler }) {
    const app = express();
    const router = express.Router();
    router.use((req, res, next) => {
        if (user) req.user = user;
        next();
    });
    router.use(auditPortal(log));
    router.post('/jobs', handler || ((req, res) => res.status(201).json({ ok: true })));
    app.use('/api/portal', router);
    return start(app);
}

test('logs one JSON line on finish with request facts and user identity', async () => {
    const lines = [];
    const s = await serve({ log: (l) => lines.push(l), user: { role: 'client', id: 4, company_id: 5 } });
    try {
        const res = await fetch(`${s.baseUrl}/api/portal/jobs`, { method: 'POST' });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(lines.length, 1);
        assert.strictEqual(typeof lines[0], 'string');
        const line = JSON.parse(lines[0]);
        assert.strictEqual(line.event, 'portal_request');
        assert.strictEqual(line.method, 'POST');
        assert.strictEqual(line.path, '/api/portal/jobs');
        assert.strictEqual(line.status, 201);
        assert.strictEqual(line.role, 'client');
        assert.strictEqual(line.user_id, 4);
        assert.strictEqual(line.company_id, 5);
        assert.ok(line.ip);
        assert.ok(Number.isFinite(line.ms) && line.ms >= 0);
        assert.ok(!Number.isNaN(Date.parse(line.at)));
    } finally {
        await s.close();
    }
});

test('role, user_id and company_id are null when req.user is unset', async () => {
    const lines = [];
    const s = await serve({ log: (l) => lines.push(l) });
    try {
        await fetch(`${s.baseUrl}/api/portal/jobs`, { method: 'POST' });
        const line = JSON.parse(lines[0]);
        assert.strictEqual(line.role, null);
        assert.strictEqual(line.user_id, null);
        assert.strictEqual(line.company_id, null);
    } finally {
        await s.close();
    }
});

test('reads req.user at finish time, not at mount time', async () => {
    const lines = [];
    const s = await serve({
        log: (l) => lines.push(l),
        handler: (req, res) => {
            req.user = { role: 'client', id: 8, company_id: 2 };
            res.json({});
        },
    });
    try {
        await fetch(`${s.baseUrl}/api/portal/jobs`, { method: 'POST' });
        const line = JSON.parse(lines[0]);
        assert.strictEqual(line.user_id, 8);
        assert.strictEqual(line.company_id, 2);
    } finally {
        await s.close();
    }
});

test('line omits query string, token, authorization header and body', async () => {
    const lines = [];
    const s = await serve({ log: (l) => lines.push(l), user: { role: 'client', id: 4, company_id: 5 } });
    try {
        await fetch(`${s.baseUrl}/api/portal/jobs?company_id=9&token=x`, {
            method: 'POST',
            headers: { Authorization: 'Bearer sekrit-jwt', 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'hunter2' }),
        });
        assert.strictEqual(lines.length, 1);
        const line = JSON.parse(lines[0]);
        assert.strictEqual(line.path, '/api/portal/jobs');
        assert.strictEqual(line.company_id, 5);
        for (const bad of ['sekrit-jwt', 'Bearer', 'token=x', 'company_id=9', 'hunter2', '?']) {
            assert.ok(!lines[0].includes(bad), `line leaked ${bad}`);
        }
    } finally {
        await s.close();
    }
});

test('a throwing log is caught and the response is unaffected', async () => {
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a);
    const s = await serve({
        log: () => {
            throw new Error('log down');
        },
    });
    try {
        const res = await fetch(`${s.baseUrl}/api/portal/jobs`, { method: 'POST' });
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(await res.json(), { ok: true });
        assert.strictEqual(errors.length, 1);
    } finally {
        console.error = orig;
        await s.close();
    }
});
