const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs
    .readFileSync(path.join(__dirname, '../../src/client/src/components/Styling/PortalRequests.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const PHONE_MEDIA = '@media (max-width: 600px)';

// Splits the CSS into the text of the given @media block and everything outside any @media block.
function split(source, query) {
    let outside = '';
    let inside = '';
    let i = 0;
    while (i < source.length) {
        const at = source.indexOf('@media', i);
        if (at < 0) {
            outside += source.slice(i);
            break;
        }
        outside += source.slice(i, at);
        const open = source.indexOf('{', at);
        let depth = 1;
        let j = open + 1;
        while (depth > 0) {
            if (source[j] === '{') depth += 1;
            if (source[j] === '}') depth -= 1;
            j += 1;
        }
        if (source.slice(at, open).trim() === query) inside += source.slice(open + 1, j - 1);
        i = j;
    }
    return { outside, inside };
}

// Returns [selector, body] for every flat rule in the text.
function rules(source) {
    return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

// Every flat rule in the file, with @media wrappers removed so rules inside them are included.
function allRules() {
    const flat = css.replace(/@media[^{]*\{/g, '').replace(/\}\s*(?=\}|$)/g, '');
    return rules(flat);
}

test('no rule for .portal-req-rev sets display: none', () => {
    const hiding = allRules().filter(
        ([selector, decls]) => selector.includes('.portal-req-rev') && /display\s*:\s*none/.test(decls)
    );
    assert.deepStrictEqual(hiding, []);
});

test('phone block gives .portal-req-rev a grid-area used in the row grid-template-areas', () => {
    const { inside } = split(css, PHONE_MEDIA);
    const phone = rules(inside);
    const rev = phone.find(([s]) => s === '.portal-shell .portal-req-rev');
    assert.ok(rev, 'phone block has a .portal-req-rev rule');
    const area = /grid-area\s*:\s*([\w-]+)/.exec(rev[1]);
    assert.ok(area, '.portal-req-rev sets grid-area');
    const row = phone.find(([s]) => s === '.portal-shell .portal-request-row');
    const templ = /grid-template-areas\s*:\s*([^;]+);/.exec(row[1]);
    assert.ok(templ[1].split(/[\s"]+/).includes(area[1]), 'rev area is in grid-template-areas');
});
