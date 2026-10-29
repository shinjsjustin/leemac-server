const test = require('node:test');
const assert = require('node:assert/strict');
const { makeNotesDb } = require('../helpers/notesSqliteDb');
const { ClientNoteError, listNotes, addNote, editNote, deleteNote } = require('../../src/lib/clientNotes');

const alice = { id: 1, name: 'Alice', company_id: 10 };
const bob = { id: 2, name: 'Bob', company_id: 10 };
const carol = { id: 3, name: 'Carol', company_id: 20 };

// Job 1 and part 1 belong to company 10; job 2 uses the same part for company 20.
function seed() {
    const db = makeNotesDb();
    db.sqlite.exec(`
        INSERT INTO admin (id, name, email) VALUES (9, 'Portal', 'client-portal@leemac.invalid'), (8, 'Staff', 's@x.com');
        INSERT INTO job (id, company_id) VALUES (1, 10), (2, 20);
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        INSERT INTO job_part (job_id, part_id) VALUES (1, 1), (2, 1), (2, 2);
    `);
    return db;
}

const insertNote = (db, cols) => {
    const row = { content: 'x', userid: 8, shared: 0, ...cols };
    const keys = Object.keys(row);
    db.sqlite
        .prepare(`INSERT INTO note (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
        .run(...keys.map((k) => row[k] ?? null));
};

async function rejects(promise, status) {
    await assert.rejects(promise, (e) => e instanceof ClientNoteError && e.status === status);
}

test('listNotes returns only own-company client notes and shared admin notes', async () => {
    const db = seed();
    insertNote(db, { content: 'job client', jobid: 1, company_id: 10, client_id: 1, client_name: 'Alice' });
    insertNote(db, { content: 'part client', part_id: 1, company_id: 10, client_id: 2, client_name: 'Bob' });
    insertNote(db, { content: 'shared admin', jobid: 1, shared: 1 });
    insertNote(db, { content: 'private admin', jobid: 1, shared: 0 });
    insertNote(db, { content: 'other company part', part_id: 1, company_id: 20, client_id: 3, client_name: 'Carol' });
    insertNote(db, { content: 'other job', jobid: 2, company_id: 20, client_id: 3, client_name: 'Carol' });

    const out = await listNotes(db, alice);
    assert.deepEqual(Object.keys(out.jobs), ['1']);
    assert.deepEqual(out.jobs[1].map((n) => n.content), ['job client', 'shared admin']);
    assert.deepEqual(out.parts[1].map((n) => n.content), ['part client']);
    assert.deepEqual(Object.keys(out.parts), ['1']);
});

test('listNotes shapes each note with author, is_client and mine', async () => {
    const db = seed();
    insertNote(db, { content: 'a', jobid: 1, company_id: 10, client_id: 1, client_name: 'Alice' });
    insertNote(db, { content: 'b', jobid: 1, shared: 1 });
    const [mine, admin] = (await listNotes(db, bob)).jobs[1];
    assert.deepEqual(Object.keys(mine).sort(), ['author', 'content', 'created_at', 'id', 'is_client', 'mine', 'updated_at']);
    assert.equal(mine.author, 'Alice');
    assert.equal(mine.is_client, true);
    assert.equal(mine.mine, false);
    assert.equal(admin.author, 'Leemac');
    assert.equal(admin.is_client, false);
    assert.equal(admin.mine, false);
    assert.equal((await listNotes(db, alice)).jobs[1][0].mine, true);
});

test('listNotes is empty for a company with no notes', async () => {
    assert.deepEqual(await listNotes(seed(), carol), { jobs: {}, parts: {} });
});

test('addNote stores a trimmed job note under the portal admin with client fields', async () => {
    const db = seed();
    const { id } = await addNote(db, alice, { job_id: 1, content: '  hello  ' });
    const row = db.sqlite.prepare('SELECT * FROM note WHERE id = ?').get(id);
    assert.equal(row.content, 'hello');
    assert.equal(row.userid, 9);
    assert.equal(row.jobid, 1);
    assert.equal(row.part_id, null);
    assert.equal(row.client_id, 1);
    assert.equal(row.client_name, 'Alice');
    assert.equal(row.company_id, 10);
});

test('addNote stores a part note', async () => {
    const db = seed();
    const { id } = await addNote(db, alice, { part_id: 1, content: 'p' });
    const row = db.sqlite.prepare('SELECT * FROM note WHERE id = ?').get(id);
    assert.equal(row.part_id, 1);
    assert.equal(row.jobid, null);
});

test('addNote rejects targets the company does not own with 404', async () => {
    const db = seed();
    await rejects(addNote(db, alice, { job_id: 2, content: 'x' }), 404);
    await rejects(addNote(db, alice, { part_id: 2, content: 'x' }), 404);
    await rejects(addNote(db, carol, { job_id: 1, content: 'x' }), 404);
});

test('addNote rejects both or neither target with 400', async () => {
    const db = seed();
    await rejects(addNote(db, alice, { job_id: 1, part_id: 1, content: 'x' }), 400);
    await rejects(addNote(db, alice, { content: 'x' }), 400);
});

test('addNote enforces content length 1-255 after trimming', async () => {
    const db = seed();
    await rejects(addNote(db, alice, { job_id: 1, content: '   ' }), 400);
    await rejects(addNote(db, alice, { job_id: 1 }), 400);
    await rejects(addNote(db, alice, { job_id: 1, content: 5 }), 400);
    await rejects(addNote(db, alice, { job_id: 1, content: 'a'.repeat(256) }), 400);
    await addNote(db, alice, { job_id: 1, content: 'a'.repeat(255) });
});

test('addNote returns 503 when the portal admin is missing', async () => {
    const db = seed();
    db.sqlite.exec('DELETE FROM admin');
    await rejects(addNote(db, alice, { job_id: 1, content: 'x' }), 503);
});

test('editNote updates own note content and updated_at', async () => {
    const db = seed();
    const { id } = await addNote(db, alice, { job_id: 1, content: 'old' });
    await editNote(db, alice, id, { content: ' new ' });
    const row = db.sqlite.prepare('SELECT content, updated_at FROM note WHERE id = ?').get(id);
    assert.equal(row.content, 'new');
    assert.notEqual(row.updated_at, null);
});

test('editNote validates content with 400', async () => {
    const db = seed();
    const { id } = await addNote(db, alice, { job_id: 1, content: 'old' });
    await rejects(editNote(db, alice, id, { content: '' }), 400);
    await rejects(editNote(db, alice, id, { content: 'a'.repeat(256) }), 400);
});

test('editNote and deleteNote give 404 for another client, company, admin note or missing id', async () => {
    const db = seed();
    const { id } = await addNote(db, alice, { job_id: 1, content: 'mine' });
    insertNote(db, { content: 'admin', jobid: 1, shared: 1 });
    const adminId = db.sqlite.prepare("SELECT id FROM note WHERE content = 'admin'").get().id;
    for (const [user, noteId] of [[bob, id], [carol, id], [alice, adminId], [alice, 999]]) {
        await rejects(editNote(db, user, noteId, { content: 'hack' }), 404);
        await rejects(deleteNote(db, user, noteId), 404);
    }
    const rows = db.sqlite.prepare('SELECT content FROM note ORDER BY id').all();
    assert.deepEqual(rows.map((r) => r.content), ['mine', 'admin']);
});

test('deleteNote removes own note', async () => {
    const db = seed();
    const { id } = await addNote(db, alice, { job_id: 1, content: 'bye' });
    await deleteNote(db, alice, id);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM note').get().n, 0);
});
