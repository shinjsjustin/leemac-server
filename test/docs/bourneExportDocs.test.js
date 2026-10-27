const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/bourne-api.md'), 'utf8');

const sectionOf = (heading) => {
    const start = doc.indexOf(`${heading}\n`);
    assert.ok(start >= 0, `section ${heading}`);
    const bodyStart = start + 4;
    const next = doc.slice(bodyStart).search(/^#{2,3} /m);
    return doc.slice(start, bodyStart + next);
};

test('export section comes right before export-quote and names every type and the body', () => {
    const exp = doc.indexOf('### POST /jobs/:id/export\n');
    const quote = doc.indexOf('### POST /jobs/:id/export-quote\n');
    assert.ok(exp >= 0 && exp < quote);
    assert.strictEqual(doc.slice(exp + 4, quote).search(/^#{2,3} /m), -1);
    const section = sectionOf('### POST /jobs/:id/export');
    assert.ok(section.includes('{ "type": "quote" | "order" | "invoice" | "packing" | "shipping" }'));
});

test('export section documents the response fields and every error status', () => {
    const section = sectionOf('### POST /jobs/:id/export');
    for (const word of ['fileId', 'filename', 'jobNumber', 'GET /files/:id', 'null']) {
        assert.ok(section.includes(word), word);
    }
    for (const code of ['400', '404', '409', '502', '503', '504']) {
        assert.ok(section.includes(code), code);
    }
});

test('export-quote section says it equals type quote and mentions the saved file', () => {
    const section = sectionOf('### POST /jobs/:id/export-quote');
    assert.ok(section.includes('jobId'));
    assert.ok(section.includes('jobNumber'));
    assert.ok(/saved/i.test(section));
    assert.ok(section.includes('`quote`'));
});

test('status-code list includes 409 and 504', () => {
    const list = doc.slice(doc.indexOf('Status codes:'), doc.indexOf('Errors are JSON'));
    assert.ok(list.includes('409'));
    assert.ok(list.includes('504'));
});
