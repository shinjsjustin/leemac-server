const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/server');
const { requireAdmin, requireClient } = require('../../src/middleware/requireRole');

function run(mw, user) {
    const out = { nexted: false, status: null, body: null };
    const res = {
        status(c) { out.status = c; return this; },
        json(b) { out.body = b; return this; },
    };
    mw({ user }, res, () => { out.nexted = true; });
    return out;
}

const admin = (access) => ({ role: 'admin', id: 1, access });
const client = (company_id) => ({ role: 'client', id: 1, company_id });

test('requireAdmin returns 401 with no user', () => {
    const o = run(requireAdmin(1), undefined);
    assert.equal(o.status, 401);
    assert.ok(o.body.error);
    assert.equal(o.nexted, false);
});

const adminCases = [
    ['no role', { id: 1, access: 5 }, 1, 403],
    ['no access', { role: 'admin', id: 1 }, 1, 403],
    ['string access', admin('5'), 1, 403],
    ['float access', admin(2.5), 1, 403],
    ['client token', { ...client(2), access: 5 }, 1, 403],
    ['below level', admin(1), 2, 403],
    ['exact level', admin(2), 2, null],
    ['above level', admin(3), 2, null],
];
for (const [name, user, level, status] of adminCases) {
    test(`requireAdmin(${level}) with ${name}`, () => {
        const o = run(requireAdmin(level), user);
        assert.equal(o.status, status);
        assert.equal(o.nexted, status === null);
        if (status) assert.deepEqual(o.body, { error: 'Forbidden' });
    });
}

test('requireClient returns 401 with no user', () => {
    const o = run(requireClient, undefined);
    assert.equal(o.status, 401);
    assert.ok(o.body.error);
    assert.equal(o.nexted, false);
});

const clientCases = [
    ['admin token', { ...admin(5), company_id: 2 }, 403],
    ['no role', { id: 1, company_id: 2 }, 403],
    ['missing company_id', { role: 'client', id: 1 }, 403],
    ['zero company_id', client(0), 403],
    ['negative company_id', client(-1), 403],
    ['string company_id', client('2'), 403],
    ['valid', client(2), null],
];
for (const [name, user, status] of clientCases) {
    test(`requireClient with ${name}`, () => {
        const o = run(requireClient, user);
        assert.equal(o.status, status);
        assert.equal(o.nexted, status === null);
        if (status) assert.deepEqual(o.body, { error: 'Forbidden' });
    });
}
