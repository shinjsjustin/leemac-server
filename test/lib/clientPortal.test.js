const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const portal = require('../../src/lib/clientPortal');

test('listStarred binds companyId and filters on j.company_id', async () => {
  const db = makeFakeDb([{ match: /FROM stars/, rows: [{ job_part_id: 1 }] }]);
  const rows = await portal.listStarred(db, 5);
  assert.deepEqual(rows, [{ job_part_id: 1 }]);
  assert.match(db.calls[0].sql, /j\.company_id = \?/);
  assert.deepEqual(db.calls[0].params, [5]);
});

test('listParts binds companyId first and adds LIKE filters', async () => {
  const db = makeFakeDb([{ match: /FROM part p/, rows: [{ id: 2 }] }]);
  const rows = await portal.listParts(db, 5, { number: 'A', description: 'B' });
  assert.deepEqual(rows, [{ id: 2 }]);
  assert.match(db.calls[0].sql, /j\.company_id = \?/);
  assert.match(db.calls[0].sql, /p\.number LIKE \?/);
  assert.match(db.calls[0].sql, /p\.description LIKE \?/);
  assert.deepEqual(db.calls[0].params, [5, '%A%', '%B%']);
});

test('listParts without filters binds only companyId', async () => {
  const db = makeFakeDb([]);
  await portal.listParts(db, 5, {});
  assert.doesNotMatch(db.calls[0].sql, /LIKE/);
  assert.deepEqual(db.calls[0].params, [5]);
});

test('listJobs returns jobs with parts and pagination', async () => {
  const db = makeFakeDb([
    { match: /COUNT\(\*\)/, rows: [{ total: 30 }] },
    { match: /FROM job\b[\s\S]*ORDER BY/, rows: [{ id: 1 }, { id: 2 }] },
    { match: /FROM job_part jp/, rows: [{ job_id: 1, number: 'P', quantity: 3, price: 4 }] },
  ]);
  const result = await portal.listJobs(db, 5, { limit: '10', offset: '10' });
  assert.deepEqual(result, {
    jobs: [
      { id: 1, parts: [{ number: 'P', quantity: 3, price: 4 }] },
      { id: 2, parts: [] },
    ],
    pagination: { total: 30, limit: 10, offset: 10, hasMore: true },
  });
  assert.match(db.calls[0].sql, /company_id = \?/);
  assert.deepEqual(db.calls[0].params, [5]);
  assert.match(db.calls[1].sql, /job\.company_id = \?/);
  assert.match(db.calls[1].sql, /LIMIT 10 OFFSET 10/);
  assert.deepEqual(db.calls[1].params, [5]);
  assert.deepEqual(db.calls[2].params, [1, 2]);
});

test('listJobs skips the parts query when there are no jobs', async () => {
  const db = makeFakeDb([{ match: /COUNT\(\*\)/, rows: [{ total: 0 }] }]);
  const result = await portal.listJobs(db, 5, {});
  assert.deepEqual(result, { jobs: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } });
  assert.equal(db.calls.length, 2);
});

for (const [label, input, limit, offset] of [
  ['defaults', {}, 20, 0],
  ['over max', { limit: 500, offset: 3 }, 100, 3],
  ['zero limit', { limit: 0 }, 20, 0],
  ['negative', { limit: -5, offset: -9 }, 1, 0],
  ['fractional', { limit: 7.9, offset: 2.5 }, 7, 2],
  ['garbage', { limit: 'x; DROP', offset: 'y' }, 20, 0],
]) {
  test(`listJobs coerces ${label} limit and offset to integers`, async () => {
    const db = makeFakeDb([{ match: /COUNT\(\*\)/, rows: [{ total: 0 }] }]);
    const { pagination } = await portal.listJobs(db, 5, input);
    assert.equal(pagination.limit, limit);
    assert.equal(pagination.offset, offset);
    assert.match(db.calls[1].sql, new RegExp(`LIMIT ${limit} OFFSET ${offset}\\b`));
  });
}

for (const [name, sqlRe] of [
  ['ownsJob', /FROM job\b/],
  ['ownsJobPart', /FROM job_part/],
  ['ownsPart', /FROM job_part/],
  ['ownsFile', /FROM uploaded_files/],
]) {
  test(`${name} is false with no rows and true with one, binding companyId`, async () => {
    const empty = makeFakeDb([]);
    assert.equal(await portal[name](empty, 5, 9), false);
    const hit = makeFakeDb([{ match: sqlRe, rows: [{ id: 9 }] }]);
    assert.equal(await portal[name](hit, 5, 9), true);
    assert.equal(hit.calls.length, 1);
    assert.match(hit.calls[0].sql, /company_id = \?/);
    assert.ok(hit.calls[0].params.includes(5));
    assert.ok(hit.calls[0].params.includes(9));
  });
}
