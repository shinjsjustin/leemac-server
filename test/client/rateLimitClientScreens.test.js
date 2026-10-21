const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const auth = (name) => fs.readFileSync(
    path.join(__dirname, '../../src/client/src/components/Authentication', `${name}.js`), 'utf8');

const SCREENS = {
    ClientLogin: 'response',
    ClientTwoFactor: 'response',
    ClientTwoFactorSettings: 'response',
    ClientRegister: 'response',
    ClientUpdateCredentials: 'passwordResponse',
    AcceptInvite: 'response',
};

// First place a screen reacts to some other outcome: another status, an ok check, or the generic message.
const OTHER_BRANCH = /status === (?!429)\d+|\.ok\b|Server side error/;

for (const [name, resp] of Object.entries(SCREENS)) {
    test(`${name} imports tooManyAttemptsMessage from apiFetch`, () => {
        assert.match(auth(name), /import \{[^}]*\btooManyAttemptsMessage\b[^}]*\} from '\.\.\/\.\.\/api\/apiFetch'/);
    });

    test(`${name} handles 429 with tooManyAttemptsMessage before any other branch`, () => {
        const s = auth(name);
        const at = s.search(new RegExp(`${resp}\\.status === 429`));
        assert.ok(at >= 0, '429 branch missing');
        assert.match(s.slice(at, at + 400), new RegExp(`tooManyAttemptsMessage\\(${resp}\\)`));
        assert.ok(at < s.search(OTHER_BRANCH), '429 branch must come first');
    });
}
