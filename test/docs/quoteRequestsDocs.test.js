const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/bourne-api.md'), 'utf8');
const feature = fs.readFileSync(path.join(__dirname, '../../docs/quote-requests.md'), 'utf8');

const sectionAt = (heading) => {
    const start = doc.indexOf(heading);
    assert.ok(start >= 0, heading);
    const bodyStart = start + heading.length;
    return doc.slice(start, bodyStart + doc.slice(bodyStart).search(/^#{2,3} /m));
};

const READ_HEADINGS = ['## GET /quote-requests\n', '## GET /quote-requests/:id\n', '## GET /quote-requests/:id/files/:fileId\n'];

test('Endpoints list names the three quote request read routes', () => {
    const list = doc.slice(doc.indexOf('## Endpoints'), doc.indexOf('## Base URL'));
    assert.match(list, /`GET \/quote-requests`/);
    assert.match(list, /`GET \/quote-requests\/:id`/);
    assert.match(list, /`GET \/quote-requests\/:id\/files\/:fileId`/);
});

test('quote request read sections sit after GET /companies and before Write API', () => {
    const after = doc.indexOf('## GET /companies\n');
    const before = doc.indexOf('## Write API');
    for (const h of READ_HEADINGS) {
        const at = doc.indexOf(h);
        assert.ok(at > after, h);
        assert.ok(at < before, h);
    }
});

test('read sections say drafts are hidden and prices never returned', () => {
    const text = READ_HEADINGS.map(sectionAt).join('\n');
    assert.match(text, /draft/);
    assert.match(text, /price/);
    assert.match(text, /bourne_suggestion/);
    assert.match(text, /404/);
});

test('suggest section sits after POST /emails and before Deployment and rejects price', () => {
    const h = '### POST /quote-requests/:id/lines/:lineId/suggest\n';
    const at = doc.indexOf(h);
    assert.ok(at > doc.indexOf('### POST /emails\n'));
    assert.ok(at < doc.indexOf('## Deployment'));
    const text = sectionAt(h);
    for (const f of ['part_number', 'rev', 'material', 'finish', 'description', '400', '404', '409']) {
        assert.ok(text.includes(f), f);
    }
    assert.match(text, /price[^\n]*(rejected|400)/);
});

test('Deployment applies migration 012 after 007 and before deploying the server', () => {
    const deploy = doc.slice(doc.indexOf('## Deployment'));
    const m007 = deploy.indexOf('007_bourne_note_author.sql');
    const m012 = deploy.indexOf('012_quote_requests.sql');
    assert.ok(m007 >= 0 && m012 > m007);
    assert.ok(m012 < deploy.indexOf('Deploy the server'));
});

test('quote-requests.md names the APIs, pages, limits, env var and migration', () => {
    for (const f of ['/api/portal-requests', '/api/internal/quote-requests', 'level 2',
        '/client-requests', '/client-request/new', '/client-request/:id', '/quote-requests', '/quote-request/:id',
        '20 MB', '10 files', '60 files', '60 writes', '15 minutes', 'QUOTE_REQUEST_EMAIL', '012_quote_requests.sql']) {
        assert.ok(feature.includes(f), f);
    }
    assert.match(feature, /before (you )?deploy/i);
});

test('quote request examples never show the status submitted', () => {
    assert.ok(!doc.includes('"status": "submitted"'));
});

test('quote request read sections list sent, in_review and job_created and show sent', () => {
    const list = sectionAt('## GET /quote-requests\n');
    assert.match(list, /sent[^\n]*in_review[^\n]*job_created/);
    assert.ok(list.includes('"status": "sent"'));
    assert.ok(sectionAt('## GET /quote-requests/:id\n').includes('"status": "sent"'));
});
