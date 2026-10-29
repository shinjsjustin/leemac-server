const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '../../src/client/src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const STYLING = 'components/Styling/';

function rootBlock(css) {
    return css.match(/:root\s*\{([^}]*)\}/)[1];
}

function declared(block, name) {
    const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    return m && m[1].trim();
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

test('index.css :root defines the shared layout and dark tokens', () => {
    const root = rootBlock(read('index.css'));
    assert.strictEqual(declared(root, '--portal-topbar-h'), '56px');
    assert.strictEqual(declared(root, '--portal-page-max'), '960px');
    assert.strictEqual(declared(root, '--portal-page-pad'), 'var(--space-md)');
    assert.strictEqual(declared(root, '--portal-rail-w'), '300px');
    for (const t of ['bg', 'surface', 'line', 'text', 'live']) {
        assert.match(declared(root, `--portal-dark-${t}`) || '', /^#[0-9a-fA-F]{3,8}$/, `--portal-dark-${t}`);
    }
});

test('no --portal-overview-* token is defined or used under src/client/src', () => {
    for (const file of walk(SRC).filter((f) => /\.(css|js)$/.test(f))) {
        const text = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(text, /--portal-overview-/, file);
    }
});

test('ClientPortal.css drops legacy parts and lists rules but keeps the request-row rules', () => {
    const css = read(`${STYLING}ClientPortal.css`);
    const sels = [...css.matchAll(/([^{}]+)\{/g)]
        .map((m) => m[1].trim())
        .filter((p) => !p.startsWith('@'))
        .flatMap((p) => p.split(',').map((s) => s.trim()));
    const legacy = sels.filter((s) =>
        /\.portal-(parts-|lists|list-)/.test(s) && !/\.portal-parts-toggle$/.test(s) &&
        !/\.portal-list-request-(row|footer)$/.test(s));
    assert.deepStrictEqual(legacy, []);
    assert.ok(sels.some((s) => s.endsWith('.portal-list-request-row')));
    assert.ok(sels.some((s) => s.endsWith('.portal-list-request-footer')));
});

test('rail column and railed backdrop use var(--portal-rail-w)', () => {
    const parts = read(`${STYLING}PortalParts.css`);
    const split = parts.match(/\.portal-parts-split\s*\{([^}]*)\}/)[1];
    assert.match(split, /grid-template-columns:[^;]*var\(--portal-rail-w\)/);
    const windows = read(`${STYLING}PortalWindows.css`);
    const railed = windows.match(/\.portal-windows-backdrop--railed\s*\{([^}]*)\}/)[1];
    assert.match(railed, /right:\s*var\(--portal-rail-w\)/);
});

test('PortalOverview.css uses the shared dark and topbar tokens', () => {
    const css = read(`${STYLING}PortalOverview.css`);
    assert.match(css, /var\(--portal-dark-bg\)/);
    assert.match(css, /var\(--portal-topbar-h\)/);
});
