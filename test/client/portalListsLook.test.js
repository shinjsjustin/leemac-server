const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs
    .readFileSync(path.join(__dirname, '../../src/client/src/components/Styling/ClientPortal.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
const source = fs.readFileSync(
    path.join(__dirname, '../../src/client/src/components/ClientComponents/PartListsPanel.js'), 'utf8');

// Text after the last occurrence of the lists marker: our appended rules.
const tail = css.slice(css.indexOf('.portal-shell .portal-parts-split {'));
const mediaAt = tail.indexOf('@media');
const base = tail.slice(0, mediaAt);
const wide = tail.slice(tail.indexOf('{', mediaAt) + 1);

function body(text, selector) {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(text))) {
        if (m[1].split(',').map((s) => s.trim()).includes(selector)) return m[2];
    }
    return null;
}

test('parts split is one column, and a 2fr 1fr grid with the panel on the right from 768px', () => {
    assert.match(css, /@media \(min-width:\s*768px\)/);
    assert.match(body(base, '.portal-shell .portal-parts-split'), /grid-template-columns:\s*1fr\s*;/);
    const grid = body(wide, '.portal-shell .portal-parts-split');
    assert.match(grid, /grid-template-columns:\s*2fr 1fr/);
    assert.match(body(wide, '.portal-shell .portal-lists'), /order:\s*2/);
    assert.match(body(wide, '.portal-shell .portal-parts-main'), /order:\s*1/);
    assert.match(body(base, '.portal-shell .portal-parts-main'), /min-width:\s*0/);
    assert.doesNotMatch(css, /portal-parts-split-main/);
});

test('panel stacks above parts on phones and collapses to its toggle under 768px', () => {
    assert.match(body(base, '.portal-shell .portal-lists'), /order:\s*-1/);
    assert.match(css, /@media \(max-width:\s*767px\)/);
    const mediaStart = css.indexOf('@media (max-width: 767px)');
    const collapsed = css.slice(css.indexOf('{', mediaStart) + 1);
    assert.match(body(collapsed, '.portal-shell .portal-lists--collapsed > :not(.portal-lists-toggle)'), /display:\s*none/);
});

test('list cards, actions column, selected part row and section divider are styled', () => {
    assert.match(body(base, '.portal-shell .portal-list-card'), /border:\s*1px solid var\(--portal-border\)/);
    assert.match(body(base, '.portal-shell .portal-list-actions'), /flex-direction:\s*column/);
    assert.match(body(base, '.portal-shell .portal-part-row--selected'), /border-color:\s*var\(--portal-accent\)/);
    assert.match(body(base, '.portal-shell .portal-parts-section'), /border-top:\s*1px solid var\(--portal-border\)/);
});

test('selection bar is a wrapping row', () => {
    const bar = body(css, '.portal-shell .portal-parts-selection');
    assert.match(bar, /display:\s*flex/);
    assert.match(bar, /flex-direction:\s*row/);
    assert.match(bar, /flex-wrap:\s*wrap/);
});

test('every portal-parts-* and portal-list* class used by the page and panel has a rule', () => {
    const dir = path.join(__dirname, '../../src/client/src/components/ClientComponents');
    const text = ['ClientPartsPage.js', 'PartListsPanel.js']
        .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const used = new Set();
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        for (const t of (m[1] || m[2]).split(/\s+/)) {
            if (/^portal-(parts-|list)[\w-]*$/.test(t)) used.add(t);
        }
    }
    assert.ok(used.has('portal-parts-selection') && used.has('portal-list-actions'));
    const missing = [...used].filter((c) => !new RegExp(`\\.portal-shell [^{}]*\\.${c}(?![\\w-])[^{}]*\\{`).test(css));
    assert.deepStrictEqual(missing, []);
});

test('panel source never mentions price or company_id', () => {
    assert.doesNotMatch(source, /price/i);
    assert.doesNotMatch(source, /company_id/);
});
