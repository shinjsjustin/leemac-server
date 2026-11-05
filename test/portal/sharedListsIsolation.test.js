const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeSharedListsDb } = require('../helpers/sharedListsSqliteDb');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

const holder = { db: null };
const route = async (sql, params) => (SESSION_HANDLER.match.test(sql) ? [SESSION_HANDLER.rows] : holder.db.execute(sql, params));
const sessionDb = { execute: route, query: route, getConnection: () => holder.db.getConnection() };
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: sessionDb };

const { createPortalListsRouter } = require('../../src/routes/portalLists');
const portalRouter = require('../../src/routes/portal');
const clientPortalRouter = require('../../src/routes/clientPortal');
const isAuth = require('../../src/middleware/isAuth');

const TOKEN = 'Q'.repeat(43);
const ann = signClientToken({ id: 11, username: 'ann', name: 'Ann', company_id: 1 });

// Company 1 (Ann) sees P-SHARED and P-ANN; P-FEE is only a fee line for her; P-ZETA belongs to company 2.
function seed() {
    const db = makeSharedListsDb();
    db.sqlite.exec(`
      ALTER TABLE job ADD COLUMN created_at TEXT;
      ALTER TABLE job ADD COLUMN po_number TEXT;
      ALTER TABLE job ADD COLUMN po_date TEXT;
      ALTER TABLE job ADD COLUMN due_date TEXT;
      ALTER TABLE job ADD COLUMN ship_date TEXT;
      ALTER TABLE job ADD COLUMN invoice_date TEXT;
      ALTER TABLE job_part ADD COLUMN quantity INTEGER;
      CREATE TABLE stars (id INTEGER PRIMARY KEY AUTOINCREMENT, job_part_id INTEGER, status TEXT);
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
      INSERT INTO company (id, name) VALUES (1,'Acme Tooling'),(2,'Zeta Corporation');
      INSERT INTO job (id, company_id, job_number, created_at) VALUES (1,1,'J1','2026-01-01'),(2,2,'J2','2026-02-01');
      INSERT INTO part (id, number, description) VALUES
        (1,'P-SHARED','Shared bracket'),(2,'P-ANN','Ann plate'),(3,'P-FEE','Setup fee thing'),(4,'P-ZETA','Zeta secret gear'),(5,'P-BOTH','Both bracket');
      INSERT INTO job_part (job_id, part_id, details) VALUES
        (1,1,'*AL'),(2,1,'*AL'),(1,2,'*AL'),(1,3,'*Fee'),(2,4,'*Steel'),(1,5,'*Fee'),(1,5,'*AL');
      INSERT INTO uploaded_files (id, filename, mimetype, size, content, part_id) VALUES
        (101,'shared.pdf','application/pdf',1,x'01',1),
        (102,'ann.pdf','application/pdf',1,x'02',2),
        (103,'fee-secret.pdf','application/pdf',1,x'03',3),
        (104,'zeta-secret.pdf','application/pdf',1,x'04',4),
        (105,'both.pdf','application/pdf',1,x'05',5);
      INSERT INTO admin_part_list (id, name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at, share_token, share_enabled)
        VALUES (1,'Shared list','1','CreatorSecret','2','UpdaterSecret','CREATEDSTAMP','UPDATEDSTAMP','${TOKEN}',1),
               (2,'Other list','1','CreatorSecret','2','UpdaterSecret','CREATEDSTAMP','UPDATEDSTAMP',NULL,0);
      INSERT INTO admin_part_list_item (list_id, part_id, added_at, added_by_company_id) VALUES
        (1,1,'t',1),(1,2,'t',1),(1,3,'t',NULL),(1,4,'t',2),(2,4,'t',2);
      INSERT INTO admin_part_list_member (list_id, company_id, joined_by_id, joined_by_name, joined_at) VALUES
        (1,1,'11','Ann','JOINEDSTAMP'),(1,2,'22','Bob Memberson','JOINEDSTAMP'),(2,2,'22','Bob Memberson','JOINEDSTAMP');
    `);
    return db;
}

const FORBIDDEN = [
    'P-ZETA', 'Zeta secret gear', 'zeta-secret.pdf', 'P-FEE', 'Setup fee thing', 'fee-secret.pdf',
    'Zeta Corporation', 'Bob Memberson', 'CreatorSecret', 'UpdaterSecret', 'created_by', 'updated_by',
    'CREATEDSTAMP', 'UPDATEDSTAMP', 'JOINEDSTAMP', 'added_by', 'hidden', 'count', 'total',
];
const HIDDEN_FILE_IDS = [103, 104];

