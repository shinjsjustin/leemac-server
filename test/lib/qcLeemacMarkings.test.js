const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const { QcError } = require('../../src/lib/qcMarkings');
const admin = require('../../src/lib/qcLeemacMarkings');

const boss = { id: 7, name: 'Boss' };

// Part 1 has drawing file 1 and a job upload file 3; part 2 has drawing file 2.
function seed() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme'), (20, 'Beta');
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        INSERT INTO uploaded_files (id, part_id, job_id) VALUES (1, 1, NULL), (2, 2, NULL), (3, 1, 1);
    `);
    return db;
}

const point = (extra = {}) => ({ file_id: 1, page: 1, kind: 'point', x1: 0.5, y1: 0.5, size: 10, ...extra });

async function rejects(promise, status) {
    await assert.rejects(promise, (e) => {
        assert.ok(e instanceof QcError);
        assert.equal(e.status, status);
        return true;
    });
}

const insertClient = (db, companyId, partId = 1) =>
    db.sqlite.exec(`INSERT INTO qc_marking (part_id, file_id, page, company_id, kind, x1, y1, size, author_id, author_name, created_at, updated_at)
        VALUES (${partId}, 1, 1, ${companyId}, 'point', 0.1, 0.1, 5, '1', 'Alice', '2026-01-01', '2026-01-01')`);

const rowsOf = (db, table) => db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all();

test('createLeemacMarking stores a null-company marking authored by the admin', async () => {
    const db = seed();
    const { id } = await admin.createLeemacMarking(db, boss, 1, point({ note: 'burr' }));
    const [row] = rowsOf(db, 'qc_marking');
    assert.equal(row.id, id);
    assert.equal(row.company_id, null);
    assert.equal(row.author_name, 'Boss');
    assert.equal(row.author_id, '7');
    assert.equal(row.note, 'burr');
    assert.equal(row.part_id, 1);
});

test('createLeemacMarking rejects a bad shape with 400', async () => {
    const db = seed();
    await rejects(admin.createLeemacMarking(db, boss, 1, point({ kind: 'circle' })), 400);
    assert.equal(rowsOf(db, 'qc_marking').length, 0);
});

test('createLeemacMarking 404s for a file that is not a drawing of the part', async () => {
    const db = seed();
    await rejects(admin.createLeemacMarking(db, boss, 1, point({ file_id: 2 })), 404);
    await rejects(admin.createLeemacMarking(db, boss, 1, point({ file_id: 3 })), 404);
    await rejects(admin.createLeemacMarking(db, boss, 99, point()), 404);
});

test('updateLeemacMarking changes a Leemac marking', async () => {
    const db = seed();
    const { id } = await admin.createLeemacMarking(db, boss, 1, point());
    await admin.updateLeemacMarking(db, 1, id, point({ x1: 0.9, size: 20, note: 'new' }));
    const [row] = rowsOf(db, 'qc_marking');
    assert.equal(row.x1, 0.9);
    assert.equal(row.size, 20);
    assert.equal(row.note, 'new');
});

test('updateLeemacMarking validates the shape and the drawing', async () => {
    const db = seed();
    const { id } = await admin.createLeemacMarking(db, boss, 1, point());
    await rejects(admin.updateLeemacMarking(db, 1, id, point({ size: 0 })), 400);
    await rejects(admin.updateLeemacMarking(db, 1, id, point({ file_id: 2 })), 404);
});

test('updateLeemacMarking is 403 on a client marking and leaves it unchanged', async () => {
    const db = seed();
    insertClient(db, 10);
    await rejects(admin.updateLeemacMarking(db, 1, 1, point({ x1: 0.9 })), 403);
    assert.equal(rowsOf(db, 'qc_marking')[0].x1, 0.1);
});

test('updateLeemacMarking and deleteLeemacMarking 404 on a missing marking or another part', async () => {
    const db = seed();
    const { id } = await admin.createLeemacMarking(db, boss, 1, point());
    await rejects(admin.updateLeemacMarking(db, 1, 99, point()), 404);
    await rejects(admin.updateLeemacMarking(db, 2, id, point({ file_id: 2 })), 404);
    await rejects(admin.deleteLeemacMarking(db, 1, 99), 404);
    await rejects(admin.deleteLeemacMarking(db, 2, id), 404);
});

test('deleteLeemacMarking removes the marking and its photos', async () => {
    const db = seed();
    const { id } = await admin.createLeemacMarking(db, boss, 1, point());
    await admin.createLeemacMarking(db, boss, 1, point());
    db.sqlite.exec(`INSERT INTO qc_photo (marking_id, job_id, position, mimetype, size) VALUES (${id}, 1, 1, 'image/png', 5), (2, 1, 1, 'image/png', 5)`);
    await admin.deleteLeemacMarking(db, 1, id);
    assert.deepEqual(rowsOf(db, 'qc_marking').map((r) => r.id), [2]);
    assert.deepEqual(rowsOf(db, 'qc_photo').map((r) => r.marking_id), [2]);
});

test('deleteLeemacMarking is 403 on a client marking and keeps it and its photos', async () => {
    const db = seed();
    insertClient(db, 10);
    db.sqlite.exec(`INSERT INTO qc_photo (marking_id, job_id, position, mimetype, size) VALUES (1, 1, 1, 'image/png', 5)`);
    await rejects(admin.deleteLeemacMarking(db, 1, 1), 403);
    assert.equal(rowsOf(db, 'qc_marking').length, 1);
    assert.equal(rowsOf(db, 'qc_photo').length, 1);
});

test('clearLeemacMarkings removes only Leemac markings on the part, with their photos', async () => {
    const db = seed();
    await admin.createLeemacMarking(db, boss, 1, point());
    await admin.createLeemacMarking(db, boss, 2, point({ file_id: 2 }));
    insertClient(db, 10);
    db.sqlite.exec(`INSERT INTO qc_photo (marking_id, job_id, position, mimetype, size) VALUES (1, 1, 1, 'image/png', 5), (2, 1, 1, 'image/png', 5), (3, 1, 1, 'image/png', 5)`);
    await admin.clearLeemacMarkings(db, 1);
    assert.deepEqual(rowsOf(db, 'qc_marking').map((r) => r.id), [2, 3]);
    assert.deepEqual(rowsOf(db, 'qc_photo').map((r) => r.marking_id), [2, 3]);
});

test('listForAdmin returns every marking with company name and each company ping', async () => {
    const db = seed();
    await admin.createLeemacMarking(db, boss, 1, point());
    insertClient(db, 10);
    insertClient(db, 20);
    insertClient(db, 10, 2);
    db.sqlite.exec(`INSERT INTO qc_ping (part_id, company_id, pinged_by_name, pinged_at, ping_count)
        VALUES (1, 10, 'Alice', '2026-02-02', 3), (2, 10, 'Zed', '2026-03-03', 1)`);

    const { markings, pings } = await admin.listForAdmin(db, 1);

    assert.deepEqual(markings.map((m) => [m.id, m.is_leemac, m.company_name]),
        [[1, true, null], [2, false, 'Acme'], [3, false, 'Beta']]);
    assert.equal(markings[0].author_name, 'Boss');
    assert.deepEqual(pings, [
        { company_id: 10, company_name: 'Acme', pinged_at: '2026-02-02', pinged_by_name: 'Alice', ping_count: 3 },
    ]);
});

test('listForAdmin returns empty lists for a part with nothing', async () => {
    const db = seed();
    assert.deepEqual(await admin.listForAdmin(db, 1), { markings: [], pings: [] });
});
