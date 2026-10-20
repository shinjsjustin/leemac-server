const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '../../src/client/src/components/Authentication/Logout.js'),
    'utf8'
);

test('Logout posts to the role logout route with apiFetch, ignores failures, then removes the token', () => {
    assert.match(source, /import \{ jwtDecode \} from 'jwt-decode'/);
    assert.match(source, /import \{ apiFetch \} from '[./]+\/api\/apiFetch'/);
    assert.match(source, /`\/\$\{role\}\/logout`|\/admin\/logout[\s\S]*\/client\/logout/);
    assert.match(source, /method: 'POST'/);
    assert.match(source, /catch/);

    const post = source.indexOf('apiFetch(');
    const remove = source.indexOf("localStorage.removeItem('token')");
    assert.ok(post !== -1 && remove > post, 'token is removed after the logout request');
    assert.ok(source.indexOf("navigate('/')") > remove);
});
