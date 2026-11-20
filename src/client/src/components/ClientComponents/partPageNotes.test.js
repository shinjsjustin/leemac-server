import { partNotesFor } from './partPageNotes';

const note = (id, created_at) => ({ id, created_at, content: `n${id}` });

describe('partNotesFor', () => {
  const data = { parts: { 7: [note(3, '2026-03-03T10:00:00Z'), note(1, '2026-03-01T10:00:00Z'), note(2, '2026-03-02T10:00:00Z')] } };

  it('returns the part notes oldest first for a string or number id', () => {
    expect(partNotesFor(data, '7').map((n) => n.id)).toEqual([1, 2, 3]);
    expect(partNotesFor(data, 7).map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it('does not reorder the input', () => {
    partNotesFor(data, 7);
    expect(data.parts[7].map((n) => n.id)).toEqual([3, 1, 2]);
  });

  it('returns [] for an unknown part, missing parts or missing data', () => {
    expect(partNotesFor(data, 8)).toEqual([]);
    expect(partNotesFor({ jobs: {} }, 7)).toEqual([]);
    expect(partNotesFor(null, 7)).toEqual([]);
    expect(partNotesFor(undefined, 7)).toEqual([]);
  });
});
