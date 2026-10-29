const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { assertMysqlQuotesClosed } = require('../helpers/mysqlSql');
const { QuoteRequestError } = require('../../src/lib/quoteRequests');
const {
    REQUEST_EXTENSIONS, MAX_REQUEST_FILES, requestUpload, addRequestFiles, removeRequestFile, getRequestFile,
} = require('../../src/lib/quoteRequestFiles');

const USER = { id: 'c7', name: 'Pat Client', company_id: 'acme' };
const buf = Buffer.from('abc');
const file = (originalname, mimetype = 'application/pdf') => ({ originalname, mimetype, size: 3, buffer: buf });

const STORED = { filename: 'a.pdf', mimetype: 'application/pdf', content: buf };

function dbWith({ status = 'draft', lineIds = [10], count = 0, deleted = 1 } = {}) {
    let nextId = 100;
    return makeFakeTxDb([
        { match: /^\s*SELECT .* FROM quote_request WHERE/s, rows: (p) => (p.includes('acme') && p.includes(5) ? [{ id: 5, status }] : []) },
        { match: /^\s*SELECT id FROM quote_request_line/, rows: (p) => lineIds.filter((id) => p.includes(id)).map((id) => ({ id })) },
        { match: /^\s*SELECT COUNT/, rows: [{ total: count }] },
        { match: /^\s*INSERT INTO quote_request_file/, rows: () => ({ insertId: ++nextId }) },
        { match: /^\s*SELECT .* FROM quote_request_file/s, rows: (p) => (p.includes(5) && p.includes(101) && p.includes('acme') ? [STORED] : []) },
        { match: /^\s*DELETE FROM quote_request_file/, rows: { affectedRows: deleted } },
    ]);
}

const inserts = (db) => db.calls.filter((c) => c.sql && /^\s*INSERT/.test(c.sql));

// Runs one multipart upload through requestUpload and returns the HTTP status and body.
async function upload(parts, field = 'files') {
    const app = express();
    app.post('/', requestUpload.array(field), (req, res) => res.json({ n: req.files.length }));
    app.use((err, req, res, next) => res.status(400).json({ code: err.code || err.message }));
    const server = app.listen(0);
    try {
        const form = new FormData();
        for (const [name, size] of parts) form.append(field, new Blob([Buffer.alloc(size)]), name);
        const res = await fetch(`http://127.0.0.1:${server.address().port}/`, { method: 'POST', body: form });
        return { status: res.status, body: await res.json() };
    } finally {
        server.close();
    }
}

test('REQUEST_EXTENSIONS and MAX_REQUEST_FILES are the agreed lists', () => {
    assert.deepEqual(REQUEST_EXTENSIONS, ['.pdf', '.step', '.stp', '.igs', '.iges', '.dxf', '.dwg', '.x_t', '.sldprt', '.png', '.jpg', '.jpeg']);
    assert.equal(MAX_REQUEST_FILES, 60);
});

test('requestUpload accepts a listed extension regardless of case', async () => {
    const res = await upload([['A.PDF', 5], ['b.StEp', 5]]);
    assert.deepEqual(res, { status: 200, body: { n: 2 } });
});

test('requestUpload rejects an unlisted extension with FILE_TYPE_NOT_ALLOWED', async () => {
    const res = await upload([['evil.exe', 5]]);
    assert.deepEqual(res, { status: 400, body: { code: 'FILE_TYPE_NOT_ALLOWED' } });
});

test('requestUpload rejects a file over 20 MB', async () => {
    const res = await upload([['big.pdf', 20 * 1024 * 1024 + 1]]);
    assert.equal(res.body.code, 'LIMIT_FILE_SIZE');
});

test('requestUpload allows 10 files and rejects an 11th', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => [`f${i}.pdf`, 1]);
    assert.equal((await upload(ten)).status, 200);
    assert.equal((await upload([...ten, ['f10.pdf', 1]])).body.code, 'LIMIT_FILE_COUNT');
});

test('addRequestFiles inserts blobs and returns ids in order', async () => {
    const db = dbWith();
    const ids = await addRequestFiles(db, USER, 5, 10, [file('a.pdf'), file('b.png', 'image/png')]);
    assert.deepEqual(ids, [101, 102]);
    assert.match(inserts(db)[0].sql, /\(request_id, line_id, filename, mimetype, size, content, uploaded_at\)/);
    assert.deepEqual(inserts(db)[0].params, [5, 10, 'a.pdf', 'application/pdf', 3, buf]);
    assert.deepEqual(inserts(db)[1].params, [5, 10, 'b.png', 'image/png', 3, buf]);
    for (const c of db.calls) if (c.sql) assertMysqlQuotesClosed(c.sql);
});

