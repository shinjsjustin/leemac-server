const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { isBourne } = require('../../src/middleware/isBourne');

const KEY = 'secret-key';
let saved;
beforeEach(() => { saved = process.env.BOURNE_READ_KEY; process.env.BOURNE_READ_KEY = KEY; });
afterEach(() => {
    if (saved === undefined) delete process.env.BOURNE_READ_KEY;
    else process.env.BOURNE_READ_KEY = saved;
});

function run(method, headers = {}) {
    const res = {
        statusCode: null, body: null, headers: {},
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        set(k, v) { this.headers[k] = v; return this; },
    };
    let nextCalled = false;
    const req = { method, headers, get: (n) => headers[n.toLowerCase()] };
    isBourne(req, res, () => { nextCalled = true; });
    return { res, nextCalled };
}

test('missing key returns 401', () => {
    const { res, nextCalled } = run('GET');
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(nextCalled, false);
});

test('wrong key (same and different length) returns 401', () => {
    assert.strictEqual(run('GET', { 'x-bourne-key': 'secret-keX' }).res.statusCode, 401);
    assert.strictEqual(run('GET', { 'x-bourne-key': 'short' }).res.statusCode, 401);
});

test('Authorization header is ignored', () => {
    assert.strictEqual(run('GET', { authorization: `Bearer ${KEY}` }).res.statusCode, 401);
});

test('unset or empty env returns 503 for every request', () => {
    delete process.env.BOURNE_READ_KEY;
    assert.strictEqual(run('GET', { 'x-bourne-key': KEY }).res.statusCode, 503);
    process.env.BOURNE_READ_KEY = '';
    const { res, nextCalled } = run('GET', { 'x-bourne-key': '' });
    assert.strictEqual(res.statusCode, 503);
    assert.ok(res.body.error);
    assert.strictEqual(nextCalled, false);
});

test('valid key allows GET and HEAD', () => {
    for (const m of ['GET', 'HEAD']) {
        const { res, nextCalled } = run(m, { 'x-bourne-key': KEY });
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(res.statusCode, null);
    }
});

test('valid key with write methods returns 405 and never calls next', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const { res, nextCalled } = run(m, { 'x-bourne-key': KEY });
        assert.strictEqual(res.statusCode, 405);
        assert.strictEqual(res.headers.Allow, 'GET');
        assert.strictEqual(nextCalled, false);
    }
});

test('bad key on write method returns 401, not 405', () => {
    assert.strictEqual(run('POST', { 'x-bourne-key': 'nope' }).res.statusCode, 401);
});

test('bourneLimiter is exported as middleware', () => {
    assert.strictEqual(typeof require('../../src/middleware/isBourne').bourneLimiter, 'function');
});
