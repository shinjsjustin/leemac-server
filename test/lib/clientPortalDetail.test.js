const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const portal = require('../../src/lib/clientPortal');

const OWNS_JOB = { match: /SELECT job\.id FROM job WHERE job\.id = \?/, rows: [{ id: 7 }] };
const OWNS_PART = { match: /SELECT jp\.part_id FROM job_part/, rows: [{ part_id: 3 }] };
const OWNS_JOB_PART = { match: /SELECT jp\.id FROM job_part jp/, rows: [{ id: 9 }] };
const OWNS_FILE = { match: /SELECT f\.id FROM uploaded_files/, rows: [{ id: 4 }] };
const ADMIN = { match: /FROM admin WHERE email/, rows: [{ id: 99 }] };

test('getJob returns null and runs only the ownership query when not owned', async () => {
  const db = makeFakeDb([]);
  assert.equal(await portal.getJob(db, 5, 7), null);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [7, 5]);
});

test('getJob returns job and parts with no tax or total columns', async () => {
  const db = makeFakeDb([
    OWNS_JOB,
    { match: /FROM job\s+JOIN company/, rows: [{ id: 7, job_number: 'J1' }] },
    { match: /FROM job_part/, rows: [{ id: 3, star_status: 'open' }] },
  ]);
  const result = await portal.getJob(db, 5, 7);
  assert.deepEqual(result, { job: { id: 7, job_number: 'J1' }, parts: [{ id: 3, star_status: 'open' }] });
  const jobSql = db.calls[1].sql;
  assert.doesNotMatch(jobSql, /tax|total_cost|subtotal/);
  assert.match(jobSql, /company\.name AS company_name/);
  assert.deepEqual(db.calls[1].params, [7]);
  assert.match(db.calls[2].sql, /LEFT JOIN stars/);
});

test('getPart returns null and runs one query when not owned', async () => {
  const db = makeFakeDb([]);
  assert.equal(await portal.getPart(db, 5, 3), null);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [3, 5]);
});

test('getPart returns part and only this company jobs', async () => {
  const db = makeFakeDb([
    OWNS_PART,
    { match: /FROM part WHERE/, rows: [{ id: 3, number: 'P' }] },
    { match: /FROM job_part jp\s+JOIN job j ON jp\.job_id = j\.id\s+WHERE jp\.part_id/, rows: [{ job_id: 7 }] },
  ]);
  const result = await portal.getPart(db, 5, 3);
  assert.deepEqual(result, { part: { id: 3, number: 'P' }, jobs: [{ job_id: 7 }] });
  assert.match(db.calls[2].sql, /j\.company_id = \?/);
  assert.deepEqual(db.calls[2].params, [3, 5]);
});

test('listPartFiles returns null when not owned', async () => {
  assert.equal(await portal.listPartFiles(makeFakeDb([]), 5, 3), null);
});

test('listPartFiles base64 encodes content', async () => {
  const db = makeFakeDb([
    OWNS_PART,
    { match: /FROM uploaded_files WHERE part_id/, rows: [{ id: 1, filename: 'a', mimetype: 'm', size: 2, content: Buffer.from('hi') }] },
  ]);
  const files = await portal.listPartFiles(db, 5, 3);
  assert.deepEqual(files, [{ id: 1, filename: 'a', mimetype: 'm', size: 2, content: 'aGk=' }]);
});

test('listJobFiles returns null when not owned and metadata when owned', async () => {
  assert.equal(await portal.listJobFiles(makeFakeDb([]), 5, 7), null);
  const db = makeFakeDb([OWNS_JOB, { match: /FROM uploaded_files WHERE job_id/, rows: [{ id: 1 }] }]);
  assert.deepEqual(await portal.listJobFiles(db, 5, 7), [{ id: 1 }]);
  assert.doesNotMatch(db.calls[1].sql, /content/);
});

test('getFile returns null when not owned, row when owned', async () => {
  const none = makeFakeDb([]);
  assert.equal(await portal.getFile(none, 5, 4), null);
  assert.equal(none.calls.length, 1);
  const db = makeFakeDb([OWNS_FILE, { match: /FROM uploaded_files WHERE id/, rows: [{ id: 4, content: 'x' }] }]);
  assert.deepEqual(await portal.getFile(db, 5, 4), { id: 4, content: 'x' });
});

test('listNotes returns null when not owned, notes when owned', async () => {
  assert.equal(await portal.listNotes(makeFakeDb([]), 5, 7), null);
  const db = makeFakeDb([OWNS_JOB, { match: /FROM note n/, rows: [{ id: 1 }] }]);
  assert.deepEqual(await portal.listNotes(db, 5, 7), [{ id: 1 }]);
  assert.deepEqual(db.calls[1].params, [7]);
});

test('addClientNote throws 404 when job not owned', async () => {
  const db = makeFakeDb([ADMIN]);
  await assert.rejects(portal.addClientNote(db, 5, 7, 'Acme', 'hi'), (e) =>
    e instanceof portal.ClientPortalError && e.status === 404);
  assert.equal(db.calls.length, 1);
});

test('addClientNote throws 400 on empty content', async () => {
  const db = makeFakeDb([OWNS_JOB, ADMIN]);
  await assert.rejects(portal.addClientNote(db, 5, 7, 'Acme', '   '), (e) => e.status === 400);
  assert.ok(!db.calls.some((c) => /INSERT/.test(c.sql)));
});

test('addClientNote throws 503 when the portal admin is missing', async () => {
  const db = makeFakeDb([OWNS_JOB]);
  await assert.rejects(portal.addClientNote(db, 5, 7, 'Acme', 'hi'), (e) => e.status === 503);
  assert.deepEqual(db.calls[1].params, ['client-portal@leemac.invalid']);
});

test('addClientNote inserts prefixed content capped at 255', async () => {
  const db = makeFakeDb([OWNS_JOB, ADMIN]);
  await portal.addClientNote(db, 5, 7, 'Acme', ' hello ');
  const insert = db.calls.find((c) => /INSERT INTO note/.test(c.sql));
  assert.deepEqual(insert.params, ['Acme: hello', 99, 7]);

  const long = makeFakeDb([OWNS_JOB, ADMIN]);
  await portal.addClientNote(long, 5, 7, 'Acme', 'x'.repeat(400));
  const params = long.calls.find((c) => /INSERT INTO note/.test(c.sql)).params;
  assert.equal(params[0].length, 255);
  assert.ok(params[0].startsWith('Acme: xxx'));
});

test('setStarStatus rejects an unknown status with 400 and no queries', async () => {
  const db = makeFakeDb([OWNS_JOB_PART]);
  await assert.rejects(portal.setStarStatus(db, 5, 9, 'bogus'), (e) => e.status === 400);
  assert.equal(db.calls.length, 0);
});

test('setStarStatus throws 404 and no UPDATE when not owned', async () => {
  const db = makeFakeDb([]);
  await assert.rejects(portal.setStarStatus(db, 5, 9, 'done'), (e) => e.status === 404);
  assert.ok(!db.calls.some((c) => /UPDATE/.test(c.sql)));
});

test('setStarStatus updates the owned job part', async () => {
  const db = makeFakeDb([OWNS_JOB_PART]);
  await portal.setStarStatus(db, 5, 9, 'done');
  const update = db.calls.find((c) => /UPDATE stars/.test(c.sql));
  assert.deepEqual(update.params, ['done', 9]);
});
