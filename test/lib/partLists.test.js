const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const lists = require('../../src/lib/partLists');

const user = { id: 7, name: 'Pat', company_id: 3 };
const LOCK = /FROM part_list WHERE id = \? AND company_id = \? FOR UPDATE/;
const sqls = (db) => db.calls.filter((c) => c.sql).map((c) => c.sql);
const writes = (db) => sqls(db).filter((s) => /^\s*(INSERT|UPDATE|DELETE)/i.test(s));
const rejects400 = (p) => assert.rejects(p, (e) => e instanceof lists.PartListError && e.status === 400);

const listRow = { id: 1, name: 'A', created_by_name: 'Pat', updated_by_name: 'Sam', created_at: 'c', updated_at: 'u' };

test('listLists returns lists ordered by name then id with part_ids, scoped to the company', async () => {
    const db = makeFakeTxDb([
        { match: /FROM part_list_item/, rows: [{ list_id: 1, part_id: 10 }, { list_id: 1, part_id: 11 }] },
        { match: /FROM part_list /, rows: [listRow, { ...listRow, id: 2, name: 'B' }] },
    ]);
    const result = await lists.listLists(db, user);
    assert.deepEqual(result[0].part_ids, [10, 11]);
    assert.deepEqual(result[1].part_ids, []);
    assert.equal(result[0].updated_by_name, 'Sam');
    const [listCall, itemCall] = db.calls;
    assert.match(listCall.sql, /WHERE company_id = \? ORDER BY name, id/);
    assert.deepEqual(listCall.params, [3]);
    assert.match(itemCall.sql, /l\.company_id = \?/);
    assert.deepEqual(itemCall.params, [3]);
    db.calls.forEach((c) => { assertMysqlQuotesClosed(c.sql); assert.doesNotMatch(c.sql, /price/); });
});

test('createList trims the name and records creator and editor', async () => {
    const db = makeFakeTxDb([
        { match: /COUNT/, rows: [{ n: 0 }] },
        { match: /^\s*INSERT INTO part_list /, rows: { insertId: 9 } },
        { match: /FROM part_list /, rows: [{ ...listRow, id: 9 }] },
    ]);
    const result = await lists.createList(db, user, { name: '  Brackets  ' });
    assert.equal(result.id, 9);
    const insert = db.calls.find((c) => /INSERT INTO part_list /.test(c.sql));
    assert.deepEqual(insert.params, [3, 'Brackets', '7', 'Pat', '7', 'Pat']);
    assert.ok(db.calls.some((c) => c.tx === 'commit'));
    sqls(db).forEach(assertMysqlQuotesClosed);
});

test('createList rejects blank, non-string and 101-character names with no writes', async () => {
    for (const name of ['   ', undefined, 5, 'x'.repeat(101)]) {
        const db = makeFakeTxDb();
        await rejects400(lists.createList(db, user, { name }));
        assert.equal(writes(db).length, 0);
    }
    const db = makeFakeTxDb([
        { match: /COUNT/, rows: [{ n: 0 }] },
        { match: /^\s*INSERT INTO part_list /, rows: { insertId: 1 } },
    ]);
    await lists.createList(db, user, { name: 'x'.repeat(100) });
});

test('createList is 409 for the 101st list in a company', async () => {
    const db = makeFakeTxDb([{ match: /COUNT/, rows: [{ n: 100 }] }]);
    await assert.rejects(lists.createList(db, user, { name: 'N' }), (e) => e.status === 409);
    assert.equal(writes(db).length, 0);
    assert.ok(db.calls.some((c) => c.tx === 'rollback'));
    assert.match(sqls(db).find((s) => /COUNT/.test(s)), /company_id = \?/);
});

test('renameList updates the name and editor, and returns null for another company', async () => {
    const db = makeFakeTxDb([
        { match: LOCK, rows: [{ id: 1 }] },
        { match: /FROM part_list /, rows: [listRow] },
    ]);
    await lists.renameList(db, user, 1, { name: ' New ' });
    const update = db.calls.find((c) => /^\s*UPDATE part_list/.test(c.sql));
    assert.match(update.sql, /updated_by_id = \?, updated_by_name = \?, updated_at = NOW\(\)/);
    assert.deepEqual(update.params, ['New', '7', 'Pat', 1, 3]);

    const other = makeFakeTxDb([{ match: LOCK, rows: [] }]);
    assert.equal(await lists.renameList(other, user, 1, { name: 'New' }), null);
    assert.equal(writes(other).length, 0);
    assert.deepEqual(other.calls.find((c) => LOCK.test(c.sql || '')).params, [1, 3]);
    await rejects400(lists.renameList(makeFakeTxDb(), user, 1, { name: '' }));
});

