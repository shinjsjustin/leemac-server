const { test } = require('node:test');
const assert = require('node:assert');
const { makeShopDb } = require('../helpers/shopSqliteDb');
const { listOverview, listQuoted, setNoBid, clearNoBid } = require('../../src/lib/simpleJobs');

function addJob(db, { number, po = null, noBid = null, starred = false, company = 'Acme' }) {
    const companyId = Number(db.sqlite.prepare('INSERT INTO company (name) VALUES (?)').run(company).lastInsertRowid);
    const jobId = Number(db.sqlite.prepare(
        `INSERT INTO job (job_number, company_id, po_number, no_bid_at, attention, created_at, invoice_number, invoice_status)
         VALUES (?, ?, ?, ?, 'Pat', '2026-01-02 03:04:05', 'INV1', 'sent')`
    ).run(number, companyId, po, noBid).lastInsertRowid);
    const partId = Number(db.sqlite.prepare('INSERT INTO part (number, description) VALUES (?, ?)').run(`P${number}`, 'Bracket').lastInsertRowid);
    const jpId = Number(db.sqlite.prepare(
        `INSERT INTO job_part (job_id, part_id, quantity, price, rev, material, details, finish, stock_size, note)
         VALUES (?, ?, 4, 2.5, 'B', 'AL', 'Deburr', 'Anodize', '1x2', 'Rush')`
    ).run(jobId, partId).lastInsertRowid);
    if (starred) db.sqlite.prepare('INSERT INTO stars (job_part_id) VALUES (?)').run(jpId);
    return { jobId, partId, jpId };
}

test('listOverview returns only starred, non-no-bid jobs, newest job number first', async () => {
    const db = makeShopDb();
    addJob(db, { number: '9', starred: true });
    addJob(db, { number: '100', starred: true });
    addJob(db, { number: '50', starred: false });
    addJob(db, { number: '200', starred: true, noBid: '2026-01-01' });
    const result = await listOverview(db, { page: 1 });
    assert.deepStrictEqual(result.jobs.map((j) => j.job_number), ['100', '9']);
    assert.strictEqual(result.page, 1);
    assert.strictEqual(result.pages, 1);
});

test('listOverview shows 10 jobs per page and reports pages', async () => {
    const db = makeShopDb();
    for (let n = 1; n <= 12; n++) addJob(db, { number: String(n), starred: true });
    const first = await listOverview(db, { page: 1 });
    const second = await listOverview(db, { page: 2 });
    assert.strictEqual(first.jobs.length, 10);
    assert.strictEqual(first.jobs[0].job_number, '12');
    assert.deepStrictEqual(second.jobs.map((j) => j.job_number), ['2', '1']);
    assert.strictEqual(second.pages, 2);
});

test('listQuoted returns jobs 13709+ with blank PO and no no-bid, plus the no_bid list', async () => {
    const db = makeShopDb();
    addJob(db, { number: '13708' });
    addJob(db, { number: '13709' });
    addJob(db, { number: '13710', po: '' });
    addJob(db, { number: '13711', po: '  ' });
    addJob(db, { number: '13712', po: 'PO7' });
    addJob(db, { number: '13713', noBid: '2026-02-01', company: 'Zed' });
    addJob(db, { number: '13714', noBid: '2026-02-01', po: 'PO8' });
    addJob(db, { number: '99999' });
    const result = await listQuoted(db, { page: 1 });
    assert.deepStrictEqual(result.jobs.map((j) => j.job_number), ['99999', '13711', '13710', '13709']);
    assert.deepStrictEqual(result.no_bid.map((j) => [j.job_number, j.company]), [['13713', 'Zed']]);
    assert.deepStrictEqual(Object.keys(result.no_bid[0]).sort(), ['company', 'id', 'job_number']);
});

