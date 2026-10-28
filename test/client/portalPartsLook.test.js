const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs
    .readFileSync(path.join(__dirname, '../../src/client/src/components/Styling/ClientPortal.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

// Rules outside the @media block, so the flat rule regex below stays valid.
const mediaAt = css.indexOf('@media');
const flat = css.slice(0, mediaAt) + css.slice(css.indexOf('\n}\n', mediaAt) + 3);

// Returns the bodies of every rule whose selector list contains `selector`, joined, or null.
function body(selector) {
    const re = /([^{}]+)\{([^}]*)\}/g;
    const found = [];
    let m;
    while ((m = re.exec(flat))) {
        if (m[1].split(',').map((s) => s.trim()).includes(selector)) found.push(m[2]);
    }
    return found.length ? found.join('\n') : null;
}

test('quiet button uses the surface background, portal border and accent text', () => {
    const rule = body('.portal-shell .portal-button--quiet');
    assert.ok(rule, 'missing .portal-button--quiet');
    assert.match(rule, /background:\s*var\(--portal-surface\)/);
    assert.match(rule, /border:\s*1px solid var\(--portal-border\)/);
    assert.match(rule, /color:\s*var\(--portal-accent\)/);
    assert.match(rule, /min-height:\s*44px/);
    assert.match(body('.portal-shell .portal-button--quiet:hover'), /border-color:\s*var\(--portal-accent\)/);
});

test('search row is a one-line nowrap flex with a shrinking input and fixed-size buttons', () => {
    const row = body('.portal-shell .portal-search-row');
    assert.ok(row, 'missing .portal-search-row');
    assert.match(row, /display:\s*flex/);
    assert.match(row, /flex-wrap:\s*nowrap/);
    assert.match(row, /gap:\s*var\(--space-sm\)/);
    assert.match(row, /align-items:\s*center/);
    const input = body('.portal-shell .portal-search-row .portal-input');
    assert.ok(input, 'missing search row input rule');
    assert.match(input, /flex:\s*1 1 auto/);
    assert.match(input, /min-width:\s*0/);
    assert.match(input, /margin-top:\s*0/);
    const button = body('.portal-shell .portal-search-row .portal-button');
    assert.ok(button, 'missing search row button rule');
    assert.match(button, /width:\s*auto/);
    assert.match(button, /flex:\s*0 0 auto/);
});

test('part job link is accent without underline, underlined only on hover', () => {
    const link = body('.portal-shell .portal-part-job-link');
    assert.match(link, /color:\s*var\(--portal-accent\)/);
    assert.match(link, /text-decoration:\s*none/);
    assert.match(body('.portal-shell .portal-part-job-link:hover'), /text-decoration:\s*underline/);
});

test('preview toggle keeps the quiet look over PartPdfPreview.css', () => {
    const rule = body('.portal-shell .part-preview .portal-button--quiet');
    assert.ok(rule, 'missing .part-preview quiet rule');
    assert.match(rule, /background:\s*var\(--portal-surface\)/);
    assert.match(rule, /color:\s*var\(--portal-accent\)/);
    assert.match(rule, /border:\s*1px solid var\(--portal-border\)/);
});
