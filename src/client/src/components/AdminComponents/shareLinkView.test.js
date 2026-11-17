import { shareUrl, expiryText, opensText, panelActions } from './shareLinkView';

describe('shareUrl', () => {
  test.each([
    ['quote', 'abc', 'https://x.test/share/quote/abc'],
    ['qc', 'def', 'https://x.test/share/qc/def'],
  ])('%s link', (type, token, expected) => {
    expect(shareUrl('https://x.test', type, token)).toBe(expected);
  });
});

describe('expiryText', () => {
  test('shows the expiry date', () => {
    expect(expiryText({ expires_at: '2026-03-05T12:00:00' })).toBe('Expires Mar 5, 2026');
  });
});

describe('opensText', () => {
  test('says not opened yet at zero opens', () => {
    expect(opensText({ open_count: 0, last_opened_at: null })).toBe('Not opened yet');
  });
  test('gives count and last date', () => {
    expect(opensText({ open_count: 3, last_opened_at: '2026-02-10T12:00:00' })).toBe('Opened 3 times, last Feb 10, 2026');
  });
  test('uses singular for one open', () => {
    expect(opensText({ open_count: 1, last_opened_at: '2026-02-10T12:00:00' })).toBe('Opened 1 time, last Feb 10, 2026');
  });
});

describe('panelActions', () => {
  const link = { id: 1 };
  test('level 3 with a live link can copy and turn off', () => {
    expect(panelActions({ link, ready: true, accessLevel: 3 })).toEqual({
      copy: { show: true, reason: '' },
      turnOff: { show: true },
    });
  });
  test('level 3 without a link can copy (creates one) but not turn off', () => {
    expect(panelActions({ link: null, ready: true, accessLevel: 3 })).toEqual({
      copy: { show: true, reason: '' },
      turnOff: { show: false },
    });
  });
  test('level 2 copies a live link only and cannot turn off', () => {
    expect(panelActions({ link, ready: true, accessLevel: 2 })).toEqual({
      copy: { show: true, reason: '' },
      turnOff: { show: false },
    });
    expect(panelActions({ link: null, ready: true, accessLevel: 2 }).copy).toEqual({
      show: false,
      reason: 'No share link yet. A level 3 admin can create one.',
    });
  });
  test('not ready hides Copy with a reason at any level', () => {
    expect(panelActions({ link, ready: false, accessLevel: 3 }).copy).toEqual({ show: false, reason: 'Save the quote first' });
    expect(panelActions({ link, ready: false, accessLevel: 2 }).copy).toEqual({ show: false, reason: 'Save the quote first' });
  });
});
