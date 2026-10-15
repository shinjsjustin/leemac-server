const { test } = require('node:test');
const assert = require('node:assert');
const { makeFakeDb } = require('../helpers/fakeDb');
const { UPLOAD_LIMITS, ALLOWED_EXTENSIONS, jobFileUpload, insertJobFiles, listJobFiles } = require('../../src/lib/jobFiles');

const MB = 1024 * 1024;

test('upload limits are 20 MB per file and 10 files', () => {
    assert.deepStrictEqual(UPLOAD_LIMITS, { fileSize: 20 * MB, files: 10 });
});

test('allowed extensions include step and pdf but not exe', () => {
    assert.ok(ALLOWED_EXTENSIONS.includes('.step'));
    assert.ok(ALLOWED_EXTENSIONS.includes('.pdf'));
    assert.ok(!ALLOWED_EXTENSIONS.includes('.exe'));
});

test('file filter accepts uppercase allowed extension and rejects others', () => {
    const run = (name) => {
        let result;
        jobFileUpload.fileFilter({}, { originalname: name }, (err, ok) => { result = { err, ok }; });
        return result;
    };
    assert.strictEqual(run('RFQ.PDF').ok, true);
    assert.strictEqual(run('x.exe').ok, false);
    assert.ok(run('x.exe').err);
});

test('insertJobFiles inserts one row per file with job id and returns insert ids', async () => {
    let id = 40;
    const db = {
        calls: [],
        async execute(sql, params) { this.calls.push({ sql, params }); id += 1; return [{ insertId: id }]; },
    };
    const buf = Buffer.from('abc');
    const ids = await insertJobFiles(db, 7, [
        { originalname: 'a.pdf', mimetype: 'application/pdf', size: 3, buffer: buf },
        { originalname: 'b.png', mimetype: 'image/png', size: 3, buffer: buf },
    ]);
    assert.deepStrictEqual(ids, [41, 42]);
    assert.strictEqual(db.calls.length, 2);
    assert.match(db.calls[0].sql, /INSERT INTO uploaded_files/);
    assert.deepStrictEqual(db.calls[0].params, ['a.pdf', 'application/pdf', 3, buf, 7]);
    assert.strictEqual(db.calls[1].params[0], 'b.png');
});

test('listJobFiles selects metadata for the job and never content', async () => {
    const rows = [{ id: 1, filename: 'a.pdf' }];
    const db = makeFakeDb([{ match: /FROM uploaded_files/, rows }]);
    const out = await listJobFiles(db, 7);
    assert.deepStrictEqual(out, rows);
    assert.deepStrictEqual(db.calls[0].params, [7]);
    assert.match(db.calls[0].sql, /id, filename, mimetype, size, uploaded_at/);
    assert.doesNotMatch(db.calls[0].sql, /content|\*/);
});
