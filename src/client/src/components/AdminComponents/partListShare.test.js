import { shareLink, hiddenFromNames, canManageSharing } from './partListShare';

describe('shareLink', () => {
  it('builds origin, /client-shared/ and token', () => {
    expect(shareLink('https://x.test', 'abc')).toBe('https://x.test/client-shared/abc');
  });
  it('returns null when the token is null', () => {
    expect(shareLink('https://x.test', null)).toBeNull();
  });
});

describe('hiddenFromNames', () => {
  const sharing = {
    members: [
      { company_id: 1, company_name: 'Acme' },
      { company_id: 2, company_name: 'Globex' },
    ],
    parts: [
      { part_id: 5, hidden_from: [2, 1] },
      { part_id: 6, hidden_from: [] },
    ],
  };
  it('turns hidden_from ids into member company names', () => {
    expect(hiddenFromNames(sharing, 5)).toEqual(['Globex', 'Acme']);
  });
  it('is empty for a part all can see', () => {
    expect(hiddenFromNames(sharing, 6)).toEqual([]);
  });
  it('is empty for a part not in the sharing data or no sharing', () => {
    expect(hiddenFromNames(sharing, 99)).toEqual([]);
    expect(hiddenFromNames(null, 5)).toEqual([]);
  });
});

describe('canManageSharing', () => {
  it.each([[3, true], [2, false], [1, false], [undefined, false]])('level %s -> %s', (level, expected) => {
    expect(canManageSharing(level)).toBe(expected);
  });
});
