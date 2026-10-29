const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const passport = require('passport');
require('../helpers/server');
const { start } = require('../helpers/server');
const { signPendingToken, verifyPendingToken } = require('../../src/lib/mfaPending');

mock.method(passport, 'authenticate', () => (req, res, next) => {
    req.user = { id: 3 };
    next();
});
const oAuthRouter = require('../../src/routes/oAuth');

test('google callback redirects to the two-factor page with an admin pending token and no session token', async () => {
    const app = express();
    app.use(oAuthRouter);
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/google/callback`, { redirect: 'manual' });
        const location = res.headers.get('location');
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        assert.ok(res.status >= 300 && res.status < 400);
        assert.ok(location.startsWith(`${clientUrl}/two-factor?pending=`));
        assert.ok(!location.includes('?token='));
        const pending = new URL(location).searchParams.get('pending');
        assert.deepEqual(verifyPendingToken(pending), { userType: 'admin', userId: 3 });
    } finally {
        await server.close();
    }
});

test('pending token for admin 3 round trips', () => {
    assert.deepEqual(verifyPendingToken(signPendingToken('admin', 3)), { userType: 'admin', userId: 3 });
});
