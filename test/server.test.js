const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SERVER_PATH = path.resolve(__dirname, '..', 'src', 'server.js');
const TIMEOUT_MS = 10000;

function runServer(sessionSecret) {
    const env = { ...process.env };
    delete env.SESSION_SECRET;
    if (sessionSecret !== undefined) env.SESSION_SECRET = sessionSecret;
    return spawnSync(process.execPath, [SERVER_PATH], {
        cwd: os.tmpdir(),
        env,
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
    });
}

for (const [label, value] of [['unset', undefined], ['empty', ''], ['blank', '   ']]) {
    test(`exits non-zero naming SESSION_SECRET when it is ${label}`, () => {
        const result = runServer(value);
        assert.notStrictEqual(result.status, 0);
        assert.notStrictEqual(result.status, null, 'server hung or was killed');
        assert.match(result.stderr, /SESSION_SECRET/);
    });
}
