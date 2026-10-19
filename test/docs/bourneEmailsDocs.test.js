const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/bourne-api.md'), 'utf8');

const sectionAt = (heading) => {
    const start = doc.indexOf(heading);
    assert.ok(start >= 0, heading);
    const bodyStart = start + heading.length;
    return doc.slice(start, bodyStart + doc.slice(bodyStart).search(/^#{2,3} /m));
};

test('GET email sections sit between GET /parts/:id and GET /files/:id', () => {
    const files = doc.indexOf('## GET /files/:id\n');
    const afterParts = doc.indexOf('## GET /parts/:id\n');
    for (const h of ['## GET /jobs/:id/emails\n', '## GET /parts/:id/emails\n']) {
        const at = doc.indexOf(h);
        assert.ok(at > afterParts, h);
        assert.ok(at < files, h);
    }
});

test('Endpoints list names both GET email routes', () => {
    const list = doc.slice(doc.indexOf('## Endpoints'), doc.indexOf('## Base URL'));
    assert.match(list, /`GET \/jobs\/:id\/emails`/);
    assert.match(list, /`GET \/parts\/:id\/emails`/);
});

test('GET email sections show the response fields and errors', () => {
    for (const h of ['## GET /jobs/:id/emails\n', '## GET /parts/:id/emails\n']) {
        const text = sectionAt(h);
        for (const f of ['emails', 'message_id', 'subject', 'from', 'date', 'created_by', '400', '404']) {
            assert.ok(text.includes(f), `${h} ${f}`);
        }
    }
});

test('POST /emails sits after drawings and before Deployment', () => {
    const at = doc.indexOf('### POST /emails\n');
    assert.ok(at > doc.indexOf('### POST /jobs/:id/drawings\n'));
    assert.ok(at < doc.indexOf('## Deployment'));
});

test('POST /emails names the body, limits, link fields, response and errors', () => {
    const text = sectionAt('### POST /emails\n');
    for (const f of ['links', '1 to 500', 'job_id', 'part_id', 'message_id', 'angle brackets', 'subject', 'from', 'date', 'ISO 8601',
        'created', 'existing', 'ids', '201', '400', '404', 'index']) {
        assert.ok(text.includes(f), f);
    }
    assert.match(text, /nothing (is )?saved/);
});

test('POST /emails states pointer-only storage, existing links and external approval', () => {
    const text = sectionAt('### POST /emails\n');
    assert.match(text, /only a pointer/i);
    assert.match(text, /never the body or attachments/);
    assert.match(text, /already (linked|present)[^\n]*existing/);
    assert.match(text, /outside leemac/);
});
