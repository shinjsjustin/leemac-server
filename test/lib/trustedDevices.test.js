const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const { hashToken } = require('../../src/lib/authTokens');
const {
    TRUST_DAYS, browserLabel, trustDevice, useTrustedDevice,
    listTrustedDevices, revokeTrustedDevice, revokeAllTrustedDevices,
} = require('../../src/lib/trustedDevices');

const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const EDGE_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

test('browserLabel names browser and OS', () => {
    assert.equal(browserLabel(CHROME_MAC), 'Chrome on macOS');
    assert.equal(browserLabel(EDGE_WIN), 'Edge on Windows');
    assert.equal(browserLabel(FIREFOX_LINUX), 'Firefox on Linux');
    assert.equal(browserLabel(SAFARI_IOS), 'Safari on iOS');
    assert.equal(browserLabel(CHROME_ANDROID), 'Chrome on Android');
    assert.equal(browserLabel(SAFARI_MAC), 'Safari on macOS');
});

test('browserLabel is Unknown browser for empty or unrecognised input', () => {
    assert.equal(browserLabel(''), 'Unknown browser');
    assert.equal(browserLabel(undefined), 'Unknown browser');
    assert.equal(browserLabel('curl/8.0'), 'Unknown browser');
});

test('trustDevice deletes expired rows first, then stores only the hash with 30 day expiry', async () => {
    const db = makeFakeDb();
    const raw = await trustDevice(db, 7, CHROME_MAC);
    assert.equal(TRUST_DAYS, 30);
    assert.match(raw, /^[0-9a-f]{64}$/);
    assert.equal(db.calls.length, 2);
    assert.match(db.calls[0].sql, /^DELETE FROM admin_trusted_device WHERE admin_id = \? AND expires_at <= NOW\(\)/);
    assert.deepEqual(db.calls[0].params, [7]);
    const ins = db.calls[1];
    assert.match(ins.sql, /^INSERT INTO admin_trusted_device/);
    assert.match(ins.sql, /DATE_ADD\(NOW\(\), INTERVAL \? DAY\)/);
    assert.deepEqual(ins.params, [7, hashToken(raw), 'Chrome on macOS', 30]);
    assert.equal(ins.params.includes(raw), false);
});

test('trustDevice issues a different token each time', async () => {
    const db = makeFakeDb();
    assert.notEqual(await trustDevice(db, 7, ''), await trustDevice(db, 7, ''));
});

test('useTrustedDevice renews and returns true only when one row matched', async () => {
    const hit = makeFakeDb([{ match: /UPDATE/, rows: { affectedRows: 1 } }]);
    assert.equal(await useTrustedDevice(hit, 7, 'abc'), true);
    assert.equal(hit.calls.length, 1);
    const { sql, params } = hit.calls[0];
    assert.match(sql, /^UPDATE admin_trusted_device SET last_used_at = NOW\(\), expires_at = DATE_ADD\(NOW\(\), INTERVAL \? DAY\) WHERE admin_id = \? AND token_hash = \? AND expires_at > NOW\(\)$/);
    assert.deepEqual(params, [30, 7, hashToken('abc')]);

    const miss = makeFakeDb([{ match: /UPDATE/, rows: { affectedRows: 0 } }]);
    assert.equal(await useTrustedDevice(miss, 7, 'abc'), false);
});

test('useTrustedDevice returns false without querying for a missing or non-string token', async () => {
    const db = makeFakeDb();
    for (const t of [undefined, null, '', 123, {}]) assert.equal(await useTrustedDevice(db, 7, t), false);
    assert.equal(db.calls.length, 0);
});

test('listTrustedDevices deletes expired rows then selects safe columns, latest used first', async () => {
    const rows = [{ id: 1, label: 'x' }];
    const db = makeFakeDb([{ match: /^SELECT/, rows }]);
    assert.deepEqual(await listTrustedDevices(db, 7), rows);
    assert.match(db.calls[0].sql, /^DELETE FROM admin_trusted_device WHERE admin_id = \? AND expires_at <= NOW\(\)/);
    const sel = db.calls[1];
    assert.match(sel.sql, /SELECT id, label, created_at, last_used_at, expires_at FROM admin_trusted_device WHERE admin_id = \? ORDER BY last_used_at DESC/);
    assert.equal(/token_hash|\*/.test(sel.sql), false);
    assert.deepEqual(sel.params, [7]);
});

test('revokeTrustedDevice is scoped to the admin and reports whether a row was deleted', async () => {
    const hit = makeFakeDb([{ match: /DELETE/, rows: { affectedRows: 1 } }]);
    assert.equal(await revokeTrustedDevice(hit, 7, 3), true);
    assert.match(hit.calls[0].sql, /^DELETE FROM admin_trusted_device WHERE id = \? AND admin_id = \?$/);
    assert.deepEqual(hit.calls[0].params, [3, 7]);
    const miss = makeFakeDb([{ match: /DELETE/, rows: { affectedRows: 0 } }]);
    assert.equal(await revokeTrustedDevice(miss, 7, 3), false);
});

test('revokeAllTrustedDevices deletes every row for the admin', async () => {
    const db = makeFakeDb();
    await revokeAllTrustedDevices(db, 7);
    assert.match(db.calls[0].sql, /^DELETE FROM admin_trusted_device WHERE admin_id = \?$/);
    assert.deepEqual(db.calls[0].params, [7]);
});
