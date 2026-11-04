const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSharedListsDb } = require('../helpers/sharedListsSqliteDb');
const lists = require('../../src/lib/sharedPartLists');

const A = { id: 11, name: 'Ann', company_id: 1 };
const B = { id: 22, name: 'Bob', company_id: 2 };
const OUTSIDER = { id: 33, name: 'Cy', company_id: 3 };

// Company 1 has parts 1 (normal), 2 (normal), 3 (fee line only); company 2 has part 4 and part 1.
function seed() {
    const db = makeSharedListsDb();
    const s = db.sqlite;
    s.exec(`
      INSERT INTO company (id, name) VALUES (1,'A'),(2,'B'),(3,'C');
      INSERT INTO job (id, company_id, job_number) VALUES (1,1,'J1'),(2,2,'J2');
      INSERT INTO part (id, number, description) VALUES (1,'P1','Bracket'),(2,'P2','Plate'),(3,'P3','Rush fee'),(4,'P4','Gear'),(5,'P5','Secret');
      INSERT INTO job_part (job_id, part_id, details) VALUES (1,1,'*AL6061'),(1,2,'*AL6061'),(1,3,'*Fee'),(2,4,'*Steel'),(2,1,'*Steel');
      INSERT INTO uploaded_files (id, filename, mimetype, size, content, part_id, job_id, note_id) VALUES
        (1,'part.pdf','application/pdf',5,x'01',1,NULL,NULL),
        (2,'job.pdf','application/pdf',5,x'02',1,1,NULL),
        (3,'note.pdf','application/pdf',5,x'03',1,NULL,9);
      INSERT INTO admin_part_list (id, name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at, share_token, share_enabled)
        VALUES (1,'Shared','1','Admin','1','Admin','t','t','tok-on',1),
               (2,'Off','1','Admin','1','Admin','t','t','tok-off',0);
      INSERT INTO admin_part_list_item (list_id, part_id, added_at, added_by_company_id)
        VALUES (1,1,'t',NULL),(1,5,'t',NULL),(1,4,'t',2);
    `);
    return db;
}
const count = (db, sql, ...p) => db.sqlite.prepare(sql).get(...p).n;

test('visibleParts keeps only parts with a non-charge job line for the company', async () => {
    const db = seed();
    const rows = await lists.visibleParts(db, 1, [1, 2, 3, 4, 5]);
    assert.deepEqual(rows.map((r) => r.part_id), [1, 2]);
    assert.deepEqual(await lists.visibleParts(db, 1, []), []);
});

test('getInvite is null for a wrong or off token, even for a member', async () => {
    const db = seed();
    assert.equal(await lists.getInvite(db, A, 'nope'), null);
    assert.equal(await lists.getInvite(db, A, 'tok-off'), null);
    await db.sqlite.exec(`INSERT INTO admin_part_list_member (list_id, company_id, joined_by_id, joined_by_name, joined_at) VALUES (2,1,'11','Ann','t')`);
    assert.equal(await lists.getInvite(db, A, 'tok-off'), null);
    assert.equal((await lists.getSharedList(db, A, 2)).name, 'Off');
});

test('previewing changes nothing and shows joined false', async () => {
    const db = seed();
    const invite = await lists.getInvite(db, A, 'tok-on');
    assert.equal(invite.joined, false);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list_member'), 0);
});

test('joinList adds the company once and an off link does nothing', async () => {
    const db = seed();
    const first = await lists.joinList(db, A, 'tok-on');
    assert.equal(first.joined, true);
    await lists.joinList(db, { ...A, id: 12 }, 'tok-on');
    assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list_member WHERE company_id = 1'), 1);
    assert.equal(await lists.joinList(db, B, 'tok-off'), null);
    assert.equal(await lists.joinList(db, B, 'bad'), null);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list_member WHERE company_id = 2'), 0);
});

test('replies hold only id, name and visible parts with part files', async () => {
    const db = seed();
    const invite = await lists.joinList(db, A, 'tok-on');
    assert.deepEqual(invite, {
        id: 1,
        name: 'Shared',
        joined: true,
        parts: [{
            part_id: 1, part_number: 'P1', part_description: 'Bracket', can_remove: false,
            files: [{ id: 1, filename: 'part.pdf', mimetype: 'application/pdf', size: 5, url: '/api/portal/files/1' }],
        }],
    });
    const got = await lists.getSharedList(db, A, 1);
    assert.deepEqual(Object.keys(got), ['id', 'name', 'parts']);
    assert.deepEqual(Object.keys(got.parts[0]), ['part_id', 'part_number', 'part_description', 'can_remove', 'files']);
    assert.doesNotMatch(JSON.stringify(got), /share_token|tok-on|content|created_by/);
});

