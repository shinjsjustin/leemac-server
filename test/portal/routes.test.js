const { test } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdminToken, clientToken: signClientToken } = require('../helpers/session');

const fakeDb = { calls: [], handlers: [] };
fakeDb.execute = async (sql, params) => {
    if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
    fakeDb.calls.push({ sql, params });
    if (fakeDb.throwOn && fakeDb.throwOn.test(sql)) throw new Error('db exploded: secret detail');
    const h = fakeDb.handlers.find((x) => x.match.test(sql));
    return [h ? h.rows : []];
};
fakeDb.query = fakeDb.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const COMPANY = 5;
const clientToken = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: COMPANY });
const adminToken = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 3 });
const rolelessToken = jwt.sign({ id: 3 }, process.env.JWT_SECRET);

function setRows(handlers, throwOn) {
    fakeDb.calls.length = 0;
    fakeDb.handlers = handlers;
    fakeDb.throwOn = throwOn;
}

const OWN_JOB = { match: /SELECT job\.id FROM job WHERE job\.id = \? AND job\.company_id/, rows: [{ id: 1 }] };
const OWN_JP = { match: /SELECT jp\.id FROM job_part jp/, rows: [{ id: 1 }] };
const OWN_PART = { match: /SELECT jp\.part_id FROM job_part jp/, rows: [{ part_id: 1 }] };

async function call(server, method, path, { token, body } = {}) {
    const res = await fetch(`${server.baseUrl}/api/client/portal${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res;
}

const ROUTES = [
    ['GET', '/starred'], ['GET', '/jobs'], ['GET', '/parts'], ['GET', '/jobs/1'],
    ['GET', '/jobs/1/files'], ['GET', '/jobs/1/notes'], ['GET', '/parts/1'], ['GET', '/parts/1/files'],
    ['GET', '/files/1/download'], ['POST', '/jobs/1/notes', { content: 'hi' }],
    ['PUT', '/status', { jobPartId: 1, status: 'done' }],
];

test('every portal route is 401 without a token and 403 for admin and role-less tokens', async () => {
    const server = await start(require('../../src/app'));
    try {
        setRows([]);
        for (const [method, path, body] of ROUTES) {
            assert.strictEqual((await call(server, method, path, { body })).status, 401, `${method} ${path} anon`);
            assert.strictEqual((await call(server, method, path, { body, token: adminToken })).status, 403, `${method} ${path} admin`);
            assert.strictEqual((await call(server, method, path, { body, token: rolelessToken })).status, 403, `${method} ${path} roleless`);
        }
        assert.strictEqual(fakeDb.calls.length, 0);
    } finally {
        await server.close();
    }
});

test('the token company is bound in queries, ignoring company_id and companyId in query and body', async () => {
    const server = await start(require('../../src/app'));
    try {
        setRows([{ match: /COUNT\(\*\)/, rows: [{ total: 0 }] }]);
        const qs = '?company_id=99&companyId=98';
        for (const path of ['/starred', '/jobs', '/parts']) {
            setRows([{ match: /COUNT\(\*\)/, rows: [{ total: 0 }] }]);
            assert.strictEqual((await call(server, 'GET', path + qs, { token: clientToken, body: undefined })).status, 200);
            assert.ok(fakeDb.calls.length > 0);
            for (const c of fakeDb.calls) {
                assert.ok(c.params.includes(COMPANY), `${path} binds token company`);
                assert.ok(!c.params.includes(99) && !c.params.includes(98), `${path} ignores spoofed company`);
            }
        }
    } finally {
        await server.close();
    }
});

test('GET /jobs/:id returns the job when owned and 404 when not', async () => {
    const server = await start(require('../../src/app'));
    try {
        setRows([OWN_JOB, { match: /FROM job\s+JOIN company/, rows: [{ id: 1, job_number: 'J1' }] }]);
        const ok = await call(server, 'GET', '/jobs/1', { token: clientToken });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual((await ok.json()).job.job_number, 'J1');

        setRows([]);
        assert.strictEqual((await call(server, 'GET', '/jobs/1', { token: clientToken })).status, 404);
        for (const p of ['/jobs/1/files', '/parts/1', '/parts/1/files', '/files/1/download']) {
            assert.strictEqual((await call(server, 'GET', p, { token: clientToken })).status, 404, p);
        }
    } finally {
        await server.close();
    }
});

test('non-integer ids give 400 without touching the db', async () => {
    const server = await start(require('../../src/app'));
    try {
        setRows([]);
        for (const p of ['/jobs/abc', '/jobs/1.5', '/jobs/abc/files', '/parts/x', '/parts/x/files', '/files/x/download']) {
            assert.strictEqual((await call(server, 'GET', p, { token: clientToken })).status, 400, p);
        }
        assert.strictEqual(fakeDb.calls.length, 0);
    } finally {
        await server.close();
    }
});

test('job note routes are 410 naming /api/portal-notes for owned and unowned jobs, with no db calls', async () => {
    const server = await start(require('../../src/app'));
    try {
        for (const rows of [[OWN_JOB], []]) {
            setRows(rows);
            for (const [method, body] of [['GET'], ['POST', { content: 'hello' }]]) {
                const res = await call(server, method, '/jobs/1/notes', { token: clientToken, body });
                assert.strictEqual(res.status, 410, method);
                assert.match((await res.json()).error, /\/api\/portal-notes/);
            }
        }
        assert.strictEqual(fakeDb.calls.length, 0);
    } finally {
        await server.close();
    }
});

test('PUT /status is 410 for a signed-in client and runs no query beyond the session lookup', async () => {
    const server = await start(require('../../src/app'));
    try {
        setRows([OWN_JP]);
        const res = await call(server, 'PUT', '/status', { token: clientToken, body: { jobPartId: 1, status: 'done' } });
        assert.strictEqual(res.status, 410);
        assert.deepStrictEqual(await res.json(), { error: 'Status is set by Leemac' });
        assert.strictEqual(fakeDb.calls.length, 0);
    } finally {
        await server.close();
    }
});

test('a db failure gives a generic 500', async () => {
    const server = await start(require('../../src/app'));
    try {
        setRows([], /COUNT/);
        const res = await call(server, 'GET', '/jobs', { token: clientToken });
        assert.strictEqual(res.status, 500);
        const text = await res.text();
        assert.ok(!/secret detail/.test(text));
    } finally {
        await server.close();
    }
});

test('file download streams an owned file as an attachment', async () => {
    const server = await start(require('../../src/app'));
    try {
        const file = { id: 1, filename: 'a.pdf', mimetype: 'application/pdf', size: 3, content: Buffer.from('abc') };
        setRows([{ match: /FROM uploaded_files f/, rows: [{ id: 1 }] }, { match: /SELECT \* FROM uploaded_files/, rows: [file] }]);
        const res = await call(server, 'GET', '/files/1/download', { token: clientToken });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('content-disposition'), 'attachment; filename="a.pdf"');
        assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
        assert.strictEqual(await res.text(), 'abc');
    } finally {
        await server.close();
    }
});
