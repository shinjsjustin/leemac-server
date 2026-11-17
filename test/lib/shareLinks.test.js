const test = require('node:test');
const assert = require('node:assert/strict');
const { makeShareDb } = require('../helpers/shareSqliteDb');
const links = require('../../src/lib/shareLinks');

const boss = { id: 7, name: 'Boss' };
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UNKNOWN = 'x'.repeat(43);

// Part 1 is Acme's (job 1) and Beta's (job 2); part 2 is Beta's only.
// File 1 is a part-1 drawing with a Leemac and an Acme marking, file 2 a part-1 drawing with only a Beta marking,
// file 4 a job upload. Job 1 holds the saved quote (file 5, plus a newer Invoice pdf, file 6); job 3 has none.
function seed() {
    const db = makeShareDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name, code) VALUES (10, 'Acme', 'AC'), (20, 'Beta', 'BE');
        INSERT INTO part (id, number, description) VALUES (1, 'P-1', 'Bracket'), (2, 'P-2', 'Plate');
        INSERT INTO job (id, company_id, job_number, po_number) VALUES
            (1, 10, 'J1', 'PO-1'), (2, 20, 'J2', 'PO-2'), (3, 10, 'J3', 'PO-3');
        INSERT INTO job_part (job_id, part_id, quantity, details) VALUES (1, 1, 5, ''), (2, 1, 9, ''), (2, 2, 1, '');
        INSERT INTO uploaded_files (id, filename, mimetype, content, part_id, job_id, note_id, uploaded_at) VALUES
            (1, 'a.pdf', 'application/pdf', x'0102', 1, NULL, NULL, '2026-01-01 00:00:00'),
            (2, 'b.pdf', 'application/pdf', x'0304', 1, NULL, NULL, '2026-01-01 00:00:00'),
            (3, 'c.pdf', 'application/pdf', x'0506', 2, NULL, NULL, '2026-01-01 00:00:00'),
            (4, 'job.pdf', 'application/pdf', x'0708', 1, 1, NULL, '2026-01-01 00:00:00'),
            (5, 'Quote-J1-20260101-000000-site.pdf', 'application/pdf', x'0910', NULL, 1, NULL, '2026-01-01 00:00:00'),
            (6, 'Invoice-J1-20260102-000000-site.pdf', 'application/pdf', x'1112', NULL, 1, NULL, '2026-01-02 00:00:00');
        INSERT INTO job_document (job_id, type, fields, parts, file_id, saved_by_name, saved_at) VALUES
            (1, 'quote', '{"leadtime":"2 weeks"}', '[{"number":"P-1","price":12}]', 5, 'Boss', '2026-01-01 00:00:00');
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, note, author_id, author_name, created_at, updated_at)
        VALUES
            (1, 1, 1, 1, NULL, 'point', 0.1, 0.2, 'leemac note', '7', 'Boss', '2026-01-01', '2026-01-01'),
            (2, 1, 1, 1, 10, 'point', 0.3, 0.4, 'acme note', '9', 'Acme Guy', '2026-01-01', '2026-01-01'),
            (3, 1, 2, 1, 20, 'point', 0.5, 0.6, 'beta note', '9', 'Beta Guy', '2026-01-01', '2026-01-01');
        INSERT INTO qc_photo (id, marking_id, job_id, position, value, caption, mimetype, size, content) VALUES
            (1, 1, 1, 1, '5.01', 'acme shot', 'image/png', 2, x'aa'),
            (2, 1, 2, 1, '5.02', 'beta shot', 'image/png', 2, x'bb');
    `);
    return db;
}

const rows = (db, sql = 'SELECT * FROM share_link') => db.sqlite.prepare(sql).all();
const expire = (db, id) => db.sqlite.exec(`UPDATE share_link SET expires_at = '2000-01-01 00:00:00' WHERE id = ${id}`);
const quoteLink = (db) => links.createLink(db, boss, { type: 'quote', target_id: 1 });
const qcLink = (db, companyId = 10) => links.createLink(db, boss, { type: 'qc', target_id: 1, company_id: companyId });

async function rejects(promise, status) {
    await assert.rejects(promise, (e) => {
        assert.ok(e instanceof links.ShareLinkError);
        assert.equal(e.status, status);
        return true;
    });
}

test('createLink makes a 43-character token live for 30 days', async () => {
    const db = seed();
    const before = Date.now();
    const link = await quoteLink(db);
    assert.match(link.token, TOKEN_PATTERN);
    const [row] = rows(db);
    assert.equal(row.type, 'quote');
    assert.equal(row.job_id, 1);
    assert.equal(row.company_id, 10);
    assert.equal(row.created_by_id, '7');
    assert.equal(row.created_by_name, 'Boss');
    const days = (new Date(row.expires_at.replace(' ', 'T')).getTime() - before) / DAY_MS;
    assert.ok(Math.abs(days - 30) < 0.01, `expires in ${days} days`);
});

test('createLink reuses a live link', async () => {
    const db = seed();
    const first = await quoteLink(db);
    const second = await quoteLink(db);
    assert.equal(second.token, first.token);
    assert.equal(rows(db).length, 1);
});

test('createLink makes a new token after turn-off', async () => {
    const db = seed();
    const first = await quoteLink(db);
    await links.turnOff(db, first.id);
    const second = await quoteLink(db);
    assert.notEqual(second.token, first.token);
    assert.match(second.token, TOKEN_PATTERN);
    assert.equal(rows(db).length, 2);
    assert.ok(rows(db)[0].turned_off_at);
});

test('createLink makes a new token after expiry', async () => {
    const db = seed();
    const first = await quoteLink(db);
    expire(db, first.id);
    const second = await quoteLink(db);
    assert.notEqual(second.token, first.token);
});

test('createLink keeps QC links apart per company', async () => {
    const db = seed();
    const acme = await qcLink(db, 10);
    const beta = await qcLink(db, 20);
    assert.notEqual(acme.token, beta.token);
    assert.equal((await qcLink(db, 10)).token, acme.token);
});

test('createLink refuses a quote without a saved quote with 409', async () => {
    const db = seed();
    await rejects(links.createLink(db, boss, { type: 'quote', target_id: 3 }), 409);
    await rejects(links.createLink(db, boss, { type: 'quote', target_id: 99 }), 409);
    assert.equal(rows(db).length, 0);
});

test('createLink refuses a QC link for a company that does not own the part with 400', async () => {
    const db = seed();
    await rejects(links.createLink(db, boss, { type: 'qc', target_id: 2, company_id: 10 }), 400);
    await rejects(links.createLink(db, boss, { type: 'qc', target_id: 1, company_id: 30 }), 400);
    await rejects(links.createLink(db, boss, { type: 'qc', target_id: 1 }), 400);
    assert.equal(rows(db).length, 0);
});

test('createLink refuses an unknown type with 400', async () => {
    await rejects(links.createLink(seed(), boss, { type: 'other', target_id: 1 }), 400);
});

test('getLink returns the live link or null', async () => {
    const db = seed();
    assert.equal(await links.getLink(db, 'quote', 1), null);
    const made = await quoteLink(db);
    assert.equal((await links.getLink(db, 'quote', 1)).token, made.token);
    assert.equal(await links.getLink(db, 'qc', 1, 10), null);
    const qc = await qcLink(db, 10);
    assert.equal((await links.getLink(db, 'qc', 1, 10)).token, qc.token);
    assert.equal(await links.getLink(db, 'qc', 1, 20), null);
    await links.turnOff(db, made.id);
    assert.equal(await links.getLink(db, 'quote', 1), null);
});

test('openQuote returns the saved quote and counts the open', async () => {
    const db = seed();
    const { token } = await quoteLink(db);
    const quote = await links.openQuote(db, token);
    assert.deepEqual(quote.fields, { leadtime: '2 weeks' });
    assert.deepEqual(quote.parts, [{ number: 'P-1', price: 12 }]);
    assert.equal(quote.company_name, 'Acme');
    await links.openQuote(db, token);
    const [row] = rows(db);
    assert.equal(row.open_count, 2);
    assert.ok(row.last_opened_at);
});

test('openQuote and openQc return null for unknown, expired or turned-off tokens and do not count', async () => {
    const db = seed();
    const quote = await quoteLink(db);
    const qc = await qcLink(db);
    assert.equal(await links.openQuote(db, UNKNOWN), null);
    assert.equal(await links.openQc(db, UNKNOWN), null);
    assert.equal(await links.openQuote(db, qc.token), null);
    assert.equal(await links.openQc(db, quote.token), null);
    expire(db, quote.id);
    await links.turnOff(db, qc.id);
    assert.equal(await links.openQuote(db, quote.token), null);
    assert.equal(await links.openQc(db, qc.token), null);
    assert.deepEqual(rows(db).map((r) => r.open_count), [0, 0]);
});

test('openQc holds Leemac markings and the pinned company photos with no job number, PO or price', async () => {
    const db = seed();
    const { token } = await qcLink(db, 10);
    const qc = await links.openQc(db, token);
    assert.equal(qc.part.number, 'P-1');
    assert.equal(qc.part.description, 'Bracket');
    assert.deepEqual(qc.markings.map((m) => [m.id, m.note]), [[1, 'leemac note']]);
    assert.deepEqual(qc.photos.map((p) => [p.id, p.caption]), [[1, 'acme shot']]);
    const text = JSON.stringify(qc);
    for (const secret of ['J1', 'J2', 'PO-1', 'PO-2', 'job_number', 'po_number', 'quantity', 'Acme Guy', 'beta']) {
        assert.ok(!text.includes(secret), `${secret} leaked`);
    }
    assert.equal(rows(db)[0].open_count, 1);
});

test('openQc for another company shows only that company photos', async () => {
    const db = seed();
    const { token } = await qcLink(db, 20);
    const qc = await links.openQc(db, token);
    assert.deepEqual(qc.photos.map((p) => p.caption), ['beta shot']);
});

test('quotePdf returns only the latest quote file', async () => {
    const db = seed();
    const { token } = await quoteLink(db);
    const file = await links.quotePdf(db, token);
    assert.equal(file.filename, 'Quote-J1-20260101-000000-site.pdf');
    assert.deepEqual([...file.content], [0x09, 0x10]);
    assert.equal(await links.quotePdf(db, UNKNOWN), null);
    assert.equal(await links.quotePdf(db, (await qcLink(db)).token), null);
});

test('quotePdf returns null when the link is off or the quote file is gone', async () => {
    const db = seed();
    const link = await quoteLink(db);
    db.sqlite.exec('DELETE FROM uploaded_files WHERE id = 5');
    assert.equal(await links.quotePdf(db, link.token), null);
    db.sqlite.exec("INSERT INTO uploaded_files (id, filename, job_id, uploaded_at) VALUES (7, 'Quote-J1-x-site.pdf', 1, '2026-02-01 00:00:00')");
    assert.equal((await links.quotePdf(db, link.token)).filename, 'Quote-J1-x-site.pdf');
    await links.turnOff(db, link.id);
    assert.equal(await links.quotePdf(db, link.token), null);
});

test('qcDrawing returns only a drawing a Leemac marking sits on', async () => {
    const db = seed();
    const { token } = await qcLink(db, 10);
    const drawing = await links.qcDrawing(db, token, 1);
    assert.deepEqual([...drawing.content], [1, 2]);
    assert.equal(drawing.mimetype, 'application/pdf');
    assert.equal(await links.qcDrawing(db, token, 2), null);
    assert.equal(await links.qcDrawing(db, token, 3), null);
    assert.equal(await links.qcDrawing(db, token, 4), null);
    assert.equal(await links.qcDrawing(db, token, 5), null);
    assert.equal(await links.qcDrawing(db, UNKNOWN, 1), null);
});

test('qcDrawing returns null for a quote token', async () => {
    const db = seed();
    assert.equal(await links.qcDrawing(db, (await quoteLink(db)).token, 1), null);
});

test('qcPhoto returns only the pinned company photos on the part', async () => {
    const db = seed();
    const { token } = await qcLink(db, 10);
    const photo = await links.qcPhoto(db, token, 1);
    assert.equal(photo.mimetype, 'image/png');
    assert.deepEqual([...photo.content], [0xaa]);
    assert.equal(await links.qcPhoto(db, token, 2), null);
    assert.equal(await links.qcPhoto(db, token, 99), null);
    assert.equal(await links.qcPhoto(db, UNKNOWN, 1), null);
});

test('qcPhoto returns null once the link is turned off', async () => {
    const db = seed();
    const link = await qcLink(db, 10);
    await links.turnOff(db, link.id);
    assert.equal(await links.qcPhoto(db, link.token, 1), null);
});

test('qcPhoto ignores a photo of the same company on another part', async () => {
    const db = seed();
    db.sqlite.exec(`
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, author_id, author_name, created_at, updated_at)
        VALUES (4, 2, 3, 1, NULL, 'point', 0, 0, '7', 'Boss', '2026-01-01', '2026-01-01');
        INSERT INTO qc_photo (id, marking_id, job_id, position, mimetype, size, content) VALUES (3, 4, 2, 1, 'image/png', 1, x'cc');
    `);
    const { token } = await qcLink(db, 20);
    assert.equal(await links.qcPhoto(db, token, 3), null);
    assert.ok(await links.qcPhoto(db, token, 2));
});
