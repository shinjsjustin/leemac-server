const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../helpers/server');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const { SESSION_HANDLER, adminToken, clientToken } = require('../helpers/session');

const COMPANY_A = 10;
const COMPANY_B = 20;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

const qcDb = makeQcDb();
qcDb.sqlite.exec(`
    INSERT INTO job (id, company_id, job_number) VALUES (1, ${COMPANY_A}, 'A-1');
    INSERT INTO part (id, number) VALUES (1, 'P-1');
    INSERT INTO job_part (job_id, part_id, quantity) VALUES (1, 1, 1);
    INSERT INTO uploaded_files (id, filename, part_id) VALUES (1, 'a.pdf', 1);
    INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, size, note, author_id, author_name, created_at, updated_at)
        VALUES (1, 1, 1, 1, NULL, 'point', 0.1, 0.1, 5, 'leemac', '9', 'Leemac', 'now', 'now');
`);

// The app's pool: session lookups and the admin name row are answered here, the rest by sqlite.
const appDb = {
    execute: async (sql, params) => {
        if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
        if (/FROM admin /.test(sql)) return [[]];
        return qcDb.execute(sql, params);
    },
};
appDb.query = appDb.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: appDb };

const asAdmin = (level) => adminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: level });
const tokenA = clientToken({ id: 1, username: 'a', name: 'Ann', company_id: COMPANY_A });
const tokenB = clientToken({ id: 2, username: 'b', name: 'Bob', company_id: COMPANY_B });

async function withServer(fn) {
    const info = mock.method(console, 'info', () => {});
    const server = await start(require('../../src/app'));
    try {
        await fn((method, path, token, body) => fetch(`${server.baseUrl}${path}`, {
            method,
            headers: { Authorization: `Bearer ${token}`, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
            body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        }));
    } finally {
        await server.close();
        info.mock.restore();
    }
}

const photoForm = () => {
    const form = new FormData();
    form.set('job_id', '1');
    form.set('photo', new Blob([PNG], { type: 'image/png' }), 'p.png');
    return form;
};

test('a client reaches /api/portal-qc and another company gets 404', () => withServer(async (call) => {
    const own = await call('GET', '/api/portal-qc/parts/1', tokenA);
    assert.equal(own.status, 200);
    assert.deepEqual(Object.keys(await own.json()).sort(), ['markings', 'photos']);
    const foreign = await call('GET', '/api/portal-qc/parts/1', tokenB);
    assert.equal(foreign.status, 404);
    assert.deepEqual(await foreign.json(), { error: 'Not found' });
}));

test('an access-3 admin uploads a photo at /api/internal/qc and a client token is refused', () => withServer(async (call) => {
    const res = await call('POST', '/api/internal/qc/markings/1/photos', asAdmin(3), photoForm());
    assert.equal(res.status, 201);
    assert.equal(qcDb.sqlite.prepare('SELECT COUNT(*) AS n FROM qc_photo').get().n, 1);
    assert.equal((await call('POST', '/api/internal/qc/markings/1/photos', tokenA, photoForm())).status, 403);
    assert.equal((await call('GET', '/api/internal/qc/requests', tokenA)).status, 403);
}));

const WRITES = [
    ['POST', '/qc/parts/1/markings'],
    ['DELETE', '/qc/parts/1/markings'],
    ['PUT', '/qc/markings/1'],
    ['DELETE', '/qc/markings/1'],
    ['POST', '/qc/markings/1/photos'],
    ['PUT', '/qc/markings/1/photos/order'],
    ['PUT', '/qc/photos/1'],
    ['DELETE', '/qc/photos/1'],
    ['PUT', '/qc/requests/1/dismiss'],
];

test('access 1 and 2 get 403 on every QC write', () => withServer(async (call) => {
    for (const level of [1, 2]) {
        for (const [method, path] of WRITES) {
            const res = await call(method, `/api/internal${path}`, asAdmin(level), {});
            assert.equal(res.status, 403, `level ${level} ${method} ${path}`);
        }
    }
}));

test('access 2 reads QC requests, access 1 does not', () => withServer(async (call) => {
    assert.equal((await call('GET', '/api/internal/qc/requests', asAdmin(2))).status, 200);
    assert.equal((await call('GET', '/api/internal/qc/requests', asAdmin(1))).status, 403);
}));

test('access 2 reads a QC photo with its bytes and type, access 1 gets 403', () => withServer(async (call) => {
    const jpeg = Buffer.from('ffd8ffe000104a46', 'hex');
    qcDb.sqlite.prepare(
        "INSERT INTO qc_photo (id, marking_id, job_id, position, mimetype, size, content) VALUES (900, 1, 1, 1, 'image/jpeg', ?, ?)"
    ).run(jpeg.length, jpeg);
    const ok = await call('GET', '/api/internal/qc/photos/900', asAdmin(2));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), jpeg);
    assert.equal((await call('GET', '/api/internal/qc/photos/900', asAdmin(1))).status, 403);
}));
