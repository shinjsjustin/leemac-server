const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');
const job = read('components/ClientComponents/ClientJob.js');
const part = read('components/ClientComponents/ClientPart.js');
const routes = read('routes.js');

test('ClientJob fetches job, files and notes from the portal and downloads via portal files', () => {
    assert.match(job, /apiFetch\(`\/client\/portal\/jobs\/\$\{id\}`\)/);
    assert.match(job, /apiFetch\(`\/client\/portal\/jobs\/\$\{id\}\/files`\)/);
    assert.match(job, /apiFetch\(`\/client\/portal\/jobs\/\$\{id\}\/notes`\)/);
    assert.match(job, /\/client\/portal\/files\/\$\{[\w.]+\}\/download/);
    assert.match(job, /\.blob\(\)/);
    assert.match(job, /\/client-part\/\$\{/);
});

test('ClientPart fetches part and files from the portal and links to client jobs', () => {
    assert.match(part, /apiFetch\(`\/client\/portal\/parts\/\$\{id\}`\)/);
    assert.match(part, /apiFetch\(`\/client\/portal\/parts\/\$\{id\}\/files`\)/);
    assert.match(part, /\/client-job\/\$\{/);
});

for (const [name, text] of [['ClientJob', job], ['ClientPart', part]]) {
    test(`${name} never touches internal routes, tax or total cost`, () => {
        assert.doesNotMatch(text, /\/internal\//);
        assert.doesNotMatch(text, /tax/i);
        assert.doesNotMatch(text, /total_cost/);
    });
}

test('routes map client detail pages inside the client ProtectedRoute', () => {
    assert.match(routes, /path: "\/client-job\/:id", element: <ProtectedRoute role="client"><ClientJob \/><\/ProtectedRoute>/);
    assert.match(routes, /path: "\/client-part\/:id", element: <ProtectedRoute role="client"><ClientPart \/><\/ProtectedRoute>/);
});
