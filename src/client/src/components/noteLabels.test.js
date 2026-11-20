import { NOTE_TABS, visibilityLabel, PRIVATE_LABEL, SHARED_LABEL } from './noteLabels';

const MIXED = [
  { id: 1, shared: 0 },
  { id: 2, shared: 1 },
  { id: 3, shared: true },
  { id: 4, shared: false },
  { id: 5 },
];

test.each([
  [{ shared: 1 }, 'Shared with client'],
  [{ shared: true }, 'Shared with client'],
  [{ shared: 0 }, 'Private (Leemac only)'],
  [{}, 'Private (Leemac only)'],
])('visibilityLabel(%j) is %s', (note, label) => {
  expect(visibilityLabel(note)).toBe(label);
});

test('tab filters split a mixed list into private and shared', () => {
  const ids = (key) => MIXED.filter(NOTE_TABS.find((t) => t.key === key).filter).map((n) => n.id);
  expect(ids('all')).toEqual([1, 2, 3, 4, 5]);
  expect(ids('private')).toEqual([1, 4, 5]);
  expect(ids('shared')).toEqual([2, 3]);
});

test('tabs are labelled All, private and shared', () => {
  expect(NOTE_TABS.map((t) => t.label)).toEqual(['All', PRIVATE_LABEL, SHARED_LABEL]);
});
