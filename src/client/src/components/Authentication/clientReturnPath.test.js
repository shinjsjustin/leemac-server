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
    '/client-part/5',
    '/client-job/12',
    '/client-part/9999999999',
  ])('passes %s unchanged', (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  test.each([
    ['an outside URL', `https://evil.com/client-shared/${TOKEN}`],
    ['an outside part URL', 'https://evil.com/client-part/5'],
    ['a protocol-relative part path', '//evil.com/client-part/5'],
    ['a part path with an extra segment', '/client-part/5/x'],
    ['a part path with a query', '/client-part/5?a=1'],
    ['a part id with a leading zero', '/client-part/05'],
    ['a zero part id', '/client-part/0'],
    ['a non-digit part id', '/client-part/abc'],
    ['an 11-digit part id', '/client-part/12345678901'],
    ['a job id with a leading zero', '/client-job/05'],
    ['a job path with a trailing newline', '/client-job/5\n'],
    ['a part path with a trailing newline', '/client-part/5\n'],
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
