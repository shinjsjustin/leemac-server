const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/Styling');
const files = ['PortalTile.css', 'PortalPins.css', 'PortalWindows.css'].filter((f) => fs.existsSync(path.join(dir, f)));

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

    test(`every ${file} selector starts with .portal-shell`, () => {
        for (const s of selectors(css)) assert.match(s, /^\.portal-shell(?![\w-])/, `unscoped selector: ${s}`);
    });

    test(`every var() in ${file} is a --portal-* or --space-* token`, () => {
        for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) assert.match(m[1], /^--(portal|space)-/, `bad token: ${m[1]}`);
    });
}
