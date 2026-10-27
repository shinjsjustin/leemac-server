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

const mediaAt = css.indexOf('@media');
const base = css.slice(0, mediaAt);
const media = css.slice(css.indexOf('{', mediaAt) + 1);

// Returns the body of the rule whose selector list contains `selector`, or null.
function body(text, selector) {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(text))) {
        if (m[1].split(',').map((s) => s.trim()).includes(selector)) return m[2];
    }
    return null;
}

test('a.portal-card inherits colour, has no underline, and gets an accent border on hover and focus without a shadow', () => {
    const rest = body(base, '.portal-shell a.portal-card');
    assert.ok(rest, 'missing a.portal-card rule');
    assert.match(rest, /color:\s*inherit/);
    assert.match(rest, /text-decoration:\s*none/);
    for (const state of [':hover', ':focus-visible']) {
        const rule = body(base, `.portal-shell a.portal-card${state}`);
        assert.ok(rule, `missing a.portal-card${state}`);
        assert.match(rule, /border-color:\s*var\(--portal-accent\)/);
        assert.doesNotMatch(rule, /box-shadow/);
    }
});

test('topbar is one row with a nowrap nav and 44px nav links', () => {
    const topbar = body(base, '.portal-shell .portal-topbar');
    assert.match(topbar, /flex-direction:\s*row/);
    assert.match(topbar, /align-items:\s*center/);
    assert.match(topbar, /justify-content:\s*space-between/);
    assert.match(topbar, /padding:\s*var\(--space-xs\) var\(--space-sm\)/);
    assert.equal(body(media, '.portal-shell .portal-topbar').match(/flex-direction:\s*column/), null);
    assert.doesNotMatch(topbar, /flex-direction:\s*column/);
    const nav = body(base, '.portal-shell nav');
    assert.match(nav, /flex-wrap:\s*nowrap/);
    assert.doesNotMatch(nav, /gap/);
    assert.match(body(base, '.portal-shell .portal-nav-link'), /min-height:\s*44px/);
    assert.match(body(base, '.portal-shell .portal-nav-link'), /padding:\s*0 var\(--space-sm\)/);
});

test('logo is 32px, 40px from the 640px breakpoint, with nav links and topbar restored', () => {
    assert.match(body(base, '.portal-shell .portal-logo'), /height:\s*32px/);
    assert.match(body(media, '.portal-shell .portal-logo'), /height:\s*40px/);
    assert.match(body(media, '.portal-shell .portal-nav-link'), /padding:\s*0 var\(--space-md\)/);
    assert.match(body(media, '.portal-shell .portal-topbar'), /padding:\s*var\(--space-sm\) var\(--space-lg\)/);
});

test('defines the layout helper classes', () => {
    for (const c of ['portal-title-row', 'portal-back-link', 'portal-part-toggle', 'portal-job-fields', 'portal-stack']) {
        assert.ok(css.includes(`.${c}`), `missing .${c}`);
    }
    assert.match(body(base, '.portal-shell .portal-stack'), /flex-direction:\s*column/);
    assert.match(body(base, '.portal-shell .portal-back-link'), /min-height:\s*44px/);
    assert.match(body(base, '.portal-shell .portal-form h2'), /margin:\s*0/);
});

test('.portal-form bottom margin matches .portal-card', () => {
    assert.match(body(base, '.portal-shell .portal-form'), /margin:\s*0 auto var\(--space-md\)/);
    assert.match(body(base, '.portal-shell .portal-card'), /margin-bottom:\s*var\(--space-md\)/);
});

test('defines the drawing and job drop-down classes', () => {
    for (const c of ['portal-drawing', 'portal-drawing--small', 'portal-drawing--large', 'portal-drawing-empty',
        'portal-drawings', 'portal-drawings--large', 'portal-part-body', 'portal-part-preview',
        'portal-job-card', 'portal-job-link', 'portal-parts-toggle', 'portal-job-parts']) {
        assert.ok(css.includes(`.${c}`), `missing .${c}`);
    }
});

test('.portal-drawing is a 44px minimum touch target and empty drawings use muted tokens', () => {
    const drawing = body(base, '.portal-shell .portal-drawing');
    assert.match(drawing, /min-height:\s*(4[4-9]|[5-9]\d|\d{3,})px/);
    assert.match(drawing, /min-width:\s*(4[4-9]|[5-9]\d|\d{3,})px/);
    const empty = body(base, '.portal-shell .portal-drawing-empty');
    assert.match(empty, /background:\s*var\(--portal-bg\)/);
    assert.match(empty, /color:\s*var\(--portal-text-muted\)/);
});

test('drawing sizes: large is a minmax(120px, 1fr) grid, small is 72px wide', () => {
    assert.match(body(base, '.portal-shell .portal-drawings--large'), /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(120px,\s*1fr\)\)/);
    assert.match(body(base, '.portal-shell .portal-drawing--small'), /width:\s*72px/);
});

test('part body is a row from 640px and job links inherit colour without underline', () => {
    assert.match(body(media, '.portal-shell .portal-part-body'), /flex-direction:\s*row/);
    const link = body(base, '.portal-shell .portal-job-link');
    assert.match(link, /color:\s*inherit/);
    assert.match(link, /text-decoration:\s*none/);
});
