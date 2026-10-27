const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src/components');
const drawing = fs.readFileSync(path.join(src, 'ClientComponents/PortalDrawing.js'), 'utf8');
const pdf = fs.readFileSync(path.join(src, 'PdfImage.js'), 'utf8');

test('PortalDrawing has no inline styles or internal/company references', () => {
    assert.doesNotMatch(drawing, /style=/);
    assert.doesNotMatch(drawing, /\/internal\//);
    assert.doesNotMatch(drawing, /company_id/);
});

test('PortalDrawing imports portalApi', () => {
    assert.match(drawing, /from '\.\.\/\.\.\/api\/portalApi'/);
});

test('PdfImage still exports both components and the hook', () => {
    assert.match(pdf, /export const PdfThumbnail\b/);
    assert.match(pdf, /export const PdfPageStack\b/);
    assert.match(pdf, /export const usePdfPageImages\b/);
});
