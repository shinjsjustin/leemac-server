const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');
const job = read('components/ClientComponents/ClientJob.js');
const home = read('components/ClientComponents/ClientHome.js');
const api = read('api/portalApi.js');
const clientRoutes = read('clientRoutes.js');

test('ClientJob imports the portal api helper', () => {
    assert.match(job, /from '\.\.\/\.\.\/api\/portalApi'/);
});

test('clientRoutes maps the job and part pages with no redirect left', () => {
    assert.match(clientRoutes, /path: '\/client-job\/:id', element: <ProtectedRoute role="client"><ClientJob \/><\/ProtectedRoute>/);
    assert.match(clientRoutes, /path: '\/client-parts', element: <ProtectedRoute role="client"><ClientPartsPage \/><\/ProtectedRoute>/);
    assert.match(clientRoutes, /path: '\/client-part\/:id', element: <ProtectedRoute role="client"><ClientPartPage \/><\/ProtectedRoute>/);
    const redirect = /^.*path: '\/client-request', element: <ProtectedRoute role="client"><Navigate to="\/client-requests" replace \/><\/ProtectedRoute>.*\n/m;
    const navigateImport = /^import \{ Navigate \} from 'react-router-dom';\n/m;
    assert.match(clientRoutes, redirect);
    assert.doesNotMatch(clientRoutes.replace(redirect, '').replace(navigateImport, ''), /Navigate/);
});

test('ClientPart.js is gone', () => {
    assert.ok(!fs.existsSync(path.join(src, 'components/ClientComponents/ClientPart.js')));
});

for (const [name, text] of [['ClientHome', home], ['ClientJob', job], ['portalApi', api]]) {
    test(`${name} never touches internal routes, company ids, tax or total cost`, () => {
        assert.doesNotMatch(text, /\/internal\//);
        assert.doesNotMatch(text, /company_id/);
        assert.doesNotMatch(text, /companyId=/);
        assert.doesNotMatch(text, /tax/i);
        assert.doesNotMatch(text, /total_cost/);
        assert.doesNotMatch(text, /\/client\/portal/);
    });
}
