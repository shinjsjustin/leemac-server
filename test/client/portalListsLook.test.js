const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components');
const css = fs.readFileSync(path.join(dir, 'Styling/PortalParts.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const read = (f) => fs.readFileSync(path.join(dir, 'ClientComponents', f), 'utf8');

function body(selector) {
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        if (m[1].split(',').map((s) => s.trim()).includes(selector)) return m[2];
    }
    return null;
}

test('focused rail row is outlined and the rail row is a full-width text row', () => {
    assert.match(body('.portal-shell .portal-rail-row--focused'), /outline:\s*2px solid var\(--portal-focus\)/);
    assert.match(body('.portal-shell .portal-rail-row'), /width:\s*100%/);
    assert.match(body('.portal-shell .portal-rail-row'), /border-bottom:\s*1px solid var\(--portal-border\)/);
});

test('every portal-rail*, portal-list* and portal-parts* class used by the panel and wall has a .portal-shell rule', () => {
    const text = ['PartListsPanel.js', 'PartWall.js'].map(read).join('\n');
    const used = new Set(text.match(/portal-(?:rail|list|parts)[\w-]*/g));
    assert.ok(used.has('portal-rail-row') && used.has('portal-parts-grid'));
    const missing = [...used].filter((c) => !new RegExp(`\\.portal-shell [^{}]*\\.${c}(?![\\w-])[^{}]*\\{`).test(css));
    assert.deepStrictEqual(missing, []);
});

test('panel source never mentions price or company_id', () => {
    const source = read('PartListsPanel.js');
    assert.doesNotMatch(source, /price/i);
    assert.doesNotMatch(source, /company_id/);
});
