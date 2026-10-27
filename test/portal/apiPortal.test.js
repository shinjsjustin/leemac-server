const { test, mock } = require('node:test');
const assert = require('node:assert');
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

function setRows(handlers, throwOn) {
    fakeDb.calls.length = 0;
    fakeDb.handlers = handlers;
    fakeDb.throwOn = throwOn;
}

const OWN_JOB = { match: /SELECT job\.id FROM job WHERE job\.id = \? AND job\.company_id/, rows: [{ id: 1 }] };
const OWN_PART = { match: /SELECT jp\.part_id FROM job_part jp/, rows: [{ part_id: 1 }] };
const COUNT = { match: /COUNT\(\*\)/, rows: [{ total: 0 }] };
const JOB_ROW = { match: /FROM job j\s+WHERE j\.id = \?/, rows: [{ id: 1, job_number: 'J1' }] };
const FILE_LIST = { match: /SELECT f\.id, f\.filename/, rows: [{ id: 2, filename: 'a.pdf', mimetype: 'application/pdf', size: 3, uploaded_at: null }] };
const FILE = (filename) => ({
    match: /SELECT f\.filename, f\.mimetype/,
    rows: [{ filename, mimetype: 'application/pdf', size: 3, content: Buffer.from('abc') }],
});

function call(server, method, path, { token, body } = {}) {
    return fetch(`${server.baseUrl}/api/portal${path}`, {
        method,
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

async function withServer(fn) {
    const info = mock.method(console, 'info', () => {});
    const server = await start(require('../../src/app'));
    try {
        await fn(server, info);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

const ID_ROUTES = ['/jobs/1', '/parts/1/files', '/files/1'];
const auditLines = (info) => info.mock.calls.map((c) => JSON.parse(c.arguments[0]));

test('client token gets 200 on every route with data bound to the token company', async () => {
    await withServer(async (server) => {
        const qs = '?company_id=99&companyId=98';
        const cases = [
            ['/jobs', [COUNT]],
            ['/jobs/1', [OWN_JOB, JOB_ROW]],
            ['/parts/1/files', [OWN_PART, FILE_LIST]],
            ['/files/1', [FILE('a.pdf')]],
        ];
        for (const [path, handlers] of cases) {
            setRows(handlers);
            const res = await call(server, 'GET', path + qs, { token: clientToken });
            assert.strictEqual(res.status, 200, path);
            assert.ok(fakeDb.calls.length > 0);
            assert.ok(fakeDb.calls[0].params.includes(COMPANY), `${path} binds token company`);
            for (const c of fakeDb.calls) {
                assert.ok(!c.params.includes(99) && !c.params.includes(98), `${path} ignores spoofed company`);
            }
        }
    });
});

test('missing, other-company and non-numeric ids give the same 404 body on every id route', async () => {
    await withServer(async (server) => {
        const ids = ['1', '0', '01', 'abc', '1.5', '12345678901', '-1'];
        for (const base of ID_ROUTES) {
            for (const id of ids) {
                setRows([]);
                const path = base.replace('/1', `/${id}`);
                const res = await call(server, 'GET', path, { token: clientToken });
                assert.strictEqual(res.status, 404, path);
                assert.deepStrictEqual(await res.json(), { error: 'Not found' }, path);
            }
        }
    });
});

test('non-numeric ids never reach the db', async () => {
    await withServer(async (server) => {
        setRows([]);
        for (const base of ID_ROUTES) await call(server, 'GET', base.replace('/1', '/abc'), { token: clientToken });
        assert.strictEqual(fakeDb.calls.length, 0);
    });
});

test('no token or bad token is 401, admin token 403, other methods 405, all with no data query', async () => {
    await withServer(async (server) => {
        setRows([]);
        for (const path of ['/jobs', ...ID_ROUTES]) {
            assert.strictEqual((await call(server, 'GET', path)).status, 401, `${path} anon`);
            assert.strictEqual((await call(server, 'GET', path, { token: 'garbage' })).status, 401, `${path} bad`);
            assert.strictEqual((await call(server, 'GET', path, { token: adminToken })).status, 403, `${path} admin`);
            for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
                const res = await call(server, method, path, { token: clientToken, body: { company_id: 99 } });
                assert.strictEqual(res.status, 405, `${method} ${path}`);
            }
        }
        assert.strictEqual((await call(server, 'POST', '/jobs')).status, 401);
        assert.strictEqual(fakeDb.calls.length, 0);
    });
});

test('HEAD is allowed', async () => {
    await withServer(async (server) => {
        setRows([COUNT]);
        assert.strictEqual((await call(server, 'HEAD', '/jobs', { token: clientToken })).status, 200);
    });
});

test('every response carries no-store, nosniff and RateLimit headers, including refusals', async () => {
    await withServer(async (server) => {
        setRows([COUNT, OWN_JOB]);
        const responses = [
            await call(server, 'GET', '/jobs', { token: clientToken }),
            await call(server, 'GET', '/jobs'),
            await call(server, 'GET', '/jobs', { token: adminToken }),
            await call(server, 'POST', '/jobs', { token: clientToken }),
            await call(server, 'GET', '/jobs/abc', { token: clientToken }),
            await call(server, 'GET', '/nothing', { token: clientToken }),
        ];
        for (const res of responses) {
            assert.strictEqual(res.headers.get('cache-control'), 'no-store');
            assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
            assert.ok(res.headers.get('ratelimit') || res.headers.get('ratelimit-limit'));
        }
    });
});

test('download is an attachment with quotes, CR and LF stripped from the filename', async () => {
    await withServer(async (server) => {
        setRows([FILE('a"b\r\nc.pdf')]);
        const res = await call(server, 'GET', '/files/1', { token: clientToken });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('content-disposition'), 'attachment; filename="abc.pdf"');
        assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
        assert.strictEqual(res.headers.get('content-length'), '3');
        assert.strictEqual(await res.text(), 'abc');
    });
});

test('unknown portal paths give a JSON 404', async () => {
    await withServer(async (server) => {
        setRows([]);
        const res = await call(server, 'GET', '/nothing', { token: clientToken });
        assert.strictEqual(res.status, 404);
        assert.deepStrictEqual(await res.json(), { error: 'Not found' });
    });
});

test('a db failure gives a generic 500', async () => {
    await withServer(async (server) => {
        const err = mock.method(console, 'error', () => {});
        try {
            setRows([], /COUNT/);
            const res = await call(server, 'GET', '/jobs', { token: clientToken });
            assert.strictEqual(res.status, 500);
            assert.ok(!/secret detail/.test(await res.text()));
        } finally {
            err.mock.restore();
        }
    });
});

test('each request, including refused ones, writes exactly one audit line', async () => {
    await withServer(async (server, info) => {
        setRows([COUNT]);
        await call(server, 'GET', '/jobs', { token: clientToken });
        await call(server, 'GET', '/jobs');
        await call(server, 'GET', '/jobs', { token: adminToken });
        await call(server, 'POST', '/jobs', { token: clientToken });
        await call(server, 'GET', '/jobs/abc', { token: clientToken });
        await new Promise((r) => setTimeout(r, 50));
        const lines = auditLines(info).filter((l) => l.event === 'portal_request');
        assert.deepStrictEqual(lines.map((l) => l.status), [200, 401, 403, 405, 404]);
    });
});
