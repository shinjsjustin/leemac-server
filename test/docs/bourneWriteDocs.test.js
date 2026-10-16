const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/bourne-api.md'), 'utf8');

test('opening line no longer calls the API read-only', () => {
    assert.doesNotMatch(doc.split('\n').slice(0, 4).join('\n'), /read-only/i);
});

test('has a section for each write route', () => {
    for (const route of ['/jobs/quote', '/jobs/:id/files', '/parts/:id/files', '/jobs/:id/po', '/jobs/:id/export-quote']) {
        const escaped = route.replace(/[/:]/g, '\\$&');
        assert.match(doc, new RegExp(`^#+ POST ${escaped}\\s*$`, 'm'), route);
    }
    assert.match(doc, /\/api\/bourne\/write/);
});

test('documents POST /parts/:id/files between the job files and po sections', () => {
    const jobFiles = doc.indexOf('### POST /jobs/:id/files');
    const partFiles = doc.indexOf('### POST /parts/:id/files');
    const po = doc.indexOf('### POST /jobs/:id/po');
    assert.ok(jobFiles >= 0 && partFiles > jobFiles && po > partFiles);
});

test('names the write key, script url, limits and audit table', () => {
    assert.match(doc, /BOURNE_WRITE_KEY/);
    assert.match(doc, /GSCRIPT_URL/);
    assert.match(doc, /30 requests per minute/);
    assert.match(doc, /20 MB/);
    assert.match(doc, /10 files/);
    assert.match(doc, /bourne_write_log/);
});

test('lists migrations 005 then 006 as manual steps before deploying', () => {
    const deployment = doc.slice(doc.search(/^#+ Deployment/m));
    assert.ok(deployment.length < doc.length, 'Deployment section exists');
    const i005 = deployment.search(/005_prices_part_fields_job_files/);
    const i006 = deployment.search(/006_bourne_write_log/);
    const iDeploy = deployment.search(/deploy the server/i);
    assert.ok(i005 >= 0 && i006 > i005 && iDeploy > i006);
    assert.match(deployment, /manual/i);
});
