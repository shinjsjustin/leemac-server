const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const { QcError } = require('../../src/lib/qcMarkings');
const requests = require('../../src/lib/qcRequests');

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY_MS).toISOString();

// Part 1 and 2 are on Acme job 1 (older) and job 2 (newer); Beta has job 3 on part 1.
function seed() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme'), (20, 'Beta');
        INSERT INTO part (id, number) VALUES (1, 'P-1'), (2, 'P-2');
        INSERT INTO job (id, company_id, job_number, created_at) VALUES
            (1, 10, 'J1', '2026-01-01'), (2, 10, 'J2', '2026-02-01'), (3, 20, 'J3', '2026-03-01');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (1, 1, 1), (2, 1, 1), (3, 1, 1), (1, 2, 1);
    `);
    return db;
}

const marking = (db, partId, companyId) =>
    Number(db.sqlite.prepare(
        `INSERT INTO qc_marking (part_id, file_id, page, company_id, kind, x1, y1, size, author_id, author_name, created_at, updated_at)
         VALUES (?, 1, 1, ?, 'point', 0.1, 0.1, 5, '1', 'A', '2026-01-01', '2026-01-01')`
    ).run(partId, companyId).lastInsertRowid);

const ping = (db, partId, companyId, pingedAt, extra = {}) =>
    Number(db.sqlite.prepare(
        'INSERT INTO qc_ping (part_id, company_id, pinged_by_name, pinged_at, ping_count, dismissed_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(partId, companyId, extra.by || 'Alice', pingedAt, extra.count || 1, extra.dismissed || null).lastInsertRowid);

const photo = (db, markingId, uploadedAt, jobId = 1) =>
    db.sqlite.prepare(
        `INSERT INTO qc_photo (marking_id, job_id, position, mimetype, size, uploaded_at) VALUES (?, ?, 1, 'image/png', 1, ?)`
    ).run(markingId, jobId, uploadedAt);

test('a ping with no photo since it is open', async () => {
    const db = seed();
    const m = marking(db, 1, 10);
    ping(db, 1, 10, ago(2));
    photo(db, m, ago(3)); // older than the ping
    const [row] = await requests.listRequests(db);
    assert.equal(row.status, 'open');
    assert.equal(await requests.openCount(db), 1);
});

test('a ping closes when every client marking of the company on the part has a photo since it', async () => {
    const db = seed();
    const m1 = marking(db, 1, 10);
    const m2 = marking(db, 1, 10);
    marking(db, 1, null); // Leemac markings do not count
    marking(db, 1, 20); // other company's markings do not count
    ping(db, 1, 10, ago(2));
    photo(db, m1, ago(1));
    assert.equal((await requests.listRequests(db))[0].status, 'open');
    photo(db, m2, ago(1));
    const [row] = await requests.listRequests(db);
    assert.equal(row.status, 'answered');
    assert.equal(await requests.openCount(db), 0);
});

test('dismiss closes a ping and clears it from the open count', async () => {
    const db = seed();
    marking(db, 1, 10);
    const id = ping(db, 1, 10, ago(2));
    await requests.dismiss(db, id);
    const [row] = await requests.listRequests(db);
    assert.equal(row.status, 'dismissed');
    assert.equal(await requests.openCount(db), 0);
    await assert.rejects(requests.dismiss(db, 99), (e) => e instanceof QcError && e.status === 404);
});

test('listRequests gives open rows newest first, then closed rows from the last 30 days', async () => {
    const db = seed();
    marking(db, 1, 10);
    marking(db, 1, 20);
    marking(db, 2, 10);
    ping(db, 1, 10, ago(5)); // open, older
    ping(db, 1, 20, ago(1)); // open, newer
    ping(db, 2, 10, ago(40), { dismissed: ago(10) }); // closed 10 days ago
    assert.deepEqual((await requests.listRequests(db)).map((r) => [r.company_name, r.part_number, r.status]), [
        ['Beta', 'P-1', 'open'],
        ['Acme', 'P-1', 'open'],
        ['Acme', 'P-2', 'dismissed'],
    ]);
});

test('a dismissed ping closed more than 30 days ago is left out', async () => {
    const db = seed();
    marking(db, 1, 10);
    ping(db, 1, 10, ago(60), { dismissed: ago(31) });
    assert.deepEqual(await requests.listRequests(db), []);
});

test('listRequests rows carry contact, newest job, and marking, photo and ping counts', async () => {
    const db = seed();
    const m1 = marking(db, 1, 10);
    marking(db, 1, 10);
    ping(db, 1, 10, ago(2), { by: 'Alice', count: 3 });
    photo(db, m1, ago(1), 2);
    photo(db, m1, ago(1), 1);
    const [row] = await requests.listRequests(db);
    assert.equal(row.company_id, 10);
    assert.equal(row.company_name, 'Acme');
    assert.equal(row.contact, 'Alice');
    assert.equal(row.part_id, 1);
    assert.equal(row.part_number, 'P-1');
    assert.equal(row.newest_job_id, 2);
    assert.equal(row.newest_job_number, 'J2');
    assert.equal(row.marking_count, 2);
    assert.equal(row.photo_count, 2);
    assert.equal(row.ping_count, 3);
});

test('a ping answered more than 30 days ago is left out', async () => {
    const db = seed();
    const m = marking(db, 1, 10);
    ping(db, 1, 10, ago(40));
    photo(db, m, ago(31));
    assert.deepEqual(await requests.listRequests(db), []);
});
