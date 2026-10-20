const { test } = require('node:test');
const assert = require('node:assert/strict');
const e = require('../../src/lib/authEmails');

test('lockoutEmail includes name and minutes', () => {
    const m = e.lockoutEmail({ name: 'Ann', minutes: 15 });
    assert.ok(m.subject);
    assert.match(m.text, /Ann/);
    assert.match(m.text, /15 minutes/);
});

test('resetEmail includes name and link', () => {
    const m = e.resetEmail({ name: 'Ann', link: 'http://l/reset?t=1' });
    assert.ok(m.subject);
    assert.match(m.text, /Ann/);
    assert.match(m.text, /http:\/\/l\/reset\?t=1/);
});

test('inviteEmail includes name, company and link', () => {
    const m = e.inviteEmail({ name: 'Ann', companyName: 'Acme', link: 'http://l/i' });
    assert.ok(m.subject);
    assert.match(m.text, /Ann/);
    assert.match(m.text, /Acme/);
    assert.match(m.text, /http:\/\/l\/i/);
});

test('verifyEmail includes name and link', () => {
    const m = e.verifyEmail({ name: 'Ann', link: 'http://l/v' });
    assert.ok(m.subject);
    assert.match(m.text, /Ann/);
    assert.match(m.text, /http:\/\/l\/v/);
});

test('appLink joins CLIENT_URL and path, defaulting to localhost', () => {
    const old = process.env.CLIENT_URL;
    delete process.env.CLIENT_URL;
    assert.equal(e.appLink('/reset?t=1'), 'http://localhost:3000/reset?t=1');
    process.env.CLIENT_URL = 'https://app.test';
    assert.equal(e.appLink('/x'), 'https://app.test/x');
    if (old === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = old;
});
