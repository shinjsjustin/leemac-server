const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src');
const exists = (p) => fs.existsSync(path.join(src, p));

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
    });
}

test('old navigation, Jarvis UI and daily report files are deleted', () => {
    for (const p of [
        'components/Navbar.js',
        'components/Navbar.css',
        'components/Styling/Navbar.css',
        'components/TodoPanel.js',
        'components/Styling/TodoPanel.css',
        'components/Jarvis',
        'components/AdminComponents/DailyReport.js',
        'todo-icon.svg',
        'settings-icon.svg',
        'profile-icon.svg',
    ]) {
        assert.strictEqual(exists(p), false, p);
    }
});

test('routes add a level 1 /settings page and drop /jarvis and /daily-report', () => {
    const s = fs.readFileSync(path.join(src, 'routes.js'), 'utf8');
    assert.match(s, /import Settings from '\.\/components\/AdminComponents\/Settings';/);
    assert.match(s, /path: "\/settings", element: <ProtectedRoute requiredAccessLevel=\{1\}><Settings \/><\/ProtectedRoute>/);
    assert.doesNotMatch(s, /jarvis/i);
    assert.doesNotMatch(s, /daily-report|DailyReport/);
});

test('no client source file imports Navbar or mentions jarvisFetch', () => {
    for (const file of walk(src).filter((f) => /\.(js|jsx|css)$/.test(f))) {
        const s = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(s, /import[^;\n]*from\s+['"][^'"]*Navbar(\.css)?['"]/, file);
        assert.doesNotMatch(s, /import\s+['"][^'"]*Navbar\.css['"]/, file);
        assert.doesNotMatch(s, /jarvisFetch/, file);
    }
});