test('deleteList deletes a company list and returns null for another company', async () => {
    const db = makeFakeTxDb([{ match: LOCK, rows: [{ id: 1 }] }]);
    assert.equal(await lists.deleteList(db, user, 1), true);
    const del = db.calls.find((c) => /^\s*DELETE FROM part_list /.test(c.sql));
    assert.deepEqual(del.params, [1, 3]);

    const other = makeFakeTxDb([{ match: LOCK, rows: [] }]);
    assert.equal(await lists.deleteList(other, user, 1), null);
    assert.equal(writes(other).length, 0);
});

test('addParts rejects ids that are not positive integers with no writes', async () => {
    for (const part_ids of [undefined, 'x', [], [0], [-1], [1.5], ['1'], [null]]) {
        const db = makeFakeTxDb();
        await rejects400(lists.addParts(db, user, 1, { part_ids }));
        assert.equal(db.calls.length, 0);
    }
});

const addHandlers = (owned, existing = []) => [
    { match: LOCK, rows: [{ id: 1 }] },
    { match: /FROM job_part/, rows: owned.map((part_id) => ({ part_id })) },
    { match: /SELECT part_id FROM part_list_item/, rows: existing.map((part_id) => ({ part_id })) },
    { match: /FROM part_list /, rows: [listRow] },
];

test('addParts is 400 with no writes when any part is not owned through job_part and job', async () => {
    const db = makeFakeTxDb(addHandlers([10]));
    await rejects400(lists.addParts(db, user, 1, { part_ids: [10, 11] }));
    assert.equal(writes(db).length, 0);
    const owns = db.calls.find((c) => /FROM job_part/.test(c.sql || ''));
    assert.match(owns.sql, /JOIN job j ON jp\.job_id = j\.id/);
    assert.match(owns.sql, /j\.company_id = \?/);
    assert.deepEqual(owns.params, [3, 10, 11]);
});

test('addParts inserts with INSERT IGNORE and stamps the editor', async () => {
    const db = makeFakeTxDb(addHandlers([10, 11]));
    await lists.addParts(db, user, 1, { part_ids: [10, 11, 10] });
    const insert = db.calls.find((c) => /INSERT IGNORE INTO part_list_item/.test(c.sql || ''));
    assert.deepEqual(insert.params, [1, 10, 1, 11]);
    const update = db.calls.find((c) => /^\s*UPDATE part_list/.test(c.sql || ''));
    assert.match(update.sql, /updated_by_id = \?, updated_by_name = \?, updated_at = NOW\(\)/);
    assert.deepEqual(update.params, ['7', 'Pat', 1, 3]);
    sqls(db).forEach((s) => { assertMysqlQuotesClosed(s); assert.doesNotMatch(s, /price/); });
});

test('addParts is 409 when the list would pass 200 parts, but re-adding existing parts is fine', async () => {
    const existing = Array.from({ length: 200 }, (_, i) => i + 100);
    const full = makeFakeTxDb(addHandlers([5], existing));
    await assert.rejects(lists.addParts(full, user, 1, { part_ids: [5] }), (e) => e.status === 409);
    assert.equal(writes(full).length, 0);

    const again = makeFakeTxDb(addHandlers([100], existing));
    await lists.addParts(again, user, 1, { part_ids: [100] });
});

test('addParts returns null for another company list with no writes', async () => {
    const db = makeFakeTxDb([{ match: LOCK, rows: [] }]);
    assert.equal(await lists.addParts(db, user, 1, { part_ids: [10] }), null);
    assert.equal(writes(db).length, 0);
});

test('removeParts deletes only from the locked company list and stamps the editor', async () => {
    const db = makeFakeTxDb([{ match: LOCK, rows: [{ id: 1 }] }, { match: /FROM part_list /, rows: [listRow] }]);
    await lists.removeParts(db, user, 1, { part_ids: [10, 11] });
    const del = db.calls.find((c) => /^\s*DELETE FROM part_list_item/.test(c.sql || ''));
    assert.match(del.sql, /list_id = \? AND part_id IN \(\?, \?\)/);
    assert.deepEqual(del.params, [1, 10, 11]);
    assert.ok(db.calls.some((c) => /^\s*UPDATE part_list/.test(c.sql || '')));

    const other = makeFakeTxDb([{ match: LOCK, rows: [] }]);
    assert.equal(await lists.removeParts(other, user, 1, { part_ids: [10] }), null);
    assert.equal(writes(other).length, 0);
    await rejects400(lists.removeParts(makeFakeTxDb(), user, 1, { part_ids: [] }));
});
