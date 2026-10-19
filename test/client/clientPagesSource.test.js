const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '../../src/client/src/components/ClientComponents');
const home = fs.readFileSync(path.join(dir, 'ClientHome.js'), 'utf8');
const partList = fs.readFileSync(path.join(dir, 'ClientPartList.js'), 'utf8');

for (const [name, src] of [['ClientHome', home], ['ClientPartList', partList]]) {
    test(`${name} never calls /internal or sends a company id`, () => {
        assert.doesNotMatch(src, /\/internal\//);
        assert.doesNotMatch(src, /company_id/);
        assert.doesNotMatch(src, /companyId=/);
    });
}

test('ClientHome uses the portal for starred, jobs, notes, status and part files', () => {
    assert.match(home, /apiFetch\(\s*'\/client\/portal\/starred'/);
    assert.match(home, /\/client\/portal\/jobs\?limit=\$\{LIMIT\}&offset=\$\{currentOffset\}/);
    assert.match(home, /\/client\/portal\/jobs\/\$\{jobId\}\/notes/);
    assert.match(home, /\/client\/portal\/status/);
    assert.match(home, /\/client\/portal\/parts\/\$\{pid\}\/files/);
});

test('ClientHome links to client job pages', () => {
    assert.match(home, /navigate\(`\/client-job\/\$\{group\.job_id\}`\)/);
    assert.match(home, /navigate\(`\/client-job\/\$\{job\.id\}`\)/);
    assert.doesNotMatch(home, /navigate\(`\/job\//);
});

test('ClientPartList uses the portal and links to client part pages', () => {
    assert.match(partList, /\/client\/portal\/parts\?\$\{params\.toString\(\)\}/);
    assert.match(partList, /navigate\(`\/client-part\/\$\{id\}`\)/);
});
