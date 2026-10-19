const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const { BOURNE_ADMIN_EMAIL, JobNoteError, addBourneNote } = require('../../src/lib/jobNotes');

const withAdmin = () =>
  makeFakeDb([
    { match: /FROM admin/, rows: [{ id: 9 }] },
    { match: /INSERT INTO note/, rows: { insertId: 42 } },
  ]);

test('inserts a note owned by the Bourne admin and returns its id', async () => {
  const db = withAdmin();
  const result = await addBourneNote(db, 7, '  hello  ');
  assert.deepEqual(result, { id: 42 });
  assert.equal(BOURNE_ADMIN_EMAIL, 'bourne@bourne.invalid');
  assert.deepEqual(db.calls[0].params, ['bourne@bourne.invalid']);
  const insert = db.calls[1];
  assert.match(insert.sql, /INSERT INTO note \(content, userid, jobid\)/);
  assert.deepEqual(insert.params, ['hello', 9, 7]);
});

for (const [label, content] of [['empty', ''], ['whitespace', '   '], ['over 255', 'x'.repeat(256)]]) {
  test(`rejects ${label} content with 400 before touching the db`, async () => {
    const db = withAdmin();
    await assert.rejects(addBourneNote(db, 7, content), (e) => e instanceof JobNoteError && e.status === 400);
    assert.equal(db.calls.length, 0);
  });
}

test('accepts exactly 255 characters', async () => {
  const db = withAdmin();
  await addBourneNote(db, 7, 'x'.repeat(255));
  assert.equal(db.calls[1].params[0].length, 255);
});

test('raises 503 naming migration 007 when the Bourne admin is missing', async () => {
  const db = makeFakeDb([]);
  await assert.rejects(addBourneNote(db, 7, 'hi'), (e) =>
    e instanceof JobNoteError && e.status === 503 && /migration 007/.test(e.message));
  assert.equal(db.calls.length, 1);
});
