const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
    path.join(__dirname, '../../src/client/src/components/Authentication/TwoFactor.js'), 'utf8');

test('TwoFactor imports skipWithTrustedBrowser and saveDeviceToken from the trustedDevices api', () => {
    assert.match(source,
        /import \{\s*skipWithTrustedBrowser,\s*saveDeviceToken\s*\} from '\.\.\/\.\.\/api\/trustedDevices'/);
});

test('trust checkbox is unticked by default and only inside the enter_code form', () => {
    assert.match(source, /useState\(false\)/);
    assert.match(source, /trustBrowser/);
    assert.equal((source.match(/type="checkbox"/g) || []).length, 1);
    assert.equal((source.match(/Trust this browser for 30 days/g) || []).length, 1);
    const form = source.slice(source.indexOf("step === 'enter_code' && ("));
    assert.match(form, /type="checkbox"/);
    assert.match(form, /checked=\{trustBrowser\}/);
    assert.match(form, /Trust this browser for 30 days/);
    const beforeForm = source.slice(0, source.indexOf("step === 'enter_code' && ("));
    assert.doesNotMatch(beforeForm, /Trust this browser/);
});

test('verify posts trustBrowser and saves data.deviceToken before finish', () => {
    assert.match(source, /post\('\/admin\/mfa\/verify', \{ code, trustBrowser \}\)/);
    const verify = source.slice(source.indexOf('const handleVerify'));
    const save = verify.indexOf('saveDeviceToken(data.deviceToken)');
    assert.ok(save > -1);
    assert.match(verify, /if \(data\.deviceToken\)/);
    assert.ok(save < verify.indexOf('finish(data.token)'));
});

test('enter_code step tries the trusted browser before setStep, and finishes with its token', () => {
    const effect = source.slice(source.indexOf("post('/admin/mfa/status')"));
    const skip = effect.indexOf('skipWithTrustedBrowser(pendingToken)');
    assert.ok(skip > -1);
    assert.match(effect.slice(0, skip), /data\.step === 'enter_code'/);
    const finishAt = effect.indexOf('finish(trustedToken)');
    assert.ok(finishAt > skip);
    assert.match(effect.slice(skip, finishAt), /if \(trustedToken\)/);
    assert.match(effect.slice(finishAt, effect.indexOf('setStep(data.step)') + 1), /return;/);
    assert.ok(effect.indexOf('setStep(data.step)') > finishAt);
});
