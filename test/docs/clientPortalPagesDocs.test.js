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

test('names PartWall and DrawingWindows for the client Parts page', () => {
    assert.match(doc, /PartWall/);
    assert.match(doc, /DrawingWindows/);
});

test('says up to 6 windows stay open and another closes the oldest', () => {
    assert.match(doc, /up to 6 windows/i);
    assert.match(doc, /closes the oldest/i);
});

test('says Esc closes the focused window', () => {
    assert.match(doc, /Esc closes the focused window/i);
});

test('says the admin part list keeps Click to show preview with 1 of N drawings', () => {
    assert.match(doc, /admin part list keeps[^.]*Click to show preview/i);
    assert.match(doc, /only on click/i);
    assert.match(doc, /1 of N drawings/);
});
