const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

const state = { secretSizes: [], totpOptions: [], validateCalls: [], delta: 0 };

class Secret {
  constructor({ size }) {
    state.secretSizes.push(size);
    this.base32 = 'STUBBASE32SECRET';
  }

  static fromBase32(text) {
    return { fromBase32: text };
  }
}

class TOTP {
  constructor(options) {
    this.options = options;
    state.totpOptions.push(options);
  }

  validate(args) {
    state.validateCalls.push(args);
    return state.delta;
  }

  toString() {
    const o = this.options;
    return `otpauth://totp/${o.issuer}:${o.label}?issuer=${o.issuer}&algorithm=${o.algorithm}&digits=${o.digits}&period=${o.period}`;
  }
}

const stubs = {
  otpauth: { Secret, TOTP },
  qrcode: { toDataURL: async () => 'data:image/png;base64,STUB' },
};

const originalLoad = Module._load;
let totp;

before(() => {
  Module._load = function load(request, ...rest) {
    if (Object.hasOwn(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, ...rest);
  };
  totp = require('../../src/lib/totp');
});

after(() => {
  Module._load = originalLoad;
});

beforeEach(() => {
  state.secretSizes.length = 0;
  state.totpOptions.length = 0;
  state.validateCalls.length = 0;
  state.delta = 0;
});

const NOW = 1_700_000_000_000;
const STEP = Math.floor(NOW / 30000);

test('verifyCode returns the current step plus the stub delta', () => {
  for (const delta of [-1, 0, 1]) {
    state.delta = delta;
    assert.strictEqual(totp.verifyCode('SECRET', '123456', NOW), STEP + delta);
  }
});

test('verifyCode returns null when the stub finds no match', () => {
  state.delta = null;
  assert.strictEqual(totp.verifyCode('SECRET', '123456', NOW), null);
});

test('verifyCode does not throw on undefined or non-string codes', () => {
  state.delta = null;
  for (const code of [undefined, null, 123456, {}, []]) {
    assert.strictEqual(totp.verifyCode('SECRET', code, NOW), null);
  }
});

test('verifyCode builds the TOTP with issuer, SHA1, 6 digits, 30s period', () => {
  totp.verifyCode('SECRET', '123456', NOW);
  assert.strictEqual(state.totpOptions.length, 1);
  const o = state.totpOptions[0];
  assert.strictEqual(o.issuer, 'LEEMAC');
  assert.strictEqual(o.algorithm, 'SHA1');
  assert.strictEqual(o.digits, 6);
  assert.strictEqual(o.period, 30);
  assert.deepStrictEqual(o.secret, { fromBase32: 'SECRET' });
});

test('verifyCode validates with window 1 and the given timestamp', () => {
  totp.verifyCode('SECRET', '123456', NOW);
  assert.deepStrictEqual(state.validateCalls, [{ token: '123456', timestamp: NOW, window: 1 }]);
});

test('generateSecret asks Secret for 20 bytes and returns its base32', () => {
  assert.strictEqual(totp.generateSecret(), 'STUBBASE32SECRET');
  assert.deepStrictEqual(state.secretSizes, [20]);
});

test('keyUri returns the stub URI for the label and settings', () => {
  assert.strictEqual(
    totp.keyUri('SECRET', 'a@b.c'),
    'otpauth://totp/LEEMAC:a@b.c?issuer=LEEMAC&algorithm=SHA1&digits=6&period=30'
  );
});

test('qrDataUrl resolves the stub QRCode.toDataURL result', async () => {
  assert.strictEqual(await totp.qrDataUrl('otpauth://x'), 'data:image/png;base64,STUB');
});
