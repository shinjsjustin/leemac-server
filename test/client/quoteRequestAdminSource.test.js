const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src');
const routes = fs.readFileSync(path.join(src, 'routes.js'), 'utf8');
const adminNav = fs.readFileSync(path.join(src, 'components/AdminLayout/adminNav.js'), 'utf8');

test('quote request inbox route requires level 2', () => {
    assert.match(routes, /import QuoteRequestInbox from '\.\/components\/AdminComponents\/QuoteRequestInbox';/);
    assert.match(routes, /path: "\/quote-requests", element: <ProtectedRoute requiredAccessLevel=\{2\}><QuoteRequestInbox \/><\/ProtectedRoute>/);
});

test('quote request review route requires level 2', () => {
    assert.match(routes, /import QuoteRequestReview from '\.\/components\/AdminComponents\/QuoteRequestReview';/);
    assert.match(routes, /path: "\/quote-request\/:id", element: <ProtectedRoute requiredAccessLevel=\{2\}><QuoteRequestReview \/><\/ProtectedRoute>/);
});

test('adminNav lists Quote requests at level 2 in the Sales group', () => {
    assert.match(adminNav, /key: 'sales'[\s\S]*?\{ key: 'quote-requests', label: 'Quote requests', ko: '', path: '\/quote-requests', minAccess: 2 \},[\s\S]*?key: 'money'/);
});
