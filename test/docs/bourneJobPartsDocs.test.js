const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/bourne-api.md'), 'utf8');

const ROUTES = [
    '/jobs/:id/parts',
    '/jobs/:id/parts/:jobPartId',
    '/jobs/:id/parts/:jobPartId/remove',
    '/jobs/:id/parts/:jobPartId/star',
    '/jobs/:id/parts/:jobPartId/unstar',
    '/jobs/:id/details',
    '/jobs/:id/notes',
    '/parts/:id/details',
];

const sectionOf = (route) => {
    const start = doc.indexOf(`### POST ${route}\n`);
    assert.ok(start >= 0, `section for ${route}`);
    const bodyStart = start + 4;
    const next = doc.slice(bodyStart).search(/^#{2,3} /m);
    return doc.slice(start, bodyStart + next);
};

test('has the eight P1 sections in order between export-quote and Deployment', () => {
    let last = doc.indexOf('### POST /jobs/:id/export-quote');
    assert.ok(last >= 0);
    for (const route of ROUTES) {
        const at = doc.indexOf(`### POST ${route}\n`);
        assert.ok(at > last, route);
        last = at;
    }
    assert.ok(doc.indexOf('## Deployment') > last);
});

test('each section gives an example response and errors', () => {
    for (const route of ROUTES) {
        const text = sectionOf(route);
        assert.match(text, /```json/, route);
        assert.match(text, /Errors?:/, route);
    }
});

test('states the key behaviors plainly', () => {
    assert.match(sectionOf('/jobs/:id/parts'), /price[^.\n]*defaults to 1/);
    assert.match(doc, /job_part_id/);
    const remove = sectionOf('/jobs/:id/parts/:jobPartId/remove');
    assert.match(remove, /star/);
    assert.match(remove, /keeps the part and its files/);
    assert.match(remove, /409/);
    assert.match(remove, /invoice number/);
    assert.match(sectionOf('/jobs/:id/parts/:jobPartId/star'), /defaults to the job's attention/);
    const notes = sectionOf('/jobs/:id/notes');
    assert.match(notes, /Bourne/);
    assert.match(notes, /cannot be edited or deleted/);
    assert.match(doc, /GET \/jobs\?from=N&to=N/);
});

test('Deployment applies 007 after 006 and before deploying the server', () => {
    const deployment = doc.slice(doc.search(/^## Deployment/m));
    const i006 = deployment.search(/006_bourne_write_log/);
    const i007 = deployment.search(/007_bourne_note_author\.sql/);
    const iDeploy = deployment.search(/deploy the server/i);
    assert.ok(i006 >= 0 && i007 > i006 && iDeploy > i007);
});
