const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/client-notes.md'), 'utf8');

test('documents the portal-notes and overview endpoints', () => {
    for (const route of [
        'GET /api/portal-notes',
        'POST /api/portal-notes',
        'PUT /api/portal-notes/:id',
        'DELETE /api/portal-notes/:id',
        'GET /api/portal/overview',
    ]) {
        assert.ok(doc.includes('`' + route + '`') || doc.includes('## ' + route), route);
    }
});

test('documents the old note routes answering 410', () => {
    assert.match(doc, /\/api\/client\/portal\/jobs\/:id\/notes/);
    assert.match(doc, /410/);
});

test('states the privacy rules', () => {
    assert.match(doc, /admin notes are private unless shared/i);
    assert.match(doc, /clients edit only their own notes/i);
    assert.match(doc, /255/);
});

test('deploy section orders backup, dry run, migration, deploy', () => {
    const deploy = doc.slice(doc.indexOf('## Deploy'));
    assert.ok(deploy.length > 0 && doc.includes('## Deploy'));
    const backup = deploy.search(/back up the database/i);
    const dryRun = deploy.search(/dry run/i);
    const migration = deploy.search(/014_client_notes\.sql/);
    const server = deploy.search(/deploy the server/i);
    assert.ok(backup >= 0 && backup < dryRun, 'backup before dry run');
    assert.ok(dryRun < migration, 'dry run before migration');
    assert.ok(migration < server, 'migration before deploy');
    assert.ok(backup < migration, 'backup before 014_client_notes.sql');
});
