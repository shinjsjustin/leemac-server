const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const { JobStarError, starJobPart, unstarJobPart } = require('../../src/lib/jobStars');

const jobPartRow = (attention) => ({ id: 5, attention, company_name: 'Acme' });

const makeDb = ({ jobPart = jobPartRow('Job Att'), star = [] } = {}) =>
  makeFakeDb([
    { match: /FROM job_part jp/, rows: jobPart ? [jobPart] : [] },
    { match: /FROM stars/, rows: star },
  ]);

const insertOf = (db) => db.calls.find((c) => /INSERT INTO stars/.test(c.sql));

test('stars with body attention trimmed and given status', async () => {
  const db = makeDb();
  const result = await starJobPart(db, 7, 5, { attention: '  Bob ', status: 'urgent' });
  assert.deepEqual(result, { starred: true, created: true });
  assert.deepEqual(db.calls[0].params, [5, 7]);
  assert.match(insertOf(db).sql, /INSERT INTO stars \(job_part_id, attention, status\)/);
  assert.deepEqual(insertOf(db).params, [5, 'Bob', 'urgent']);
});

test('falls back to job attention then company name, status defaults to open', async () => {
  const db1 = makeDb();
  await starJobPart(db1, 7, 5, {});
  assert.deepEqual(insertOf(db1).params, [5, 'Job Att', 'open']);
  const db2 = makeDb({ jobPart: jobPartRow(null) });
  await starJobPart(db2, 7, 5, { attention: '   ' });
  assert.deepEqual(insertOf(db2).params, [5, 'Acme', 'open']);
});

test('already starred returns created false and inserts nothing', async () => {
  const db = makeDb({ star: [{ id: 1 }] });
  const result = await starJobPart(db, 7, 5, { status: 'done' });
  assert.deepEqual(result, { starred: true, created: false });
  assert.equal(insertOf(db), undefined);
  assert.equal(db.calls.some((c) => /UPDATE/.test(c.sql)), false);
});

test('invalid status is a 400 and inserts nothing', async () => {
  const db = makeDb();
  await assert.rejects(starJobPart(db, 7, 5, { status: 'bogus' }), (e) => {
    assert.ok(e instanceof JobStarError);
    assert.equal(e.status, 400);
    return true;
  });
  assert.equal(insertOf(db), undefined);
});

test('job part not on the job is a 404 for star and unstar', async () => {
  for (const fn of [starJobPart, unstarJobPart]) {
    const db = makeDb({ jobPart: null });
    await assert.rejects(fn(db, 7, 5, {}), (e) => {
      assert.equal(e.status, 404);
      assert.equal(e.message, 'Job part not found');
      return true;
    });
  }
});

test('unstar deletes the star row and succeeds when none exists', async () => {
  const db = makeDb();
  assert.deepEqual(await unstarJobPart(db, 7, 5), { starred: false });
  const del = db.calls.find((c) => /DELETE FROM stars WHERE job_part_id = \?/.test(c.sql));
  assert.deepEqual(del.params, [5]);
});
