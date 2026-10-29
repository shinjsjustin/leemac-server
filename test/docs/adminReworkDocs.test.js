const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/admin-rework.md'), 'utf8');

function section(name) {
    const start = doc.indexOf('## ' + name);
    assert.ok(start >= 0, 'missing section ' + name);
    const next = doc.indexOf('\n## ', start + 1);
    return doc.slice(start, next < 0 ? undefined : next);
}

test('deploy backs up, dry-runs, applies 016, then deploys the server', () => {
    const deploy = section('Deploy');
    const backup = deploy.search(/back up the database/i);
    const dryRun = deploy.search(/dry-run/i);
    const migration = deploy.search(/src\/db\/migrations\/016_star_flags\.sql/);
    const server = deploy.search(/deploy the server/i);
    assert.ok(backup >= 0 && backup < dryRun && dryRun < migration && migration < server);
    assert.match(deploy, /urgent/);
    assert.match(deploy, /waiting/);
    assert.match(deploy, /open plus/);
});

test('what changed covers every area of the rework', () => {
    const changed = section('What changed');
    for (const re of [
        /rail/, /Cmd-K/, /Overview/, /\/starred-jobs/, /\/job\/:id/, /Quote requests/,
        /\/quote-requests/, /Finances/, /\/finances/, /Finish/, /paid-unstar/,
        /Jarvis/, /Daily report/, /tables (are )?kept/, /\/api\/jarvis\/google/,
    ]) {
        assert.match(changed, re);
    }
});

test('manual checks list pages at 1440, Overview at 393, Google and paid invoice', () => {
    const checks = section('Manual checks');
    assert.match(checks, /1440/);
    assert.match(checks, /393/);
    assert.match(checks, /Connect Google/);
    assert.match(checks, /Check Gmail/);
    assert.match(checks, /Settings/);
    assert.match(checks, /invoice paid/);
    assert.ok((checks.match(/^- \[ \]/gm) || []).length >= 5);
});

test('links the stage doc', () => {
    assert.match(doc, /\(shop-stages\.md\)/);
});