test('each card has company, parts with newest PDF and totals, and job notes', async () => {
    const db = makeShopDb();
    const { jobId, partId, jpId } = addJob(db, { number: '13709' });
    db.sqlite.prepare('INSERT INTO admin (id, name) VALUES (3, ?)').run('Sam');
    const upload = db.sqlite.prepare('INSERT INTO uploaded_files (part_id, filename, mimetype) VALUES (?, ?, ?)');
    upload.run(partId, 'old.pdf', 'application/pdf');
    const newest = Number(upload.run(partId, 'new.PDF', 'application/octet-stream').lastInsertRowid);
    upload.run(partId, 'model.step', 'application/octet-stream');
    db.sqlite.prepare("INSERT INTO note (content, userid, jobid, created_at) VALUES ('job note', 3, ?, '2026-03-01 00:00:00')").run(jobId);
    db.sqlite.prepare("INSERT INTO note (content, userid, jobid, part_id) VALUES ('part note', 3, ?, ?)").run(jobId, partId);
    db.sqlite.prepare("UPDATE job SET due_date = '2026-02-01', leadtime = '3 weeks' WHERE id = ?").run(jobId);
    db.sqlite.prepare("INSERT INTO stars (job_part_id, status, urgent) VALUES (?, 'running_machine_d', 1)").run(jpId);
    const [card] = (await listQuoted(db, { page: 1 })).jobs;
    assert.deepStrictEqual(
        { ...card, parts: undefined, notes: undefined },
        {
            id: jobId, job_number: '13709', company: 'Acme', attention: 'Pat', created_at: '2026-01-02 03:04:05',
            po_number: null, invoice_number: 'INV1', invoice_status: 'sent', total: 10, parts: undefined, notes: undefined,
            po_date: null, due_date: '2026-02-01', ship_date: null, leadtime: '3 weeks', invoice_date: null, paid_date: null,
        }
    );
    assert.deepStrictEqual(card.parts, [{
        part_id: partId, number: 'P13709', rev: 'B', description: 'Bracket', details: 'Deburr', material: 'AL',
        finish: 'Anodize', stock_size: '1x2', note: 'Rush',
        star_status: 'running_machine_d', urgent: true, waiting: false,
        notes: [{ content: 'part note', author: 'Sam', is_client: 0, shared: 0, created_at: card.parts[0].notes[0]?.created_at }],
        quantity: 4, price: 2.5, line_total: 10, drawing_file_id: newest,
    }]);
    assert.deepStrictEqual(card.notes, [{ content: 'job note', author: 'Sam', is_client: 0, shared: 0, created_at: '2026-03-01 00:00:00' }]);
});

test('a part without a PDF has a null drawing_file_id', async () => {
    const db = makeShopDb();
    addJob(db, { number: '13709' });
    const [card] = (await listQuoted(db, { page: 1 })).jobs;
    assert.strictEqual(card.parts[0].drawing_file_id, null);
});

test('setNoBid marks a job and clearNoBid removes it; unknown or PO jobs are refused', async () => {
    const db = makeShopDb();
    const { jobId } = addJob(db, { number: '13709' });
    const { jobId: poJob } = addJob(db, { number: '13710', po: 'PO1' });
    assert.strictEqual(await setNoBid(db, jobId, 7), 'ok');
    const row = db.sqlite.prepare('SELECT no_bid_at, no_bid_by FROM job WHERE id = ?').get(jobId);
    assert.ok(row.no_bid_at);
    assert.strictEqual(row.no_bid_by, 7);
    assert.strictEqual(await clearNoBid(db, jobId), 'ok');
    assert.deepStrictEqual({ ...db.sqlite.prepare('SELECT no_bid_at, no_bid_by FROM job WHERE id = ?').get(jobId) }, { no_bid_at: null, no_bid_by: null });
    assert.strictEqual(await setNoBid(db, 999, 7), 'not_found');
    assert.strictEqual(await clearNoBid(db, 999), 'not_found');
    assert.strictEqual(await setNoBid(db, poJob, 7), 'has_po');
    assert.strictEqual(await clearNoBid(db, poJob), 'has_po');
    assert.strictEqual(db.sqlite.prepare('SELECT no_bid_at FROM job WHERE id = ?').get(poJob).no_bid_at, null);
});

test('client notes show the client name, and client part notes appear under the part for every job using it, same company only', async () => {
    const db = makeShopDb();
    const a = addJob(db, { number: '13709' });
    const companyId = db.sqlite.prepare('SELECT company_id FROM job WHERE id = ?').get(a.jobId).company_id;
    const jobB = Number(db.sqlite.prepare("INSERT INTO job (job_number, company_id, attention) VALUES ('13710', ?, 'Pat')").run(companyId).lastInsertRowid);
    db.sqlite.prepare('INSERT INTO job_part (job_id, part_id, quantity, price) VALUES (?, ?, 1, 1)').run(jobB, a.partId);
    const other = addJob(db, { number: '13711', company: 'Other' });
    db.sqlite.prepare('INSERT INTO job_part (job_id, part_id, quantity, price) VALUES (?, ?, 1, 1)').run(other.jobId, a.partId);
    db.sqlite.prepare("INSERT INTO admin (id, name) VALUES (9, 'Portal')").run();
    const ins = db.sqlite.prepare('INSERT INTO note (content, userid, jobid, part_id, company_id, client_name, shared) VALUES (?, 9, ?, ?, ?, ?, ?)');
    ins.run('client job note', a.jobId, null, companyId, 'Cara', 1);
    ins.run('client part note', null, a.partId, companyId, 'Cara', 1);
    ins.run('other company part note', null, a.partId, other.jobId, 'Dan', 1);
    const jobs = (await listQuoted(db, { page: 1 })).jobs;
    const byNumber = Object.fromEntries(jobs.map((j) => [j.job_number, j]));
    assert.deepStrictEqual(byNumber['13709'].notes.map((n) => [n.content, n.author, n.is_client, n.shared]), [['client job note', 'Cara', 1, 1]]);
    for (const n of ['13709', '13710']) {
        const part = byNumber[n].parts.find((p) => p.part_id === a.partId);
        assert.deepStrictEqual(part.notes.map((x) => [x.content, x.author]), [['client part note', 'Cara']]);
    }
    assert.deepStrictEqual(byNumber['13710'].notes, []);
});
