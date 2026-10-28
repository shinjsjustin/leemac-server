const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const comps = path.join(__dirname, '../../src/client/src/components');
const read = (p) => fs.readFileSync(path.join(comps, p), 'utf8');

for (const [name, file] of [
    ['ClientPartsPage', 'ClientComponents/ClientPartsPage.js'],
    ['ClientPartPage', 'ClientComponents/ClientPartPage.js'],
    ['PartPdfPreview', 'PartPdfPreview.js'],
]) {
    test(`${name} never calls /internal, sends a company id or exposes pricing`, () => {
        const text = read(file);
        assert.doesNotMatch(text, /\/internal\//);
        assert.doesNotMatch(text, /company_id/);
        assert.doesNotMatch(text, /tax/i);
        assert.doesNotMatch(text, /price/i);
        assert.doesNotMatch(text, /\/client\/portal/);
    });
}
