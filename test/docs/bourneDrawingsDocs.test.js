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

const drawings = () => sectionAt('### POST /jobs/:id/drawings\n');

test('drawings section sits between parts details and Deployment', () => {
    const at = doc.indexOf('### POST /jobs/:id/drawings\n');
    assert.ok(at > doc.indexOf('### POST /parts/:id/details\n'));
    assert.ok(at < doc.indexOf('## Deployment'));
});

test('drawings section names the multipart body, files and fields', () => {
    const text = drawings();
    assert.match(text, /multipart\/form-data/);
    for (const f of ['`drawing`', '`step`', '.stp', 'part_number', 'title', 'rev', 'material', 'finish', 'quantity', 'stock_size']) {
        assert.ok(text.includes(f), f);
    }
});

test('drawings section shows the example response and errors', () => {
    const text = drawings();
    for (const f of ['job_part_id', 'part_id', 'part_created', 'file_ids', '201', '404', '400', '413', '20 MB']) {
        assert.ok(text.includes(f), f);
    }
});

test('drawings section states reuse and default price', () => {
    const text = drawings();
    assert.match(text, /existing part number reuses that part/);
    assert.match(text, /doesn't change its description/);
    assert.match(text, /price[^\n]*defaults to 1/);
    assert.match(text, /another copy/);
});

test('job details section limits attention to 100 characters', () => {
    assert.match(sectionAt('### POST /jobs/:id/details\n'), /attention[^\n]*at most 100 characters/);
});
