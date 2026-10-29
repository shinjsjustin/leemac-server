const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src');
const routes = fs.readFileSync(path.join(src, 'routes.js'), 'utf8');
const navbar = fs.readFileSync(path.join(src, 'components/Navbar.js'), 'utf8');

test('quote request inbox route requires level 2', () => {
    assert.match(routes, /import QuoteRequestInbox from '\.\/components\/AdminComponents\/QuoteRequestInbox';/);
    assert.match(routes, /path: "\/quote-requests", element: <ProtectedRoute requiredAccessLevel=\{2\}><QuoteRequestInbox \/><\/ProtectedRoute>/);
});

test('quote request review route requires level 2', () => {
    assert.match(routes, /import QuoteRequestReview from '\.\/components\/AdminComponents\/QuoteRequestReview';/);
    assert.match(routes, /path: "\/quote-request\/:id", element: <ProtectedRoute requiredAccessLevel=\{2\}><QuoteRequestReview \/><\/ProtectedRoute>/);
});

test('navbar shows Quote Requests button at level 2 right after Add Job', () => {
    assert.match(navbar, /label: 'Add Job'[^\n]*\n\s*\{ label: 'Quote Requests', path: '\/quote-requests', minAccess: 2 \},/);
});
