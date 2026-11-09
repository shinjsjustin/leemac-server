const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const qc = require('../../src/lib/qcMarkings');

const { QcError, validateShape } = qc;
const alice = { id: 1, name: 'Alice', company_id: 10 };
const carol = { id: 3, name: 'Carol', company_id: 20 };
const dave = { id: 4, name: 'Dave', company_id: 30 };

// Part 1: companies 10 and 20, drawing file 1. Part 2: company 30, drawing file 2.
// File 3 is a job upload on part 1 and file 4 is a drawing of part 2.
function seed() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO job (id, company_id) VALUES (1, 10), (2, 20), (3, 30);
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        INSERT INTO job_part (job_id, part_id) VALUES (1, 1), (2, 1), (3, 2);
        INSERT INTO uploaded_files (id, part_id, job_id) VALUES (1, 1, NULL), (2, 2, NULL), (3, 1, 1), (4, 2, NULL);
    `);
    return db;
}

const point = (extra = {}) => ({ file_id: 1, page: 1, kind: 'point', x1: 0.5, y1: 0.5, size: 10, ...extra });
const box = (extra = {}) => ({ file_id: 1, page: 2, kind: 'box', x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4, ...extra });

async function rejects(promise, status, message) {
    await assert.rejects(promise, (e) => {
        assert.ok(e instanceof QcError);
        assert.equal(e.status, status);
        if (message) assert.equal(e.message, message);
        return true;
    });
}

const insertLeemac = (db, partId = 1) =>
    db.sqlite.exec(`INSERT INTO qc_marking (part_id, file_id, page, company_id, kind, x1, y1, size, author_id, author_name, created_at, updated_at)
        VALUES (${partId}, 1, 1, NULL, 'point', 0.1, 0.1, 5, 'a9', 'Leemac QC', '2026-01-01', '2026-01-01')`);

const count = (db, table) => db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('validateShape accepts each kind and normalizes unused fields to null', () => {
    assert.deepEqual(validateShape(point()), { file_id: 1, page: 1, kind: 'point', x1: 0.5, y1: 0.5, x2: null, y2: null, size: 10, note: null });
    assert.deepEqual(validateShape(box({ note: 'check' })), { file_id: 1, page: 2, kind: 'box', x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4, size: null, note: 'check' });
    assert.equal(validateShape(box({ kind: 'line' })).kind, 'line');
});

test('validateShape rejects bad input with a 400 QcError', () => {
    const bad = [
        point({ kind: 'circle' }), point({ kind: undefined }),
        point({ page: 0 }), point({ page: 1.5 }), point({ page: '1' }),
        point({ x1: -0.1 }), point({ x1: 1.1 }), point({ y1: '0.5' }), point({ y1: NaN }),
        point({ size: 0 }), point({ size: 41 }), point({ size: undefined }),
        box({ x2: undefined }), box({ y2: 1.5 }), box({ kind: 'line', x2: null }),
        point({ note: 'x'.repeat(256) }), point({ note: 5 }),
    ];
    for (const body of bad) {
        assert.throws(() => validateShape(body), (e) => e instanceof QcError && e.status === 400, JSON.stringify(body));
    }
});

test('validateShape allows boundary values and a 255-character note', () => {
    assert.doesNotThrow(() => validateShape(point({ x1: 0, y1: 1, size: 1, note: 'x'.repeat(255) })));
    assert.doesNotThrow(() => validateShape(point({ size: 40, note: '' })));
});

test('createMarking stores a company marking with the author and returns its id', async () => {
    const db = seed();
    const { id } = await qc.createMarking(db, alice, 1, box({ note: 'hole' }));
    const row = db.sqlite.prepare('SELECT * FROM qc_marking WHERE id = ?').get(id);
    assert.equal(row.company_id, 10);
    assert.equal(row.part_id, 1);
    assert.equal(row.author_id, '1');
    assert.equal(row.author_name, 'Alice');
    assert.equal(row.x2, 0.3);
    assert.equal(row.note, 'hole');
});

test('createMarking refuses a part the company does not own with 404 Not found', async () => {
    const db = seed();
    await rejects(qc.createMarking(db, dave, 1, point()), 404, 'Not found');
    await rejects(qc.createMarking(db, alice, 99, point()), 404, 'Not found');
    assert.equal(count(db, 'qc_marking'), 0);
});

test('createMarking refuses a file that is not a drawing of the part with 404', async () => {
    const db = seed();
    await rejects(qc.createMarking(db, alice, 1, point({ file_id: 2 })), 404, 'Not found');
    await rejects(qc.createMarking(db, alice, 1, point({ file_id: 3 })), 404, 'Not found');
    await rejects(qc.createMarking(db, alice, 1, point({ file_id: 99 })), 404, 'Not found');
    assert.equal(count(db, 'qc_marking'), 0);
});

test('createMarking refuses an invalid shape with 400 and stores nothing', async () => {
    const db = seed();
    await rejects(qc.createMarking(db, alice, 1, point({ size: 99 })), 400);
    assert.equal(count(db, 'qc_marking'), 0);
});

test('listForClient shows own company and Leemac markings, not another company', async () => {
    const db = seed();
    insertLeemac(db);
    await qc.createMarking(db, alice, 1, point({ note: 'mine' }));
    await qc.createMarking(db, carol, 1, point({ note: 'theirs' }));
    const rows = await qc.listForClient(db, alice, 1);
    assert.deepEqual(rows.map((r) => [r.note, r.is_leemac, r.mine]), [[null, true, false], ['mine', false, true]]);
});

test('listForClient shows a colleague marking as mine for the same company and refuses foreign parts', async () => {
    const db = seed();
    await qc.createMarking(db, { id: 7, name: 'Zed', company_id: 10 }, 1, point());
    const rows = await qc.listForClient(db, alice, 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].mine, true);
    await rejects(qc.listForClient(db, dave, 1), 404, 'Not found');
});

test('updateMarking changes own company marking and validates the shape', async () => {
    const db = seed();
    const { id } = await qc.createMarking(db, alice, 1, point());
    await qc.updateMarking(db, { id: 7, name: 'Zed', company_id: 10 }, 1, id, point({ x1: 0.9, note: 'moved' }));
    const row = db.sqlite.prepare('SELECT * FROM qc_marking WHERE id = ?').get(id);
    assert.equal(row.x1, 0.9);
    assert.equal(row.note, 'moved');
    await rejects(qc.updateMarking(db, alice, 1, id, point({ x1: 2 })), 400);
});

test('updateMarking and deleteMarking refuse Leemac, other company and wrong-part markings with 404', async () => {
    const db = seed();
    insertLeemac(db);
    const { id: theirs } = await qc.createMarking(db, carol, 1, point());
    const { id: mine } = await qc.createMarking(db, alice, 1, point());
    for (const id of [1, theirs, 999]) {
        await rejects(qc.updateMarking(db, alice, 1, id, point({ note: 'hax' })), 404, 'Not found');
        await rejects(qc.deleteMarking(db, alice, 1, id), 404, 'Not found');
    }
    await rejects(qc.deleteMarking(db, dave, 1, mine), 404, 'Not found');
    assert.equal(count(db, 'qc_marking'), 3);
    assert.equal(db.sqlite.prepare('SELECT note FROM qc_marking WHERE id = ?').get(1).note, null);
});

test('deleteMarking removes the marking and its photos', async () => {
    const db = seed();
    const { id } = await qc.createMarking(db, alice, 1, point());
    db.sqlite.exec(`INSERT INTO qc_photo (marking_id, job_id, position, mimetype, size) VALUES (${id}, 1, 1, 'image/png', 3)`);
    await qc.deleteMarking(db, alice, 1, id);
    assert.equal(count(db, 'qc_marking'), 0);
    assert.equal(count(db, 'qc_photo'), 0);
});

test('clearMarkings removes only the company markings on the part and their photos', async () => {
    const db = seed();
    insertLeemac(db);
    const { id: a } = await qc.createMarking(db, alice, 1, point());
    await qc.createMarking(db, alice, 1, box());
    await qc.createMarking(db, carol, 1, point());
    await qc.createMarking(db, dave, 2, point({ file_id: 2 }));
    db.sqlite.exec(`INSERT INTO qc_photo (marking_id, job_id, position, mimetype, size) VALUES (${a}, 1, 1, 'image/png', 3), (1, 1, 1, 'image/png', 3)`);
    await qc.clearMarkings(db, alice, 1);
    const left = db.sqlite.prepare('SELECT company_id, part_id FROM qc_marking ORDER BY id').all().map((r) => ({ ...r }));
    assert.deepEqual(left, [{ company_id: null, part_id: 1 }, { company_id: 20, part_id: 1 }, { company_id: 30, part_id: 2 }]);
    assert.equal(count(db, 'qc_photo'), 1);
    assert.equal(db.sqlite.prepare('SELECT marking_id FROM qc_photo').get().marking_id, 1);
    await rejects(qc.clearMarkings(db, dave, 1), 404, 'Not found');
});

test('ping twice leaves one qc_ping row with count 2 and dismissed_at NULL', async () => {
    const db = seed();
    await qc.createMarking(db, alice, 1, point());
    await qc.ping(db, alice, 1);
    db.sqlite.exec('UPDATE qc_ping SET dismissed_at = 1');
    await qc.ping(db, { id: 7, name: 'Zed', company_id: 10 }, 1);
    const rows = db.sqlite.prepare('SELECT * FROM qc_ping').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].ping_count, 2);
    assert.equal(rows[0].dismissed_at, null);
    assert.equal(rows[0].pinged_by_name, 'Zed');
    assert.equal(rows[0].part_id, 1);
    assert.equal(rows[0].company_id, 10);
});

test('ping with no client markings is a 400 and a foreign part is a 404', async () => {
    const db = seed();
    insertLeemac(db);
    await qc.createMarking(db, carol, 1, point());
    await rejects(qc.ping(db, alice, 1), 400);
    await rejects(qc.ping(db, dave, 1), 404, 'Not found');
    assert.equal(count(db, 'qc_ping'), 0);
});
