import { safeReturnPath } from './clientReturnPath';

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const FALLBACK = '/client-overview';

describe('safeReturnPath', () => {
  test('passes a shared-list path with a 43-character token', () => {
    expect(safeReturnPath(`/client-shared/${TOKEN}`)).toBe(`/client-shared/${TOKEN}`);
  });

  test('accepts the base64url characters - and _', () => {
    const t = `${'-_'.repeat(21)}A`;
    expect(safeReturnPath(`/client-shared/${t}`)).toBe(`/client-shared/${t}`);
  });

  test.each([
    ['an outside URL', `https://evil.com/client-shared/${TOKEN}`],
    ['a protocol-relative path', `//evil.com/client-shared/${TOKEN}`],
    ['a double slash after the prefix', `/client-shared//${TOKEN}`],
    ['an extra segment', `/client-shared/${TOKEN}/more`],
    ['a query string', `/client-shared/${TOKEN}?a=1`],
    ['a trailing newline', `/client-shared/${TOKEN}\n`],
    ['a short token', `/client-shared/${TOKEN.slice(1)}`],
    ['a long token', `/client-shared/${TOKEN}a`],
    ['another page', '/client-parts'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('falls back to /client-overview for %s', (_name, next) => {
    expect(safeReturnPath(next)).toBe(FALLBACK);
  });
});
