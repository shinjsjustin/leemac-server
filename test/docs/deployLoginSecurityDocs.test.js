const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const doc = fs.readFileSync(path.join(__dirname, '../../docs/deploy-login-security.md'), 'utf8');

const phrases = [
  '010_login_security.sql',
  'dry-run',
  'logged out',
  'JWT_SECRET',
  'SESSION_SECRET',
  'CLIENT_URL',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'MAIL_FROM',
  'TOTP_ENCRYPTION_KEY',
  'openssl rand -hex 32',
  'leemac.co',
  'Easy DKIM',
  'CNAME',
  'v=spf1 include:amazonses.com ~all',
  'DMARC',
  'p=none',
  'p=quarantine',
  'production access',
  'npm install otpauth qrcode',
  'idea-0007',
  'credentials page',
  'Force logout',
  'Reset 2FA',
];

for (const phrase of phrases) {
  test(`login security deploy doc mentions ${phrase}`, () => {
    assert.ok(doc.includes(phrase));
  });
}

test('login security deploy doc runs the migration before deploying the server', () => {
  assert.ok(doc.indexOf('010_login_security.sql') < doc.indexOf('deploy and restart the server'));
});
