import { jobsQuery, ledgerFilter } from './jobListQuery';

const base = { sortBy: 'created_at', order: 'desc', limit: 35, offset: 0, attention: '' };
const PREFIX = '/internal/job/getjobs?sortBy=created_at&order=desc&limit=35&offset=0&attention=';

describe('jobsQuery', () => {
  test.each([
    ['no filter', undefined, PREFIX],
    ['empty filter', {}, PREFIX],
    ['period', { periodId: 7 }, `${PREFIX}&periodId=7`],
    ['dates', { from: '2026-10-01', to: '2026-12-31' }, `${PREFIX}&from=2026-10-01&to=2026-12-31`],
    ['half a date range', { from: '2026-10-01' }, PREFIX],
    ['period wins over dates', { periodId: 7, from: '2026-10-01', to: '2026-12-31' }, `${PREFIX}&periodId=7`],
  ])('%s', (_name, filter, expected) => {
    expect(jobsQuery({ ...base, filter })).toBe(expected);
  });

  test('encodes the attention search', () => {
    expect(jobsQuery({ ...base, attention: 'a b' })).toBe(`${PREFIX}a%20b`);
  });
});

describe('ledgerFilter', () => {
  const periods = [{ id: 7, lable: 'Q4 2026' }];

  test.each([
    ['period', { periodId: '7', periods }, { filter: { periodId: '7' }, label: 'Q4 2026' }],
    ['dates', { from: '2026-10-01', to: '2026-12-31', periods }, { filter: { from: '2026-10-01', to: '2026-12-31' }, label: '2026-10-01 to 2026-12-31' }],
    ['nothing chosen', { periods }, null],
    ['only from', { from: '2026-10-01', periods }, null],
    ['unknown period', { periodId: '9', periods }, null],
  ])('%s', (_name, state, expected) => {
    expect(ledgerFilter(state)).toEqual(expected);
  });
});
