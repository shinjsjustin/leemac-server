const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/client-notes.md'), 'utf8');
const start = doc.indexOf('## Admin');
const admin = start >= 0 ? doc.slice(start, doc.indexOf('\n## ', start + 1) >= 0 ? doc.indexOf('\n## ', start + 1) : undefined) : '';

test('has an Admin section documenting PUT /api/internal/notes/share', () => {
    assert.ok(start >= 0, 'Admin section');
    assert.ok(admin.includes('`PUT /api/internal/notes/share`'));
});

test('documents the share body, response and errors', () => {
    assert.match(admin, /\{\s*"?id"?[^}]*shared/);
    assert.match(admin, /true\/false or 1\/0/);
    assert.match(admin, /\{\s*"ok": true,\s*"shared"/);
    assert.match(admin, /400[^\n]*client note/i);
    assert.match(admin, /404[^\n]*unknown note/i);
});

test('states note status is no longer set or shown', () => {
    assert.match(admin, /status is no longer set or shown/i);
});

test('admin notes list author, is_client and shared, including part notes', () => {
    assert.match(admin, /getnote/);
    assert.match(admin, /listnotes/);
    for (const field of ['author', 'is_client', 'shared']) {
        assert.ok(admin.includes('`' + field + '`'), field);
    }
    assert.match(admin, /part notes/i);
});

test('mentions Jarvis proposing share_note', () => {
    assert.match(admin, /Jarvis[^\n]*`share_note`/);
});