async function withServer(fn) {
    holder.db = seed();
    const app = express();
    app.use(express.json());
    app.use('/api/portal', portalRouter);
    app.use('/api/client/portal', isAuth, clientPortalRouter);
    app.use('/api/portal-lists', createPortalListsRouter({ db: holder.db, writeLimiter: (req, res, next) => next(), send: async () => {} }));
    const info = mock.method(console, 'info', () => {});
    const server = await start(app);
    try {
        await fn(server);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

async function call(server, method, path, body) {
    const res = await fetch(`${server.baseUrl}/api/portal-lists/shared${path}`, {
        method,
        headers: { Authorization: `Bearer ${ann}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, text: await res.text() };
}

function assertClean(label, text) {
    for (const word of FORBIDDEN) assert.ok(!text.includes(word), `${label} leaks ${word}: ${text}`);
    for (const id of HIDDEN_FILE_IDS) assert.ok(!new RegExp(`\\b${id}\\b`).test(text), `${label} leaks file id ${id}`);
}

const dump = (db) => JSON.stringify(
    ['admin_part_list', 'admin_part_list_item', 'admin_part_list_member', 'quote_request', 'quote_request_line']
        .map((table) => db.sqlite.prepare(`SELECT * FROM ${table}`).all())
);

test('no response body on any route holds a hidden part, another company or staff metadata', async () => {
    await withServer(async (server) => {
        const walk = [
            ['GET', '/'], ['GET', '/1'], ['GET', '/1/request-lines'],
            ['POST', '/invite', { token: TOKEN }],
            ['PUT', '/1', { name: 'Renamed' }],
            ['POST', '/1/parts', { part_ids: [2] }],
            ['POST', '/1/parts', { part_ids: [4] }],
            ['POST', '/1/parts', { part_ids: [3] }],
            ['POST', '/1/parts/remove', { part_ids: [4, 3] }],
            ['POST', '/1/parts/remove', { part_ids: [2] }],
            ['POST', '/1/request', { lines: [{ part_id: 4, quantity: 1 }] }],
            ['POST', '/1/request', { lines: [{ part_id: 1, quantity: 3 }] }],
            ['POST', '/invite/join', { token: TOKEN }],
            ['GET', '/'], ['GET', '/1'],
            ['POST', '/1/leave'],
            ['GET', '/1'],
        ];
        const bodies = [];
        for (const [method, path, body] of walk) {
            const res = await call(server, method, path, body);
            assertClean(`${method} ${path}`, res.text);
            bodies.push(res.text);
        }
        assert.ok(bodies[1].includes('P-SHARED') && bodies[1].includes('P-ANN'));
        assert.deepEqual(Object.keys(JSON.parse(bodies[1])), ['id', 'name', 'parts']);
        assert.deepEqual(JSON.parse(bodies[1]).parts.map((p) => p.part_number), ['P-SHARED', 'P-ANN']);
    });
});

test('the file route is 404 for a hidden part file and 200 for a visible one', async () => {
    await withServer(async (server) => {
        const get = (id) => fetch(`${server.baseUrl}/api/portal/files/${id}`, { headers: { Authorization: `Bearer ${ann}` } });
        assert.equal((await get(104)).status, 404);
        assert.equal((await get(101)).status, 200);
        const list = JSON.parse((await call(server, 'GET', '/1')).text);
        for (const file of list.parts.flatMap((p) => p.files)) assert.equal((await get(file.id)).status, 200);
    });
});

test('a non-member gets 404 on every list route and nothing is written', async () => {
    await withServer(async (server) => {
        await call(server, 'POST', '/1/leave');
        const before = dump(holder.db);
        const walk = [
            ['GET', '/1'], ['GET', '/2'], ['PUT', '/2', { name: 'x' }], ['POST', '/2/parts', { part_ids: [1] }],
            ['POST', '/2/parts/remove', { part_ids: [4] }], ['POST', '/2/leave'], ['GET', '/2/request-lines'],
            ['PUT', '/1', { name: 'x' }], ['POST', '/1/parts', { part_ids: [1] }], ['POST', '/1/parts/remove', { part_ids: [1] }],
            ['POST', '/1/request', { lines: [{ part_id: 1, quantity: 1 }] }], ['GET', '/1/request-lines'],
        ];
        for (const [method, path, body] of walk) {
            const res = await call(server, method, path, body);
            assert.equal(res.status, 404, `${method} ${path}`);
            assert.equal(res.text, JSON.stringify({ error: 'Not found' }));
        }
        assert.equal(dump(holder.db), before);
    });
});

test('every client file route is 404 for a fee-only part and 200 when the part has a real line', async () => {
    await withServer(async (server) => {
        const get = async (path) => (await fetch(`${server.baseUrl}${path}`, { headers: { Authorization: `Bearer ${ann}` } }));
        for (const path of [
            '/api/portal/files/103', '/api/portal/parts/3', '/api/portal/parts/3/files',
            '/api/client/portal/files/103/download', '/api/client/portal/parts/3/files', '/api/client/portal/parts/3',
        ]) {
            assert.equal((await get(path)).status, 404, path);
        }
        assert.equal((await get('/api/portal/files/105')).status, 200);
        assert.equal((await get('/api/client/portal/files/105/download')).status, 200);
        assert.equal((await get('/api/portal/files/101')).status, 200);

        const job = await get('/api/portal/jobs/1');
        assert.equal(job.status, 200);
        const body = await job.json();
        assert.ok(body.charges.some((c) => c.part_description === 'Setup fee thing'));
    });
});
