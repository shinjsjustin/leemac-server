const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { DetailsError, updateJobDetails, updatePartDetails } = require('../../src/lib/jobDetails');

const UPDATED = { match: /^UPDATE job /, rows: { affectedRows: 1 } };

async function rejects(promise, status, message) {
    await assert.rejects(promise, (e) => {
        assert.ok(e instanceof DetailsError);
        assert.strictEqual(e.status, status);
        if (message) assert.strictEqual(e.message, message);
        return true;
    });
}

test('updateJobDetails sets only the whitelisted keys that were sent', async () => {
    const db = makeFakeDb([UPDATED]);
    await updateJobDetails(db, 7, { attention: 'Bob', ship_date: '2026-03-04', po_number: 'X', id: 9 });
    assert.strictEqual(db.calls[0].sql, 'UPDATE job SET attention = ?, ship_date = ? WHERE id = ?');
    assert.deepStrictEqual(db.calls[0].params, ['Bob', '2026-03-04', 7]);
});

test('updateJobDetails maps empty string and null to null and accepts company_id', async () => {
    const db = makeFakeDb([UPDATED]);
    await updateJobDetails(db, 7, { attention: '', company_id: 3, due_date: null, ship_date: '' });
    assert.strictEqual(db.calls[0].sql, 'UPDATE job SET attention = ?, company_id = ?, due_date = ?, ship_date = ? WHERE id = ?');
    assert.deepStrictEqual(db.calls[0].params, [null, 3, null, null, 7]);
});

test('updateJobDetails 400s when no whitelisted key is sent', async () => {
    const db = makeFakeDb([UPDATED]);
    await rejects(updateJobDetails(db, 7, { po_number: 'X' }), 400, 'No fields to update');
    assert.strictEqual(db.calls.length, 0);
});

test('updateJobDetails 400s on malformed dates', async () => {
    for (const bad of ['03/04/2026', '2026-3-4', 20260304, '2026-03-04T00:00']) {
        const db = makeFakeDb([UPDATED]);
        await rejects(updateJobDetails(db, 7, { due_date: bad }), 400);
        await rejects(updateJobDetails(db, 7, { ship_date: bad }), 400);
        assert.strictEqual(db.calls.length, 0);
    }
});

test('updateJobDetails 400s when company_id is not a positive integer', async () => {
    for (const bad of [0, -1, 1.5, 'abc', null, '']) {
        const db = makeFakeDb([UPDATED]);
        await rejects(updateJobDetails(db, 7, { company_id: bad }), 400);
        assert.strictEqual(db.calls.length, 0);
    }
});

test('updateJobDetails 404s when no job row was affected', async () => {
    const db = makeFakeDb([{ match: /^UPDATE job /, rows: { affectedRows: 0 } }]);
    await rejects(updateJobDetails(db, 7, { attention: 'Bob' }), 404, 'Job not found');
});

test('updatePartDetails updates number and description, trimmed, and returns the id', async () => {
    const db = makeFakeDb([{ match: /^SELECT id FROM part WHERE id = \?/, rows: [{ id: 5 }] }]);
    const result = await updatePartDetails(db, 5, { number: ' A-1 ', description: ' Bracket ' });
    assert.deepStrictEqual(result, { id: 5 });
    const update = db.calls.find((c) => c.sql.startsWith('UPDATE part'));
    assert.strictEqual(update.sql, 'UPDATE part SET number = ?, description = ? WHERE id = ?');
    assert.deepStrictEqual(update.params, ['A-1', 'Bracket', 5]);
});

test('updatePartDetails updates description alone without a number check', async () => {
    const db = makeFakeDb([{ match: /^SELECT id FROM part WHERE id = \?/, rows: [{ id: 5 }] }]);
    await updatePartDetails(db, 5, { description: 'Bracket' });
    assert.ok(!db.calls.some((c) => /number = \?/.test(c.sql) && c.sql.startsWith('SELECT')));
    const update = db.calls.find((c) => c.sql.startsWith('UPDATE part'));
    assert.strictEqual(update.sql, 'UPDATE part SET description = ? WHERE id = ?');
});

test('updatePartDetails 400s when neither field is sent or number is blank', async () => {
    const db = makeFakeDb();
    await rejects(updatePartDetails(db, 5, {}), 400);
    await rejects(updatePartDetails(db, 5, { number: '   ' }), 400);
    await rejects(updatePartDetails(db, 5, { description: 4 }), 400);
    assert.strictEqual(db.calls.length, 0);
});

test('updatePartDetails 404s for a missing part and does not update', async () => {
    const db = makeFakeDb();
    await rejects(updatePartDetails(db, 5, { number: 'A-1' }), 404, 'Part not found');
    assert.ok(!db.calls.some((c) => c.sql.startsWith('UPDATE')));
});

test('updatePartDetails 409s when another part has the number', async () => {
    const db = makeFakeDb([
        { match: /^SELECT id FROM part WHERE id = \?/, rows: [{ id: 5 }] },
        { match: /^SELECT id FROM part WHERE number = \?/, rows: [{ id: 8 }] },
    ]);
    await rejects(updatePartDetails(db, 5, { number: 'A-1' }), 409, 'Part number already exists');
    assert.ok(!db.calls.some((c) => c.sql.startsWith('UPDATE')));
    const check = db.calls.find((c) => /number = \?/.test(c.sql));
    assert.deepStrictEqual(check.params, ['A-1', 5]);
});
