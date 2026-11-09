import { splitRequests, statusLabel, pingedLabel } from './qcRequestsView';

const row = (over) => ({ id: 1, status: 'open', photo_count: 0, ...over });

describe('statusLabel', () => {
  it.each([
    [{ status: 'open', photo_count: 0 }, 'Waiting for photos'],
    [{ status: 'open', photo_count: 2 }, 'Photos started'],
    [{ status: 'answered', photo_count: 2 }, 'Answered'],
    [{ status: 'dismissed', photo_count: 0 }, 'Dismissed'],
  ])('labels %j as %s', (over, label) => {
    expect(statusLabel(row(over))).toBe(label);
  });
});

describe('splitRequests', () => {
  it('separates open rows from closed rows, keeping order', () => {
    const rows = [
      row({ id: 1, status: 'open' }),
      row({ id: 2, status: 'answered' }),
      row({ id: 3, status: 'open' }),
      row({ id: 4, status: 'dismissed' }),
    ];
    const { open, closed } = splitRequests(rows);
    expect(open.map((r) => r.id)).toEqual([1, 3]);
    expect(closed.map((r) => r.id)).toEqual([2, 4]);
  });

  it('returns empty lists for no rows', () => {
    expect(splitRequests([])).toEqual({ open: [], closed: [] });
  });
});

describe('pingedLabel', () => {
  const now = new Date(2026, 5, 15, 12, 0, 0);
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;

  it('gives minutes under an hour', () => {
    expect(pingedLabel(ago(18 * MIN), now)).toBe('18 min ago');
  });

  it('gives whole hours within the same day', () => {
    expect(pingedLabel(ago(90 * MIN), now)).toBe('1 h ago');
    expect(pingedLabel(ago(5 * HOUR), now)).toBe('5 h ago');
  });

  it('says yesterday for the previous calendar day', () => {
    expect(pingedLabel(new Date(2026, 5, 14, 23, 30).toISOString(), now)).toBe('yesterday');
  });

  it('gives a date for older pings', () => {
    expect(pingedLabel(new Date(2026, 5, 10, 9, 0).toISOString(), now)).toBe('Jun 10');
  });

  it('gives a date for a ping from earlier than yesterday even if under 48 hours old', () => {
    const late = new Date(2026, 5, 15, 1, 0);
    expect(pingedLabel(new Date(2026, 5, 13, 23, 0).toISOString(), late)).toBe('Jun 13');
  });
});