test('listSharedLists returns only lists the company is a member of', async () => {
    const db = seed();
    assert.deepEqual(await lists.listSharedLists(db, A), []);
    await lists.joinList(db, A, 'tok-on');
    const got = await lists.listSharedLists(db, A);
    assert.deepEqual(got.map((l) => l.id), [1]);
    assert.deepEqual(await lists.listSharedLists(db, OUTSIDER), []);
});

test('addParts stores the adder, keeps the first adder, and rejects hidden and absent ids alike', async () => {
    const db = seed();
    await lists.joinList(db, A, 'tok-on');
    const reply = await lists.addParts(db, A, 1, { part_ids: [2, 1] });
    const byId = Object.fromEntries(reply.parts.map((p) => [p.part_id, p]));
    assert.equal(byId[2].can_remove, true);
    assert.equal(byId[1].can_remove, false);
    const row = (p) => db.sqlite.prepare('SELECT added_by_company_id a FROM admin_part_list_item WHERE list_id=1 AND part_id=?').get(p).a;
    assert.equal(row(2), 1);
    assert.equal(row(1), null);
    assert.equal(db.sqlite.prepare('SELECT updated_by_id u FROM admin_part_list WHERE id=1').get().u, 'client:11');

    const errors = [];
    for (const ids of [[4], [3], [999]]) {
        await assert.rejects(lists.addParts(db, A, 1, { part_ids: ids }), (e) => { errors.push([e.status, e.message]); return true; });
    }
    assert.equal(new Set(errors.map(String)).size, 1);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list_item WHERE part_id = 3'), 0);
});

test('addParts validates the body', async () => {
    const db = seed();
    await lists.joinList(db, A, 'tok-on');
    await assert.rejects(lists.addParts(db, A, 1, { part_ids: [] }), { status: 400 });
    await assert.rejects(lists.addParts(db, A, 1, {}), { status: 400 });
});

test('removeParts deletes only rows the company added', async () => {
    const db = seed();
    await lists.joinList(db, A, 'tok-on');
    await lists.addParts(db, A, 1, { part_ids: [2] });
    const reply = await lists.removeParts(db, A, 1, { part_ids: [1, 2, 4, 999] });
    assert.deepEqual(reply.parts.map((p) => p.part_id), [1]);
    assert.equal(count(db, 'SELECT COUNT(*) n FROM admin_part_list_item WHERE list_id = 1'), 3);
});

test('a full list gives a 409 without any number in the message', async () => {
    const db = seed();
    await lists.joinList(db, A, 'tok-on');
    const ins = db.sqlite.prepare(`INSERT INTO part (id, number, description) VALUES (?, 'X', 'X')`);
    const item = db.sqlite.prepare(`INSERT INTO admin_part_list_item (list_id, part_id, added_at) VALUES (1, ?, 't')`);
    for (let i = 100; i < 600; i++) { ins.run(i); item.run(i); }
    await assert.rejects(lists.addParts(db, A, 1, { part_ids: [2] }), (e) => {
        assert.equal(e.status, 409);
        assert.equal(e.message, "This list can't take that many more parts.");
        assert.doesNotMatch(e.message, /\d/);
        return true;
    });
});

test('renameList renames for members with client audit and validates the name', async () => {
    const db = seed();
    await lists.joinList(db, A, 'tok-on');
    const reply = await lists.renameList(db, A, 1, { name: '  New  ' });
    assert.equal(reply.name, 'New');
    const row = db.sqlite.prepare('SELECT updated_by_id i, updated_by_name n FROM admin_part_list WHERE id=1').get();
    assert.deepEqual({ ...row }, { i: 'client:11', n: 'Ann' });
    await assert.rejects(lists.renameList(db, A, 1, { name: '   ' }), { status: 400 });
});

test('leaveList removes only that company membership', async () => {
    const db = seed();
    await lists.joinList(db, A, 'tok-on');
    await lists.joinList(db, B, 'tok-on');
    assert.equal(await lists.leaveList(db, A, 1), true);
    assert.equal(await lists.getSharedList(db, A, 1), null);
    assert.ok(await lists.getSharedList(db, B, 1));
});

test('non-members get null for every list action', async () => {
    const db = seed();
    assert.equal(await lists.getSharedList(db, OUTSIDER, 1), null);
    assert.equal(await lists.renameList(db, OUTSIDER, 1, { name: 'x' }), null);
    assert.equal(await lists.addParts(db, OUTSIDER, 1, { part_ids: [1] }), null);
    assert.equal(await lists.removeParts(db, OUTSIDER, 1, { part_ids: [1] }), null);
    assert.equal(await lists.leaveList(db, OUTSIDER, 1), null);
    assert.equal(db.sqlite.prepare('SELECT name FROM admin_part_list WHERE id=1').get().name, 'Shared');
});
