const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const docs = fs.readFileSync(path.join(__dirname, '../../docs/bourne-api.md'), 'utf8');

function section() {
    const start = docs.indexOf('## GET /companies');
    const end = docs.indexOf('## Write API');
    return docs.slice(start, end);
}

test('lists GET /companies in Endpoints after the finance period bullet', () => {
    const periods = docs.indexOf('- `GET /finances/periods/:id`');
    const companies = docs.indexOf('- `GET /companies`');
    assert.ok(periods >= 0);
    assert.ok(companies > periods);
});

test('has a GET /companies section between finance period and Write API', () => {
    const periods = docs.indexOf('## GET /finances/periods/:id');
    const heading = docs.indexOf('## GET /companies');
    const write = docs.indexOf('## Write API');
    assert.ok(heading > periods);
    assert.ok(write > heading);
});

test('companies section documents params, fields and ordering', () => {
    const text = section();
    for (const term of ['q', 'limit', 'offset', 'address_line1', 'address_line2', 'ordered by name']) {
        assert.ok(text.includes(term), `missing ${term}`);
    }
});
