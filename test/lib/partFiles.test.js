const { test } = require('node:test');
const assert = require('node:assert');
const { insertPartFiles } = require('../../src/lib/partFiles');

function makeDb(startId) {
    let id = startId;
    return {
        calls: [],
        async execute(sql, params) { this.calls.push({ sql, params }); id += 1; return [{ insertId: id }]; },
    };
}

const buf = Buffer.from('abc');

test('insertPartFiles inserts one row per file with part id and returns insert ids in order', async () => {
    const db = makeDb(40);
    const ids = await insertPartFiles(db, 9, [
        { originalname: 'a.pdf', mimetype: 'application/pdf', size: 3, buffer: buf },
        { originalname: 'b.png', mimetype: 'image/png', size: 4, buffer: buf },
    ]);
    assert.deepStrictEqual(ids, [41, 42]);
    assert.strictEqual(db.calls.length, 2);
    assert.match(db.calls[0].sql, /INSERT INTO uploaded_files/);
    assert.match(db.calls[0].sql, /part_id/);
    assert.doesNotMatch(db.calls[0].sql, /job_id/);
    assert.deepStrictEqual(db.calls[0].params, ['a.pdf', 'application/pdf', 3, buf, 9]);
    assert.deepStrictEqual(db.calls[1].params, ['b.png', 'image/png', 4, buf, 9]);
});

test('insertPartFiles stores a.pdf sent as octet-stream as application/pdf', async () => {
    const db = makeDb(0);
    await insertPartFiles(db, 1, [{ originalname: 'a.pdf', mimetype: 'application/octet-stream', size: 3, buffer: buf }]);
    assert.strictEqual(db.calls[0].params[1], 'application/pdf');
});

test('insertPartFiles stores a.pdf sent with no mimetype as application/pdf', async () => {
    const db = makeDb(0);
    await insertPartFiles(db, 1, [
        { originalname: 'a.pdf', size: 3, buffer: buf },
        { originalname: 'b.pdf', mimetype: '', size: 3, buffer: buf },
    ]);
    assert.strictEqual(db.calls[0].params[1], 'application/pdf');
    assert.strictEqual(db.calls[1].params[1], 'application/pdf');
});

test('insertPartFiles keeps octet-stream for an unknown extension', async () => {
    const db = makeDb(0);
    await insertPartFiles(db, 1, [{ originalname: 'part.zzzunknown', mimetype: 'application/octet-stream', size: 3, buffer: buf }]);
    assert.strictEqual(db.calls[0].params[1], 'application/octet-stream');
});

test('insertPartFiles keeps a specific mimetype as sent even when the extension differs', async () => {
    const db = makeDb(0);
    await insertPartFiles(db, 1, [{ originalname: 'a.pdf', mimetype: 'image/png', size: 3, buffer: buf }]);
    assert.strictEqual(db.calls[0].params[1], 'image/png');
});
