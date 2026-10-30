const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeDb } = require('../helpers/fakeDb');
const { loadJobSummary } = require('../../src/lib/jobSummary');

test('returns the job row and parts, querying by job id', async () => {
    const job = { job_number: 7, company_name: 'Acme' };
    const parts = [{ id: 1, number: 'P-1' }, { id: 2, number: 'P-2' }];
    const db = makeFakeDb([
        { match: /FROM job\s+JOIN company/, rows: [job] },
        { match: /FROM job_part/, rows: parts },
    ]);
    const result = await loadJobSummary(db, 42);
    assert.deepEqual(result, { job, parts });
    assert.equal(db.calls.length, 2);
    assert.deepEqual(db.calls[0].params, [42]);
    assert.deepEqual(db.calls[1].params, [42]);
});

test('returns null and skips the parts query when no job row', async () => {
    const db = makeFakeDb([]);
    assert.equal(await loadJobSummary(db, 9), null);
    assert.equal(db.calls.length, 1);
});

test('selects leadtime and invoice_clicked_at on the job row', async () => {
    const db = makeFakeDb([{ match: /FROM job\s+JOIN company/, rows: [{}] }]);
    await loadJobSummary(db, 1);
    assert.match(db.calls[0].sql, /job\.leadtime/);
    assert.match(db.calls[0].sql, /job\.invoice_clicked_at/);
});
