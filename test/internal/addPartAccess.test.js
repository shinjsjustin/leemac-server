const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../helpers/server');
const { makeSqliteDb } = require('../helpers/sqliteDb');
const { SESSION_HANDLER, adminToken: signAdmin } = require('../helpers/session');

const sqliteDb = makeSqliteDb();
const { sqlite } = sqliteDb;
sqlite.exec(`CREATE TABLE uploaded_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, mimetype TEXT, size INTEGER,
    content BLOB, part_id INTEGER, job_id INTEGER, uploaded_at TEXT)`);

const execute = async (sql, params) =>
    /FROM auth_session/.test(sql) ? [SESSION_HANDLER.rows] : sqliteDb.execute(sql, params);
const fakeDb = { sqlite, execute, query: execute };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const contracts = require('../../src/client/src/api/contracts/partPoolApi.json');
const adminToken = (level) => signAdmin({ id: 7, email: 'a@x.com', name: 'A', access_level: level });

const newPartBody = { number: 'N-200', description: 'Plate' };
const poolBody = contracts.addPoolPart.body;
const count = (table) => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

beforeEach(() => {
    sqlite.exec('DELETE FROM uploaded_files; DELETE FROM part;');
});

async function withServer(fn) {
    const server = await start(require('../../src/app'));
    try {
        return await fn(server.baseUrl);
    } finally {
        await server.close();
    }
}

const postJson = (baseUrl, path, level, body) =>
    fetch(`${baseUrl}/api/internal${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken(level)}` },
        body: JSON.stringify(body),
    });

function postFile(baseUrl, partId, level) {
    const form = new FormData();
    form.append(contracts.uploadPoolFile.formField, new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'drawing.pdf');
    return fetch(`${baseUrl}/api/internal/part/pool/${partId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken(level)}` },
        body: form,
    });
}

const createRoutes = [
    ['/part/newpart', newPartBody],
    ['/part/pool', poolBody],
];

for (const [path, body] of createRoutes) {
    test(`level 2 gets 403 from ${path} and no part is stored`, () =>
        withServer(async (baseUrl) => {
            const res = await postJson(baseUrl, path, 2, body);
            assert.equal(res.status, 403);
            assert.equal(count('part'), 0);
        }));

    test(`level 3 gets 201 from ${path} and the sent part is stored`, () =>
        withServer(async (baseUrl) => {
            const res = await postJson(baseUrl, path, 3, body);
            assert.equal(res.status, 201);
            const row = sqlite.prepare('SELECT number, description FROM part WHERE id = ?').get((await res.json()).id);
            assert.deepEqual({ ...row }, body);
        }));
}

test('level 2 gets 403 from /part/pool/:id/files and no file row is stored', () =>
    withServer(async (baseUrl) => {
        const { lastInsertRowid } = sqlite.prepare('INSERT INTO part (number, description) VALUES (?, ?)').run('S-1', 'Seed');
        const res = await postFile(baseUrl, Number(lastInsertRowid), 2);
        assert.equal(res.status, 403);
        assert.equal(count('uploaded_files'), 0);
    }));
