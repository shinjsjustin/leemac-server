const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
    });
}

test('routes renders Overview at /starred-jobs behind level 1 and drops StarredJobs', () => {
    const routes = read('routes.js');
    assert.match(routes, /import Overview from '\.\/components\/Overview\/Overview'/);
    assert.match(
        routes,
        /path: "\/starred-jobs", element: <ProtectedRoute requiredAccessLevel=\{1\}><Overview \/><\/ProtectedRoute>/
    );
    assert.doesNotMatch(routes, /StarredJobs/);
});

test('StarredJobs.js is deleted and nothing under src/client/src imports it', () => {
    assert.strictEqual(fs.existsSync(path.join(src, 'components/AdminComponents/StarredJobs.js')), false);
    const importers = walk(src)
        .filter((f) => f.endsWith('.js'))
        .filter((f) => /^\s*import[^;]*['"][^'"]*\/StarredJobs['"]|require\([^)]*\/StarredJobs['"]\)/m.test(fs.readFileSync(f, 'utf8')));
    assert.deepStrictEqual(importers, []);
});

test('Overview code calls overview, setstarstage, setstarflag, finishpart, never updatestarjobstatus', () => {
    const code = walk(path.join(src, 'components/Overview'))
        .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
        .map((f) => fs.readFileSync(f, 'utf8'))
        .join('\n');
    for (const endpoint of ['overview', 'setstarstage', 'setstarflag', 'finishpart']) {
        assert.match(code, new RegExp(`/${endpoint}\\b`), endpoint);
    }
    assert.doesNotMatch(code, /updatestarjobstatus/);
});
