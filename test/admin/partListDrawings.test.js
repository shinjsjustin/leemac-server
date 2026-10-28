const { test, mock } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdminToken } = require('../helpers/session');

const PARTS_SQL = /FROM part\s/;
const FILES_SQL = /FROM uploaded_files/;

const fakeDb = { calls: [], handlers: [] };
fakeDb.execute = async (sql, params) => {
    if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
    fakeDb.calls.push({ sql, params });
    if (fakeDb.throwOn && fakeDb.throwOn.test(sql)) throw new Error('db exploded');
    const h = fakeDb.handlers.find((x) => x.match.test(sql));
    return [h ? h.rows : []];
};
fakeDb.query = fakeDb.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });

function setRows(handlers, throwOn) {
    fakeDb.calls.length = 0;
    fakeDb.handlers = handlers;
    fakeDb.throwOn = throwOn;
}

async function getParts(qs = '') {
    const info = mock.method(console, 'info', () => {});
    const err = mock.method(console, 'error', () => {});
    const server = await start(require('../../src/app'));
    try {
        const res = await fetch(`${server.baseUrl}/api/internal/part/getparts${qs}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        return { status: res.status, body: await res.json() };
    } finally {
        await server.close();
        info.mock.restore();
        err.mock.restore();
    }
}

const PARTS = {
    match: PARTS_SQL,
    rows: [
        { id: 1, number: 'A-1', description: 'one' },
        { id: 2, number: 'B-2', description: 'two' },
        { id: 3, number: 'C-3', description: 'three' },
    ],
};
// Already ordered newest first, as the query's ORDER BY returns them.
const FILES = {
    match: FILES_SQL,
    rows: [
        { id: 30, filename: 'new.PDF', mimetype: 'application/octet-stream', part_id: 1 },
        { id: 20, filename: 'old.pdf', mimetype: 'application/pdf', part_id: 1 },
        { id: 40, filename: 'b.pdf', mimetype: 'application/pdf', part_id: 2 },
    ],
};

const filesCalls = () => fakeDb.calls.filter((c) => FILES_SQL.test(c.sql));

test('returns id, number, description, drawing_count and latest_drawing per part', async () => {
    setRows([PARTS, FILES]);
    const { status, body } = await getParts();
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, [
        { id: 1, number: 'A-1', description: 'one', drawing_count: 2,
          latest_drawing: { id: 30, filename: 'new.PDF', mimetype: 'application/octet-stream' } },
        { id: 2, number: 'B-2', description: 'two', drawing_count: 1,
          latest_drawing: { id: 40, filename: 'b.pdf', mimetype: 'application/pdf' } },
        { id: 3, number: 'C-3', description: 'three', drawing_count: 0, latest_drawing: null },
    ]);
});

test('drawings query is one part-level pdf metadata query ordered newest first', async () => {
    setRows([PARTS, FILES]);
    await getParts();
    const calls = filesCalls();
    assert.strictEqual(calls.length, 1);
    const sql = calls[0].sql;
    assert.match(sql, /part_id IN \(\?, \?, \?\)/);
    assert.match(sql, /job_id IS NULL/);
    assert.match(sql, /note_id IS NULL/);
    assert.match(sql, /application\/pdf/);
    assert.match(sql, /\.pdf/i);
    assert.match(sql, /ORDER BY uploaded_at DESC, id DESC/);
    assert.deepStrictEqual(calls[0].params, [1, 2, 3]);
});

test('number and description filters bind as LIKE params and content is never selected', async () => {
    setRows([PARTS, FILES]);
    await getParts('?number=A&description=on');
    const parts = fakeDb.calls.find((c) => PARTS_SQL.test(c.sql));
    assert.match(parts.sql, /number LIKE \?/);
    assert.match(parts.sql, /description LIKE \?/);
    assert.deepStrictEqual(parts.params, ['%A%', '%on%']);
    for (const c of fakeDb.calls) assert.doesNotMatch(c.sql, /\bcontent\b/);
});

test('returns [] and skips the drawings query when no parts match', async () => {
    setRows([{ match: PARTS_SQL, rows: [] }, FILES]);
    const { status, body } = await getParts();
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, []);
    assert.strictEqual(filesCalls().length, 0);
});

test('returns 500 with a generic error when the drawings query fails', async () => {
    setRows([PARTS, FILES], FILES_SQL);
    const { status, body } = await getParts();
    assert.strictEqual(status, 500);
    assert.deepStrictEqual(body, { error: 'Internal server error' });
});
