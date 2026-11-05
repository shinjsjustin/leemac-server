const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSharedListsDb } = require('../helpers/sharedListsSqliteDb');
const { QuoteRequestError } = require('../../src/lib/quoteRequests');
const { getSharedRequestLines, createRequestFromSharedList } = require('../../src/lib/partListRequest');

const A = { id: 11, name: 'Ann', company_id: 1 };
const B = { id: 22, name: 'Bob', company_id: 2 };
const OUTSIDER = { id: 33, name: 'Cy', company_id: 3 };
const stale = 'This list changed. Reload it and try again.';

// List 1 holds parts 1 and 2 (both visible to A), 3 (A has only a fee line), 4 (B only) and 1 again via B's own job.
function seed() {
    const db = makeSharedListsDb();
    const s = db.sqlite;
    s.exec(`
      ALTER TABLE job ADD COLUMN created_at TEXT;
      ALTER TABLE job_part ADD COLUMN rev TEXT;
      ALTER TABLE job_part ADD COLUMN material TEXT;
      ALTER TABLE job_part ADD COLUMN finish TEXT;
      CREATE TABLE quote_request (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, client_id TEXT, client_name TEXT,
        name TEXT, need_by TEXT, note TEXT, status TEXT, job_id INTEGER, created_at TEXT, updated_at TEXT,
        submitted_at TEXT, reviewed_at TEXT);
      CREATE TABLE quote_request_line (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, position INTEGER,
        part_number TEXT, description TEXT, rev TEXT, material TEXT, finish TEXT, quantity INTEGER, source_part_id INTEGER);
      CREATE TABLE quote_request_file (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER, line_id INTEGER,
        filename TEXT, mimetype TEXT, size INTEGER);
      INSERT INTO job (id, company_id, job_number, created_at) VALUES (1,1,'J1','2026-01-01'),(2,2,'J2','2026-02-01');
      INSERT INTO part (id, number, description) VALUES (1,'P1','Bracket'),(2,'P2','Plate'),(3,'P3','Rush fee'),(4,'P4','Gear');
      INSERT INTO job_part (job_id, part_id, details, rev, material, finish) VALUES
        (1,1,'*AL6061','A','Al','Anodize'),(1,2,'*AL6061',NULL,NULL,NULL),(1,3,'*Fee',NULL,NULL,NULL),
        (2,4,'*Steel','Z','Steel','Zinc'),(2,1,'*Steel','B','Steel','Black');
      INSERT INTO uploaded_files (id, filename, mimetype, size, content, part_id, job_id, note_id) VALUES
        (1,'part.pdf','application/pdf',5,x'01',1,NULL,NULL);
      INSERT INTO admin_part_list (id, name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at)
        VALUES (1,'Shared','1','Admin','1','Admin','t','t');
      INSERT INTO admin_part_list_item (list_id, part_id, added_at) VALUES (1,1,'t'),(1,2,'t'),(1,3,'t'),(1,4,'t');
      INSERT INTO admin_part_list_member (list_id, company_id, joined_by_id, joined_by_name, joined_at)
        VALUES (1,1,'11','Ann','t'),(1,2,'22','Bob','t');
    `);
    return db;
}
const count = (db, table) => db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('getSharedRequestLines holds only visible parts with the company own rev, material and finish', async () => {
    const db = seed();
    const lines = await getSharedRequestLines(db, A, 1);
    assert.deepEqual(lines, [
        { part_id: 1, part_number: 'P1', description: 'Bracket', rev: 'A', material: 'Al', finish: 'Anodize',
            drawings: [{ id: 1, filename: 'part.pdf', mimetype: 'application/pdf' }] },
        { part_id: 2, part_number: 'P2', description: 'Plate', rev: null, material: null, finish: null, drawings: [] },
    ]);
    const [bLine] = await getSharedRequestLines(db, B, 1);
    assert.deepEqual([bLine.part_number, bLine.rev, bLine.material, bLine.finish], ['P1', 'B', 'Steel', 'Black']);
});

test('createRequestFromSharedList saves visible lines under the client company', async () => {
    const db = seed();
    const result = await createRequestFromSharedList(db, A, 1, { lines: [{ part_id: 2, quantity: '4', rev: 'C' }] });
    assert.equal(result.company_id, 1);
    assert.equal(result.status, 'sent');
    assert.equal(result.name, 'Shared');
    assert.deepEqual(result.lines.map((l) => [l.part_number, l.quantity, l.rev, l.source_part_id]), [['P2', 4, 'C', 2]]);
});

test('a hidden part gets the same 409 as an absent part and saves nothing', async () => {
    const db = seed();
    for (const partId of [3, 4, 99]) {
        await assert.rejects(
            createRequestFromSharedList(db, A, 1, { lines: [{ part_id: 1, quantity: 1 }, { part_id: partId, quantity: 1 }] }),
            (e) => e instanceof QuoteRequestError && e.status === 409 && e.message === stale
        );
    }
    assert.equal(count(db, 'quote_request'), 0);
    assert.equal(count(db, 'quote_request_line'), 0);
});

test('a non-member gets null from both functions and creates no request', async () => {
    const db = seed();
    assert.equal(await getSharedRequestLines(db, OUTSIDER, 1), null);
    assert.equal(await createRequestFromSharedList(db, OUTSIDER, 1, { lines: [{ part_id: 1, quantity: 1 }] }), null);
    assert.equal(count(db, 'quote_request'), 0);
});
