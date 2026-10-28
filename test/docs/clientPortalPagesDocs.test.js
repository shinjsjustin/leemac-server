const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/client-portal-parts.md'), 'utf8');

test('names both client pages and the Parts link on the home page', () => {
    assert.match(doc, /\/client-parts/);
    assert.match(doc, /\/client-part\/:id/);
    assert.match(doc, /Parts link[^.]*\/client-home/i);
});

test('says the search is remembered for the browser session', () => {
    assert.match(doc, /remembered for the browser session/i);
});

test('says previews load only on click and shows 1 of N drawings', () => {
    assert.match(doc, /only on click/i);
    assert.match(doc, /1 of N drawings/);
});

test('says the admin part list has the same preview', () => {
    assert.match(doc, /admin part list has the same preview/i);
});
