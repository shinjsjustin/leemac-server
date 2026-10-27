const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs
    .readFileSync(path.join(__dirname, '../../src/client/src/components/Styling/ClientPortal.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

// Returns the selector text of every rule, descending into @media blocks.
function selectors(text) {
    const out = [];
    const re = /([^{}]+)\{/g;
    let m;
    while ((m = re.exec(text))) {
        const prelude = m[1].trim();
        if (prelude.startsWith('@')) continue;
        out.push(...prelude.split(',').map((s) => s.trim()));
    }
    return out;
}

test('every ClientPortal.css selector starts with .portal-shell', () => {
    const list = selectors(css);
    assert.ok(list.length > 10);
    for (const s of list) assert.match(s, /^\.portal-shell(?![\w-])/, `unscoped selector: ${s}`);
});

test('every var() in ClientPortal.css is a --portal-* or --space-* token', () => {
    const vars = [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
    assert.ok(vars.length > 0);
    for (const v of vars) assert.match(v, /^--(portal|space)-/, `bad token: ${v}`);
});

test('defines the portal component classes', () => {
    for (const c of ['portal-card', 'portal-card-row', 'portal-badge', 'portal-badge--shipped', 'portal-fields',
        'portal-field', 'portal-field-label', 'portal-field-value', 'portal-parts', 'portal-part',
        'portal-part-desc', 'portal-button', 'portal-file', 'portal-file-kind', 'portal-message',
        'portal-form', 'portal-label', 'portal-input', 'portal-error', 'portal-link']) {
        assert.ok(css.includes(`.${c}`), `missing .${c}`);
    }
});

test('.portal-shell .portal-part sets no padding so it keeps the card padding', () => {
    const rule = css.match(/\.portal-shell \.portal-part\s*\{([^}]*)\}/);
    assert.ok(rule, 'missing .portal-part rule');
    assert.doesNotMatch(rule[1], /padding/);
});
