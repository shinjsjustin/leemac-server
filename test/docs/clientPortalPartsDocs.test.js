const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/client-portal-parts.md'), 'utf8');

test('names both routes, the search params and every field of both', () => {
    assert.match(doc, /GET \/api\/portal\/parts\b(?!\/)/);
    assert.match(doc, /GET \/api\/portal\/parts\/:id/);
    for (const param of ['number', 'description']) assert.match(doc, new RegExp('`' + param + '`'), param);
    const fields = [
        'part_id', 'part_number', 'part_description', 'jobs', 'job_number',
        'drawing_count', 'latest_drawing', 'drawings',
        'id', 'filename', 'mimetype', 'size', 'uploaded_at',
    ];
    for (const field of fields) assert.match(doc, new RegExp('`' + field + '`'), field);
    assert.match(doc, /404/);
});

test('says a shared part shows each company only its own jobs', () => {
    assert.match(doc, /shared across companies[^.]*only its own jobs/i);
});

test('says the list has no prices and the newest PDF is the most recently uploaded', () => {
    assert.match(doc, /no prices/i);
    assert.match(doc, /newest[^.]*most recently uploaded/i);
    assert.match(doc, /\/api\/portal\/files\/:id/);
});

test('names drawing_count and latest_drawing on the admin getparts route', () => {
    const section = doc.slice(doc.indexOf('/api/internal/part/getparts'));
    assert.ok(section.length > 0);
    assert.match(section, /drawing_count/);
    assert.match(section, /latest_drawing/);
});
