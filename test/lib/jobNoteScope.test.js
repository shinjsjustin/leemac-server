const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeNotesDb } = require('../helpers/notesSqliteDb');
const { loadJobNotes, loadPartNotes } = require('../../src/lib/jobNoteScope');

// Companies 10 and 20 both use part 5. Job 1 and 3 are company 10, job 2 is company 20.
function seed() {
    const db = makeNotesDb();
    db.sqlite.exec(`
        INSERT INTO admin (id, name, email) VALUES (1, 'Zed', 'z@x.com');
        INSERT INTO job (id, company_id, job_number) VALUES (1, 10, 'J-1'), (2, 20, 'J-2'), (3, 10, 'J-3');
        INSERT INTO part (id, number) VALUES (5, 'P-5'), (6, 'P-6');
        INSERT INTO job_part (job_id, part_id) VALUES (1, 5), (2, 5), (3, 5), (3, 6);
        INSERT INTO note (id, content, userid, jobid, part_id, company_id, client_name, shared, created_at) VALUES
          (1, 'own job note', 1, 1, NULL, NULL, NULL, 0, '2026-01-01 00:00:00'),
          (2, 'client part A', 1, NULL, 5, 10, 'Cara', 0, '2026-01-02 00:00:00'),
          (3, 'client part B', 1, NULL, 5, 20, 'Bob', 0, '2026-01-03 00:00:00'),
          (4, 'old admin part note', 1, 2, 5, NULL, NULL, 1, '2026-01-04 00:00:00'),
          (5, 'part six', 1, NULL, 6, 10, 'Cara', 0, '2026-01-05 00:00:00');
    `);
    return db;
}

test('loadJobNotes lists own notes plus same-company part notes ordered by id', async () => {
    const rows = await loadJobNotes(seed(), [1]);
    assert.deepEqual(rows.map((r) => [r.job_id, r.id, r.part_id, r.part_number]), [
        [1, 1, null, null],
        [1, 2, 5, 'P-5'],
    ]);
});

test('loadJobNotes never shows another company part note', async () => {
    const db = seed();
    const forA = await loadJobNotes(db, [1]);
    const forB = await loadJobNotes(db, [2]);
    assert.ok(!forA.some((r) => r.id === 3 || r.id === 4));
    assert.deepEqual(forB.map((r) => r.id), [3, 4]);
});

test('loadJobNotes uses the note own job company when company_id is null', async () => {
    // note 4 sits on job 2 (company 20), so job 3 (company 10) must not get it
    const rows = await loadJobNotes(seed(), [3]);
    assert.deepEqual(rows.map((r) => r.id), [2, 5]);
});

test('loadJobNotes returns one row per job and note for several jobs', async () => {
    const rows = await loadJobNotes(seed(), [1, 3]);
    assert.deepEqual(rows.map((r) => [r.job_id, r.id]).sort(), [[1, 1], [1, 2], [3, 2], [3, 5]]);
});

test('loadJobNotes maps author, is_client, shared and content', async () => {
    const rows = await loadJobNotes(seed(), [1]);
    assert.deepEqual(
        rows.map((r) => [r.content, r.author, r.is_client, r.shared]),
        [['own job note', 'Zed', 0, 0], ['client part A', 'Cara', 1, 0]]
    );
    assert.ok(rows.every((r) => r.created_at));
});

test('loadJobNotes returns nothing for no job ids', async () => {
    assert.deepEqual(await loadJobNotes(seed(), []), []);
});

test('loadPartNotes lists every note on the part with its job_number', async () => {
    const rows = await loadPartNotes(seed(), 5);
    assert.deepEqual(rows.map((r) => [r.id, r.job_number, r.author]), [
        [2, null, 'Cara'],
        [3, null, 'Bob'],
        [4, 'J-2', 'Zed'],
    ]);
});
