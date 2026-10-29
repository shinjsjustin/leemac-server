const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/Styling');
const files = fs.readdirSync(dir).filter((f) => /^Portal.*\.css$/.test(f));
const indexCss = fs.readFileSync(path.join(__dirname, '../../src/client/src/index.css'), 'utf8');
const definedTokens = new Set([...indexCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

// Keyframes steps (from/to/50%) are not selectors, so drop the whole block.
function stripKeyframes(text) {
    return text.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
}

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

for (const file of files) {
    const css = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    test(`every @keyframes name in ${file} starts with portal-`, () => {
        for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) assert.match(m[1], /^portal-/, `global keyframes name: ${m[1]}`);
    });

    test(`every --space-* token used in ${file} is defined in index.css`, () => {
        for (const m of css.matchAll(/var\(\s*(--space-[\w-]+)/g)) assert.ok(definedTokens.has(m[1]), `undefined token: ${m[1]}`);
    });

    test(`every ${file} selector starts with .portal-shell`, () => {
        for (const s of selectors(stripKeyframes(css))) assert.match(s, /^\.portal-shell(?![\w-])/, `unscoped selector: ${s}`);
    });

    test(`every var() in ${file} is a --portal-* or --space-* token`, () => {
        for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) assert.match(m[1], /^--(portal|space)-/, `bad token: ${m[1]}`);
    });
}
