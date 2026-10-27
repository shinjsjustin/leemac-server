const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (name) => fs.readFileSync(path.join(__dirname, '../../docs/apps-script', name), 'utf8');

test('exportPdf.gs defines doPost, delegates to legacyDoPost and names all five actions', () => {
    const src = read('exportPdf.gs');
    assert.match(src, /function doPost\(e\)/);
    assert.match(src, /legacyDoPost\(e\)/);
    for (const action of ['exportQuote', 'exportOrder', 'exportInvoice', 'exportPackList', 'exportShipping']) {
        assert.ok(src.includes(`'${action}'`), action);
    }
});

test('exportPdf.gs replies with JSON fields, reads B5 and checks jobNumber', () => {
    const src = read('exportPdf.gs');
    for (const field of ['ok', 'jobNumber', 'pdfBase64', 'error']) {
        assert.match(src, new RegExp(`\\b${field}\\b`), field);
    }
    assert.match(src, /ContentService/);
    assert.match(src, /MimeType\.JSON/);
    assert.match(src, /getRange\('B5'\)/);
    assert.match(src, /DriveApp\.searchFiles/);
    assert.match(src, /Utilities\.base64Encode/);
    assert.match(src, /!==\s*String\(body\.jobNumber\)/);
});

test('README.md has numbered steps and says the old script is still accepted', () => {
    const md = read('README.md');
    assert.match(md, /^1\. .*$/m);
    assert.match(md, /^2\. .*$/m);
    assert.match(md, /^3\. .*$/m);
    assert.match(md, /rename.*doPost.*legacyDoPost/i);
    assert.match(md, /paste/i);
    assert.match(md, /Manage deployments/);
    assert.match(md, /new version/i);
    assert.match(md, /server still accepts the old script/i);
});
