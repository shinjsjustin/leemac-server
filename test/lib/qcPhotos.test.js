const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const { QcError } = require('../../src/lib/qcMarkings');
const photos = require('../../src/lib/qcPhotos');

const boss = { id: 7, name: 'Boss' };
const acme = { id: 1, name: 'Alice', company_id: 10 };
const MB = 1024 * 1024;

// Part 1 is on jobs 1 (Acme, newest-older), 2 (Acme, newer), 3 (Beta). Part 2 only on job 4.
// Marking 1 is Leemac's, 2 is Acme's, 3 is Beta's, all on part 1.
function seed() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme'), (20, 'Beta');
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        INSERT INTO job (id, company_id, job_number, po_number, ship_date, created_at) VALUES
            (1, 10, 'J1', 'PO-1', '2026-02-01', '2026-01-01'),
            (2, 10, 'J2', 'PO-2', '2026-03-01', '2026-02-01'),
            (3, 20, 'J3', 'PO-3', '2026-03-05', '2026-03-01'),
            (4, 10, 'J4', 'PO-4', '2026-03-09', '2026-03-02');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (1, 1, 5), (2, 1, 7), (3, 1, 9), (4, 2, 1);
        INSERT INTO qc_marking (part_id, file_id, page, company_id, kind, x1, y1, size, author_id, author_name, created_at, updated_at) VALUES
            (1, 1, 1, NULL, 'point', 0.1, 0.1, 5, '7', 'Boss', '2026-01-01', '2026-01-01'),
            (1, 1, 1, 10, 'point', 0.2, 0.2, 5, '1', 'Alice', '2026-01-01', '2026-01-01'),
            (1, 1, 1, 20, 'point', 0.3, 0.3, 5, '2', 'Bob', '2026-01-01', '2026-01-01');
    `);
    return db;
}

const file = (extra = {}) => ({ mimetype: 'image/jpeg', buffer: Buffer.from('abc'), ...extra });
const add = (db, markingId, jobId, extra = {}) =>
    photos.addPhoto(db, boss, markingId, { job_id: jobId, value: '1.25', caption: 'cap', file: file(), ...extra });
const rows = (db) => db.sqlite.prepare('SELECT * FROM qc_photo ORDER BY id').all();

async function rejects(promise, status) {
    await assert.rejects(promise, (e) => {
        assert.ok(e instanceof QcError);
        assert.equal(e.status, status);
        return true;
    });
}

test('addPhoto stores the photo with uploader and appends positions per marking', async () => {
    const db = seed();
    const { id } = await add(db, 1, 1);
    await add(db, 1, 2);
    await add(db, 2, 1);
    const [first, second, other] = rows(db);
    assert.equal(first.id, id);
    assert.deepEqual([first.position, second.position, other.position], [1, 2, 1]);
    assert.equal(first.value, '1.25');
    assert.equal(first.caption, 'cap');
    assert.equal(first.mimetype, 'image/jpeg');
    assert.equal(first.size, 3);
    assert.equal(first.uploaded_by_name, 'Boss');
    assert.equal(Buffer.from(first.content).toString(), 'abc');
});

test('addPhoto refuses a job without the marking part and a job of another company on a client marking', async () => {
    const db = seed();
    await rejects(add(db, 1, 4), 400);
    await rejects(add(db, 2, 3), 400);
    await rejects(add(db, 2, 99), 400);
    await rejects(add(db, 99, 1), 404);
    assert.equal(rows(db).length, 0);
    await add(db, 1, 3); // a Leemac marking accepts any company's job that holds the part
    await add(db, 2, 2);
    assert.equal(rows(db).length, 2);
});

test('addPhoto accepts JPEG, PNG and WebP up to 3 MB only', async () => {
    const db = seed();
    for (const mimetype of ['image/jpeg', 'image/png', 'image/webp']) await add(db, 1, 1, { file: file({ mimetype }) });
    await add(db, 1, 1, { file: file({ buffer: Buffer.alloc(3 * MB) }) });
    await rejects(add(db, 1, 1, { file: file({ mimetype: 'image/gif' }) }), 400);
    await rejects(add(db, 1, 1, { file: file({ mimetype: 'application/pdf' }) }), 400);
    await rejects(add(db, 1, 1, { file: file({ buffer: Buffer.alloc(3 * MB + 1) }) }), 400);
    await rejects(add(db, 1, 1, { file: undefined }), 400);
    assert.equal(rows(db).length, 4);
});

test('addPhoto rejects an overlong value or caption', async () => {
    const db = seed();
    await rejects(add(db, 1, 1, { value: 'x'.repeat(65) }), 400);
    await rejects(add(db, 1, 1, { caption: 'x'.repeat(256) }), 400);
    await add(db, 1, 1, { value: undefined, caption: undefined });
    assert.equal(rows(db)[0].value, null);
    assert.equal(rows(db)[0].caption, null);
});

test('updatePhoto changes value and caption; 404 for a missing photo', async () => {
    const db = seed();
    const { id } = await add(db, 1, 1);
    await photos.updatePhoto(db, id, { value: '2.5', caption: 'new' });
    assert.equal(rows(db)[0].value, '2.5');
    assert.equal(rows(db)[0].caption, 'new');
    await rejects(photos.updatePhoto(db, id, { value: 'x'.repeat(65), caption: null }), 400);
    await rejects(photos.updatePhoto(db, 99, { value: '1', caption: null }), 404);
});

test('reorderPhotos applies the exact order and rejects mismatches', async () => {
    const db = seed();
    const a = (await add(db, 1, 1)).id;
    const b = (await add(db, 1, 2)).id;
    const c = (await add(db, 1, 3)).id;
    const other = (await add(db, 2, 1)).id;
    await photos.reorderPhotos(db, 1, [c, a, b]);
    const pos = Object.fromEntries(rows(db).map((r) => [r.id, r.position]));
    assert.deepEqual([pos[c], pos[a], pos[b], pos[other]], [1, 2, 3, 1]);
    await rejects(photos.reorderPhotos(db, 1, [a, b]), 400);
    await rejects(photos.reorderPhotos(db, 1, [a, b, c, other]), 400);
    await rejects(photos.reorderPhotos(db, 1, [a, a, b]), 400);
    await rejects(photos.reorderPhotos(db, 1, [a, b, other]), 400);
    await rejects(photos.reorderPhotos(db, 1, 'nope'), 400);
    assert.equal(Object.fromEntries(rows(db).map((r) => [r.id, r.position]))[c], 1);
});

test('deletePhoto removes it; 404 when missing', async () => {
    const db = seed();
    const { id } = await add(db, 1, 1);
    await photos.deletePhoto(db, id);
    assert.equal(rows(db).length, 0);
    await rejects(photos.deletePhoto(db, id), 404);
});

test('listForAdmin groups metadata by job newest first with job details and quantity', async () => {
    const db = seed();
    const p1 = (await add(db, 1, 1)).id;
    const p2 = (await add(db, 1, 2)).id;
    const p3 = (await add(db, 2, 2, { caption: 'mine' })).id;
    const p4 = (await add(db, 1, 3)).id;
    const list = await photos.listForAdmin(db, 1);
    assert.deepEqual(list.map((j) => [j.job_id, j.job_number, j.ship_date, j.po_number, j.quantity]), [
        [3, 'J3', '2026-03-05', 'PO-3', 9],
        [2, 'J2', '2026-03-01', 'PO-2', 7],
        [1, 'J1', '2026-02-01', 'PO-1', 5],
    ]);
    assert.deepEqual(list.map((j) => j.photos.map((p) => p.id)), [[p4], [p2, p3], [p1]]);
    const meta = list[1].photos[1];
    assert.equal(meta.marking_id, 2);
    assert.equal(meta.caption, 'mine');
    assert.equal(meta.value, '1.25');
    assert.equal(meta.mimetype, 'image/jpeg');
    assert.equal('content' in meta, false);
});

test('listForClient returns only the company jobs and 404s for a part it does not own', async () => {
    const db = seed();
    const p1 = (await add(db, 1, 1)).id;
    await add(db, 1, 3);
    const p3 = (await add(db, 2, 2)).id;
    const list = await photos.listForClient(db, acme, 1);
    assert.deepEqual(list.map((j) => j.job_id), [2, 1]);
    assert.deepEqual(list.map((j) => j.photos.map((p) => p.id)), [[p3], [p1]]);
    assert.equal(JSON.stringify(list).includes('content'), false);
    await rejects(photos.listForClient(db, acme, 99), 404);
    await rejects(photos.listForClient(db, { ...acme, company_id: 30 }, 1), 404);
});

test('getPhotoForClient returns bytes only for the company jobs', async () => {
    const db = seed();
    const mine = (await add(db, 1, 1)).id;
    const theirs = (await add(db, 1, 3)).id;
    const got = await photos.getPhotoForClient(db, acme, mine);
    assert.equal(got.mimetype, 'image/jpeg');
    assert.equal(Buffer.from(got.content).toString(), 'abc');
    await rejects(photos.getPhotoForClient(db, acme, theirs), 404);
    await rejects(photos.getPhotoForClient(db, acme, 99), 404);
});
