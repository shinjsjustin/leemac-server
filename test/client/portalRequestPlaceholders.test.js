const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs
    .readFileSync(path.join(__dirname, '../../src/client/src/components/Styling/ClientPortal.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const SELECTOR = '.portal-shell .portal-request-row .portal-input::placeholder';
const MEDIA = '@media (min-width: 768px)';

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

// Returns the bodies of every rule whose selector list contains SELECTOR, joined, or null.
function body(source) {
    const re = /([^{}]+)\{([^}]*)\}/g;
    const found = [];
    let m;
    while ((m = re.exec(source))) {
        if (m[1].split(',').map((s) => s.trim()).includes(SELECTOR)) found.push(m[2]);
    }
    return found.length ? found.join('\n') : null;
}

const { outside, inside } = split(css, MEDIA);

test('grid input placeholders are transparent outside media queries', () => {
    const rule = body(outside);
    assert.ok(rule, 'missing placeholder rule outside @media');
    assert.match(rule, /color:\s*transparent/);
    assert.match(rule, /opacity:\s*1/);
});

test('grid input placeholders are muted from 768px up', () => {
    const rule = body(inside);
    assert.ok(rule, 'missing placeholder rule inside @media (min-width: 768px)');
    assert.match(rule, /color:\s*var\(--portal-text-muted\)/);
    assert.match(rule, /opacity:\s*1/);
});
