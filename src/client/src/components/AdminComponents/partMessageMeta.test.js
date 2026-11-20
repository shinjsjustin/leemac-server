import { messageMeta } from './partMessageMeta';

describe('messageMeta', () => {
  it('gives the job number, plain author and private label for an admin note on a job', () => {
    const note = { job_number: 1042, author: 'Justin', is_client: 0, shared: 0 };
    expect(messageMeta(note)).toEqual({
      job: 1042,
      author: 'Justin',
      visibility: 'Private (Leemac only)',
    });
  });

  it('says Part only and marks the author for a client part note with no job', () => {
    const note = { job_number: null, author: 'Kim', is_client: 1, shared: 1 };
    expect(messageMeta(note)).toEqual({
      job: 'Part only',
      author: 'Kim (client)',
      visibility: 'Shared with client',
    });
  });

  it('labels shared and private notes differently', () => {
    const base = { job_number: 7, author: 'Justin', is_client: 0 };
    expect(messageMeta({ ...base, shared: 1 }).visibility).toBe('Shared with client');
    expect(messageMeta({ ...base, shared: 0 }).visibility).toBe('Private (Leemac only)');
  });
});
