const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const lists = require('../../src/lib/adminPartLists');

const admin = { id: 4, email: 'ad@min.com', access: 'admin' };
const LOCK = /FROM admin_part_list WHERE id = \? FOR UPDATE/;
const sqls = (db) => db.calls.filter((c) => c.sql).map((c) => c.sql);
const writes = (db) => sqls(db).filter((s) => /^\s*(INSERT|UPDATE|DELETE)/i.test(s));
const rejects400 = (p) => assert.rejects(p, (e) => e instanceof lists.AdminPartListError && e.status === 400);
const noClientTables = (db) => sqls(db).forEach((s) => {
    assertMysqlQuotesClosed(s);
    assert.doesNotMatch(s, /company_id/);
    assert.doesNotMatch(s.replace(/admin_part_list(_item)?/g, ''), /part_list/);
});

const listRow = { id: 1, name: 'A', created_by_name: 'e', updated_by_name: 'e', created_at: 'c', updated_at: 'u' };

test('listLists returns every list ordered by name then id with part_ids in added order', async () => {
    const db = makeFakeTxDb([
        { match: /FROM admin_part_list_item/, rows: [{ list_id: 1, part_id: 11 }, { list_id: 1, part_id: 10 }] },
        { match: /FROM admin_part_list /, rows: [listRow, { ...listRow, id: 2, name: 'B' }] },
    ]);
    const result = await lists.listLists(db);
    assert.deepEqual(result[0].part_ids, [11, 10]);
    assert.deepEqual(result[1].part_ids, []);
    assert.match(db.calls[0].sql, /ORDER BY name, id/);
    assert.match(db.calls[1].sql, /ORDER BY i\.id/);
    noClientTables(db);
});

test('createList trims the name and stores the admin id and email', async () => {
    const db = makeFakeTxDb([
        { match: /COUNT/, rows: [{ n: 0 }] },
        { match: /^\s*INSERT INTO admin_part_list /, rows: { insertId: 9 } },
        { match: /FROM admin_part_list /, rows: [{ ...listRow, id: 9 }] },
    ]);
    const result = await lists.createList(db, admin, { name: '  Brackets  ' });
    assert.equal(result.id, 9);
    const insert = db.calls.find((c) => /INSERT INTO admin_part_list /.test(c.sql));
    assert.deepEqual(insert.params, ['Brackets', '4', 'ad@min.com', '4', 'ad@min.com']);
    assert.ok(db.calls.some((c) => c.tx === 'commit'));
    noClientTables(db);
});

test('createList rejects blank, non-string and 101-character names with no writes', async () => {
    for (const name of ['   ', undefined, 5, 'x'.repeat(101)]) {
        const db = makeFakeTxDb();
        await rejects400(lists.createList(db, admin, { name }));
        assert.equal(writes(db).length, 0);
    }
});

test('createList is 409 for the 101st list', async () => {
    const db = makeFakeTxDb([{ match: /COUNT/, rows: [{ n: 100 }] }]);
    await assert.rejects(lists.createList(db, admin, { name: 'N' }), (e) => e.status === 409);
    assert.equal(writes(db).length, 0);
    assert.ok(db.calls.some((c) => c.tx === 'rollback'));
});

test('createList allows the 100th list', async () => {
    const db = makeFakeTxDb([
        { match: /COUNT/, rows: [{ n: 99 }] },
        { match: /^\s*INSERT INTO admin_part_list /, rows: { insertId: 1 } },
    ]);
    await lists.createList(db, admin, { name: 'N' });
});

test('renameList updates name and editor, and returns null for an unknown list', async () => {
    const db = makeFakeTxDb([{ match: LOCK, rows: [{ id: 1 }] }, { match: /FROM admin_part_list /, rows: [listRow] }]);
    await lists.renameList(db, admin, 1, { name: ' New ' });
    const update = db.calls.find((c) => /^\s*UPDATE admin_part_list/.test(c.sql));
    assert.match(update.sql, /name = \?, updated_by_id = \?, updated_by_name = \?, updated_at = NOW\(\)/);
    assert.deepEqual(update.params, ['New', '4', 'ad@min.com', 1]);
    noClientTables(db);

    const none = makeFakeTxDb([{ match: LOCK, rows: [] }]);
    assert.equal(await lists.renameList(none, admin, 1, { name: 'New' }), null);
    assert.equal(writes(none).length, 0);
    await rejects400(lists.renameList(makeFakeTxDb(), admin, 1, { name: '' }));
});

