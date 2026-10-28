const test = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { getPart } = require('../../src/lib/portal');

const JOB_ROWS = [
    { id: 12, job_number: 'J12' },
    { id: 12, job_number: 'J12' },
    { id: 7, job_number: 'J7' },
];

const FILE_ROWS = [
    { id: 90, filename: 'new.pdf', mimetype: 'application/pdf', size: 10, uploaded_at: '2026-02-01' },
    { id: 80, filename: 'old.PDF', mimetype: 'application/octet-stream', size: 5, uploaded_at: '2026-01-01' },
];

const dbWith = ({ owned = true, files = FILE_ROWS } = {}) =>
    makeFakeDb([
        { match: /SELECT jp\.part_id FROM job_part jp/, rows: owned ? [{ part_id: 1 }] : [] },
        { match: /FROM part p/, rows: [{ id: 1, number: 'A-1', description: 'Bracket' }] },
        { match: /FROM job_part jp\s+JOIN job j ON jp\.job_id = j\.id\s+WHERE jp\.part_id = \? AND j\.company_id = \?\s+ORDER/, rows: JOB_ROWS },
        { match: /FROM uploaded_files/, rows: files },
    ]);

test('returns null without querying part data when the company does not own the part', async () => {
    const db = dbWith({ owned: false });
    assert.strictEqual(await getPart(db, 5, 1), null);
    assert.strictEqual(db.calls.length, 1);
    assert.match(db.calls[0].sql, /SELECT jp\.part_id FROM job_part jp/);
});

test('an owned part has exactly the whitelisted keys', async () => {
    const result = await getPart(dbWith(), 5, 1);
    assert.deepStrictEqual(Object.keys(result).sort(), ['drawings', 'jobs', 'part_description', 'part_id', 'part_number']);
    assert.strictEqual(result.part_id, 1);
    assert.strictEqual(result.part_number, 'A-1');
    assert.strictEqual(result.part_description, 'Bracket');
});

test('jobs are the own {id, job_number} once each in query order, newest first in SQL', async () => {
    const db = dbWith();
    const result = await getPart(db, 5, 1);
    assert.deepStrictEqual(result.jobs, [{ id: 12, job_number: 'J12' }, { id: 7, job_number: 'J7' }]);
    const call = db.calls.find((c) => /ORDER BY j\.created_at DESC, j\.id DESC/.test(c.sql));
    assert.deepStrictEqual(call.params, [1, 5]);
});

test('drawings are part-level PDFs newest first, picked to whitelisted keys', async () => {
    const db = dbWith({ files: [{ ...FILE_ROWS[0], content: 'x', part_id: 1 }, FILE_ROWS[1]] });
    const result = await getPart(db, 5, 1);
    assert.deepStrictEqual(result.drawings, FILE_ROWS);
    const call = db.calls.find((c) => /FROM uploaded_files/.test(c.sql));
    assert.match(call.sql, /f\.part_id = \?/);
    assert.match(call.sql, /f\.job_id IS NULL AND f\.note_id IS NULL/);
    assert.match(call.sql, /application\/pdf/);
    assert.match(call.sql, /ORDER BY f\.uploaded_at DESC, f\.id DESC/);
    assert.deepStrictEqual(call.params, [1]);
});

test('never selects price, content, details or *', async () => {
    const db = dbWith();
    await getPart(db, 5, 1);
    for (const { sql } of db.calls) assert.doesNotMatch(sql, /price|content|details|\*/i);
});
