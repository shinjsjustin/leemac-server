import { companyChoices } from './companyChoices';

const companies = [
  { id: 12, name: 'zeta Corp' },
  { id: 3, name: 'Acme' },
  { id: 7, name: 'beta Works' },
];

describe('companyChoices', () => {
  test('sorts A-Z by name ignoring case and labels "Name (#id)"', () => {
    expect(companyChoices(companies, '')).toEqual([
      { id: 3, label: 'Acme (#3)' },
      { id: 7, label: 'beta Works (#7)' },
      { id: 12, label: 'zeta Corp (#12)' },
    ]);
  });

  test('filters on name case-insensitively', () => {
    expect(companyChoices(companies, 'BETA').map((c) => c.id)).toEqual([7]);
  });

  test('filters on id', () => {
    expect(companyChoices(companies, '12').map((c) => c.id)).toEqual([12]);
  });

  test('returns nothing when the filter matches neither', () => {
    expect(companyChoices(companies, 'nope')).toEqual([]);
  });

  test('does not reorder the input array', () => {
    const input = [...companies];
    companyChoices(input, '');
    expect(input).toEqual(companies);
  });
});
