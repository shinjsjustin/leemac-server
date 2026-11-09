import { fitWithin, jobsFor, defaultJobId, moveId, photosByMarking } from './qcPhotoTray';

describe('fitWithin', () => {
  test.each([
    [4000, 3000, { width: 2000, height: 1500 }],
    [3000, 4000, { width: 1500, height: 2000 }],
    [1000, 500, { width: 1000, height: 500 }],
    [2000, 2000, { width: 2000, height: 2000 }],
  ])('%ix%i fits to %o', (w, h, expected) => {
    expect(fitWithin(w, h)).toEqual(expected);
  });

  test('uses a custom cap', () => {
    expect(fitWithin(400, 200, 100)).toEqual({ width: 100, height: 50 });
  });
});

const JOBS = [
  { id: 1, job_number: 'A', company_id: 7, created_at: '2026-01-01' },
  { id: 3, job_number: 'C', company_id: 8, created_at: '2026-03-01' },
  { id: 2, job_number: 'B', company_id: 7, created_at: '2026-02-01' },
  { id: 4, job_number: 'D', company_id: 7, created_at: '2026-02-01' },
];

describe('jobsFor', () => {
  test('lists only the marking company jobs for a client marking, newest first', () => {
    expect(jobsFor({ company_id: 7 }, JOBS).map((j) => j.id)).toEqual([4, 2, 1]);
  });

  test('lists every job for a Leemac marking', () => {
    expect(jobsFor({ company_id: null }, JOBS).map((j) => j.id)).toEqual([3, 4, 2, 1]);
  });

  test('does not reorder the input', () => {
    jobsFor({ company_id: null }, JOBS);
    expect(JOBS.map((j) => j.id)).toEqual([1, 3, 2, 4]);
  });
});

describe('defaultJobId', () => {
  test('is the newest allowed job', () => {
    expect(defaultJobId({ company_id: 8 }, JOBS)).toBe(3);
  });

  test('is null when no job is allowed', () => {
    expect(defaultJobId({ company_id: 99 }, JOBS)).toBeNull();
  });
});

describe('moveId', () => {
  test.each([
    [[1, 2, 3], 2, 'left', [2, 1, 3]],
    [[1, 2, 3], 2, 'right', [1, 3, 2]],
    [[1, 2, 3], 1, 'left', [1, 2, 3]],
    [[1, 2, 3], 3, 'right', [1, 2, 3]],
  ])('%o moving %i %s gives %o', (ids, id, direction, expected) => {
    expect(moveId(ids, id, direction)).toEqual(expected);
  });

  test('returns a copy and leaves the input alone', () => {
    const ids = [1, 2];
    const result = moveId(ids, 1, 'right');
    expect(ids).toEqual([1, 2]);
    expect(result).not.toBe(ids);
  });
});

describe('photosByMarking', () => {
  const grouped = [
    { job_id: 5, job_number: 'J5', photos: [
      { id: 11, marking_id: 1, position: 2 },
      { id: 12, marking_id: 2, position: 1 },
    ] },
    { job_id: 4, job_number: 'J4', photos: [
      { id: 13, marking_id: 1, position: 1 },
    ] },
  ];

  test('groups by marking in position order and keeps each photo job', () => {
    expect(photosByMarking(grouped)).toEqual({
      1: [
        { id: 13, marking_id: 1, position: 1, job_id: 4, job_number: 'J4' },
        { id: 11, marking_id: 1, position: 2, job_id: 5, job_number: 'J5' },
      ],
      2: [{ id: 12, marking_id: 2, position: 1, job_id: 5, job_number: 'J5' }],
    });
  });

  test('is empty without photos', () => {
    expect(photosByMarking([])).toEqual({});
  });
});
