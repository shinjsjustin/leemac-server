const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '../../src/client/src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');

test('AddPart does not wrap itself in AdminLayout', () => {
    assert.doesNotMatch(read('components/AdminComponents/AddPart.js'), /AdminLayout/);
});

test('the /add-part route wraps AddPart in AdminLayout for Parts › Add part', () => {
    const line = read('routes.js').split('\n').find((l) => l.includes('path: "/add-part"'));
    assert.match(
        line,
        /<AdminLayout current="parts" crumb="Parts › Add part">\s*<AddPart \/>\s*<\/AdminLayout>/
    );
});
