const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '../../src/client/src', rel), 'utf8');

test('AdminUpdateCredentials renders TrustedBrowsers for the signed-in admin with no adminId', () => {
    const s = read('components/Authentication/AdminUpdateCredentials.js');
    assert.match(s, /import TrustedBrowsers from '\.\/TrustedBrowsers'/);
    assert.match(s, /<TrustedBrowsers \/>/);
});

test('AdminsDetails renders TrustedBrowsers for the viewed admin id', () => {
    const s = read('components/AdminComponents/AdminsDetails.js');
    assert.match(s, /import TrustedBrowsers from '\.\.\/Authentication\/TrustedBrowsers'/);
    assert.match(s, /<TrustedBrowsers adminId=\{id\} \/>/);
    assert.ok(s.indexOf('Reset 2FA</button>') < s.indexOf('<TrustedBrowsers'));
});