test('addRequestFiles stores a request-level file with a null line_id', async () => {
    const db = dbWith();
    await addRequestFiles(db, USER, 5, null, [file('a.pdf')]);
    assert.equal(inserts(db)[0].params[1], null);
    assert.equal(db.calls.some((c) => /FROM quote_request_line/.test(c.sql || '')), false);
});

test('addRequestFiles gives an octet-stream upload a mimetype from its filename', async () => {
    const db = dbWith();
    await addRequestFiles(db, USER, 5, null, [file('a.pdf', 'application/octet-stream'), file('x.unknownext', 'application/octet-stream')]);
    assert.equal(inserts(db)[0].params[3], 'application/pdf');
    assert.equal(inserts(db)[1].params[3], 'application/octet-stream');
});

test('addRequestFiles returns null for another company, and inserts nothing', async () => {
    const db = dbWith();
    assert.equal(await addRequestFiles(db, { ...USER, company_id: 'other' }, 5, null, [file('a.pdf')]), null);
    assert.equal(await addRequestFiles(db, USER, 6, null, [file('a.pdf')]), null);
    assert.equal(inserts(db).length, 0);
});

test('addRequestFiles returns null for a line not on that request', async () => {
    const db = dbWith({ lineIds: [10] });
    assert.equal(await addRequestFiles(db, USER, 5, 11, [file('a.pdf')]), null);
    assert.equal(inserts(db).length, 0);
});

test('addRequestFiles throws 409 when the request is not a draft', async () => {
    for (const status of ['sent', 'in_review', 'job_created']) {
        const db = dbWith({ status });
        await assert.rejects(addRequestFiles(db, USER, 5, null, [file('a.pdf')]),
            (err) => err instanceof QuoteRequestError && err.status === 409);
        assert.equal(inserts(db).length, 0);
        assert.ok(db.calls.some((c) => c.tx === 'rollback'));
    }
});

test('addRequestFiles allows exactly 60 files and rejects the 61st with 400', async () => {
    const ok = dbWith({ count: 58 });
    assert.equal((await addRequestFiles(ok, USER, 5, null, [file('a.pdf'), file('b.pdf')])).length, 2);

    const over = dbWith({ count: 59 });
    await assert.rejects(addRequestFiles(over, USER, 5, null, [file('a.pdf'), file('b.pdf')]),
        (err) => err instanceof QuoteRequestError && err.status === 400);
    assert.equal(inserts(over).length, 0);
});

test('removeRequestFile deletes a file of this company\'s draft', async () => {
    const db = dbWith();
    assert.equal(await removeRequestFile(db, USER, 5, 101), true);
    const del = db.calls.find((c) => /^\s*DELETE FROM quote_request_file/.test(c.sql || ''));
    assert.deepEqual(del.params, [101, 5]);
    assertMysqlQuotesClosed(del.sql);
});

test('removeRequestFile returns null for another company or a missing file, deleting nothing', async () => {
    const other = dbWith();
    assert.equal(await removeRequestFile(other, { ...USER, company_id: 'other' }, 5, 101), null);
    assert.equal(other.calls.some((c) => /DELETE/.test(c.sql || '')), false);

    assert.equal(await removeRequestFile(dbWith({ deleted: 0 }), USER, 5, 999), null);
});

test('removeRequestFile throws 409 and deletes nothing when the request is not a draft', async () => {
    const db = dbWith({ status: 'sent' });
    await assert.rejects(removeRequestFile(db, USER, 5, 101),
        (err) => err instanceof QuoteRequestError && err.status === 409);
    assert.equal(db.calls.some((c) => /DELETE/.test(c.sql || '')), false);
});

test('getRequestFile returns filename, mimetype and content for this company\'s request in any status', async () => {
    const db = dbWith({ status: 'job_created' });
    assert.deepEqual(await getRequestFile(db, USER, 5, 101), STORED);
    const select = db.calls.find((c) => /FROM quote_request_file/.test(c.sql || ''));
    assert.deepEqual(select.params.slice().sort(), [101, 5, 'acme'].sort());
    assertMysqlQuotesClosed(select.sql);
});

test('getRequestFile returns null for another company, another request or another file, writing nothing', async () => {
    const db = dbWith();
    assert.equal(await getRequestFile(db, { ...USER, company_id: 'other' }, 5, 101), null);
    assert.equal(await getRequestFile(db, USER, 6, 101), null);
    assert.equal(await getRequestFile(db, USER, 5, 102), null);
    assert.equal(db.calls.some((c) => /^\s*(INSERT|UPDATE|DELETE)/.test(c.sql || '')), false);
});
