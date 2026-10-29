const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src');
const dir = path.join(src, 'components/ClientComponents');
const home = fs.readFileSync(path.join(dir, 'ClientHome.js'), 'utf8');
const jobRow = fs.readFileSync(path.join(dir, 'JobRow.js'), 'utf8');
const job = fs.readFileSync(path.join(dir, 'ClientJob.js'), 'utf8');
const api = fs.readFileSync(path.join(src, 'api/portalApi.js'), 'utf8');

for (const [name, text] of [['ClientHome', home], ['ClientJob', job], ['portalApi', api]]) {
    test(`${name} never calls /internal, sends a company id or exposes pricing`, () => {
        assert.doesNotMatch(text, /\/internal\//);
        assert.doesNotMatch(text, /company_id/);
        assert.doesNotMatch(text, /companyId=/);
        assert.doesNotMatch(text, /tax/i);
        assert.doesNotMatch(text, /total_cost/);
        assert.doesNotMatch(text, /\/client\/portal/);
    });
}

test('JobRow links to client job pages and ClientHome uses it', () => {
    assert.match(jobRow, /\/client-job\//);
    assert.match(home, /import JobRow from '\.\/JobRow'/);
    assert.doesNotMatch(home, /navigate\(`\/job\//);
});

test('portalApi calls /portal/ paths', () => {
    assert.match(api, /`\/portal\/jobs/);
    assert.match(api, /`\/portal\/files\//);
});

test('ClientPartList.js is gone', () => {
    assert.ok(!fs.existsSync(path.join(dir, 'ClientPartList.js')));
});