test('deleteList deletes a list and returns null for an unknown one', async () => {
    const db = makeFakeTxDb([{ match: LOCK, rows: [{ id: 1 }] }]);
    assert.equal(await lists.deleteList(db, admin, 1), true);
    const del = db.calls.find((c) => /^\s*DELETE FROM admin_part_list /.test(c.sql));
    assert.deepEqual(del.params, [1]);
    noClientTables(db);

    const none = makeFakeTxDb([{ match: LOCK, rows: [] }]);
    assert.equal(await lists.deleteList(none, admin, 1), null);
    assert.equal(writes(none).length, 0);
});

test('addParts rejects ids that are not positive integers with no queries', async () => {
    for (const part_ids of [undefined, 'x', [], [0], [-1], [1.5], ['1'], [null]]) {
        const db = makeFakeTxDb();
        await rejects400(lists.addParts(db, admin, 1, { part_ids }));
        assert.equal(db.calls.length, 0);
    }
});

const addHandlers = (found, existing = []) => [
    { match: LOCK, rows: [{ id: 1 }] },
    { match: /FROM part WHERE id IN/, rows: found.map((id) => ({ id })) },
    { match: /SELECT part_id FROM admin_part_list_item/, rows: existing.map((part_id) => ({ part_id })) },
    { match: /FROM admin_part_list /, rows: [listRow] },
];

test('addParts is 400 with no writes when any id is not in the part table', async () => {
    const db = makeFakeTxDb(addHandlers([10]));
    await assert.rejects(
        lists.addParts(db, admin, 1, { part_ids: [10, 11] }),
        (e) => e instanceof lists.AdminPartListError && e.status === 400 && e.message === 'Every part must exist.'
    );
    assert.equal(writes(db).length, 0);
    const check = db.calls.find((c) => /FROM part WHERE/.test(c.sql || ''));
    assert.match(check.sql, /SELECT id FROM part WHERE id IN \(\?, \?\)/);
    assert.deepEqual(check.params, [10, 11]);
});

test('addParts inserts new parts with INSERT IGNORE and stamps the editor', async () => {
    const db = makeFakeTxDb(addHandlers([10, 11], [10]));
    await lists.addParts(db, admin, 1, { part_ids: [10, 11, 10] });
    const insert = db.calls.find((c) => /INSERT IGNORE INTO admin_part_list_item/.test(c.sql || ''));
    assert.deepEqual(insert.params, [1, 11]);
    const update = db.calls.find((c) => /^\s*UPDATE admin_part_list/.test(c.sql || ''));
    assert.deepEqual(update.params, ['4', 'ad@min.com', 1]);
    noClientTables(db);
});

test('addParts is 409 past 500 parts, but re-adding existing parts is fine', async () => {
    const existing = Array.from({ length: 500 }, (_, i) => i + 100);
    const full = makeFakeTxDb(addHandlers([5], existing));
    await assert.rejects(lists.addParts(full, admin, 1, { part_ids: [5] }), (e) => e.status === 409);
    assert.equal(writes(full).length, 0);

    const again = makeFakeTxDb(addHandlers([100], existing));
    await lists.addParts(again, admin, 1, { part_ids: [100] });
});

test('addParts returns null for an unknown list with no writes', async () => {
    const db = makeFakeTxDb([{ match: LOCK, rows: [] }]);
    assert.equal(await lists.addParts(db, admin, 1, { part_ids: [10] }), null);
    assert.equal(writes(db).length, 0);
});

test('removeParts deletes from the locked list and stamps the editor', async () => {
    const db = makeFakeTxDb([{ match: LOCK, rows: [{ id: 1 }] }, { match: /FROM admin_part_list /, rows: [listRow] }]);
    await lists.removeParts(db, admin, 1, { part_ids: [10, 11] });
    const del = db.calls.find((c) => /^\s*DELETE FROM admin_part_list_item/.test(c.sql || ''));
    assert.match(del.sql, /list_id = \? AND part_id IN \(\?, \?\)/);
    assert.deepEqual(del.params, [1, 10, 11]);
    assert.ok(db.calls.some((c) => /^\s*UPDATE admin_part_list/.test(c.sql || '')));
    noClientTables(db);

    const none = makeFakeTxDb([{ match: LOCK, rows: [] }]);
    assert.equal(await lists.removeParts(none, admin, 1, { part_ids: [10] }), null);
    assert.equal(writes(none).length, 0);
    await rejects400(lists.removeParts(makeFakeTxDb(), admin, 1, { part_ids: [] }));
});
