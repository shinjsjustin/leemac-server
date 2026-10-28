const { test, mock, beforeEach } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, clientToken: signClientToken, adminToken: signAdminToken } = require('../helpers/session');

// In-memory model of two companies. Handlers answer from the bound params, so a
// refusal follows the token's company instead of a canned row.
const COMPANY_A = 5;
const COMPANY_B = 6;
const SHARED_PART = 30;
const B_ONLY_PART = 40;

let model;
const freshModel = () => ({
    jobs: [
        { id: 1, company_id: COMPANY_A, job_number: 'A-1' },
        { id: 2, company_id: COMPANY_B, job_number: 'B-1' },
    ],
    parts: [
        { id: SHARED_PART, number: 'SHR-30', description: 'Gear housing' },
        { id: B_ONLY_PART, number: 'BBB-40', description: 'Secret widget' },
    ],
    jobParts: [
        { id: 12, job_id: 1, part_id: SHARED_PART },
        { id: 21, job_id: 2, part_id: SHARED_PART },
        { id: 22, job_id: 2, part_id: B_ONLY_PART },
    ],
    files: [
        { id: 300, part_id: SHARED_PART, job_id: null, note_id: null, filename: 'shared.pdf', mimetype: 'application/pdf', size: 6, uploaded_at: '2026-01-01' },
        { id: 400, part_id: B_ONLY_PART, job_id: null, note_id: null, filename: 'b.pdf', mimetype: 'application/pdf', size: 6, uploaded_at: '2026-01-01' },
    ],
});

const companyOwnsPart = (companyId, partId) =>
    model.jobParts.some((jp) => jp.part_id === partId && model.jobs.find((j) => j.id === jp.job_id).company_id === companyId);

const HANDLERS = [
    [/SELECT jp\.part_id FROM job_part jp/, (sql, [partId, companyId]) =>
        companyOwnsPart(companyId, partId) ? [{ part_id: partId }] : []],
    [/FROM part p/, (sql, [partId]) =>
        model.parts.filter((p) => p.id === partId).map((p) => ({ id: p.id, number: p.number, description: p.description }))],
    [/FROM job_part jp\s+JOIN job j ON jp\.job_id = j\.id\s+WHERE jp\.part_id = \? AND j\.company_id = \?\s+ORDER/, (sql, [partId, companyId]) =>
        model.jobParts.filter((jp) => jp.part_id === partId).flatMap((jp) => {
            const job = model.jobs.find((j) => j.id === jp.job_id);
            return job.company_id === companyId ? [{ id: job.id, job_number: job.job_number }] : [];
        })],
    [/FROM uploaded_files f\s+WHERE f\.part_id = \?/, (sql, [partId]) =>
        model.files.filter((f) => f.part_id === partId && f.job_id === null && f.note_id === null)],
];

const fakeDb = {};
fakeDb.execute = async (sql, params) => {
    if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
    const handler = HANDLERS.find(([match]) => match.test(sql));
    return [handler ? handler[1](sql, params) : []];
};
fakeDb.query = fakeDb.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const tokenA = signClientToken({ id: 1, username: 'a', name: 'Ann', company_id: COMPANY_A });
const tokenAdmin = signAdminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: 1 });

beforeEach(() => { model = freshModel(); });

async function withServer(fn) {
    const info = mock.method(console, 'info', () => {});
    const server = await start(require('../../src/app'));
    try {
        await fn(server);
    } finally {
        await server.close();
        info.mock.restore();
    }
}

const get = (server, path, token) =>
    token === undefined
        ? fetch(`${server.baseUrl}/api/portal${path}`)
        : fetch(`${server.baseUrl}/api/portal${path}`, { headers: { Authorization: `Bearer ${token}` } });

test("a shared part lists only the caller's jobs and drawings", async () => {
    await withServer(async (server) => {
        const res = await get(server, `/parts/${SHARED_PART}`, tokenA);
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.deepStrictEqual(body.jobs, [{ id: 1, job_number: 'A-1' }]);
        assert.deepStrictEqual(body.drawings.map((d) => d.id), [300]);
        assert.ok(!JSON.stringify(body).includes('B-1'));
    });
});

test('company_id in the query cannot widen the result', async () => {
    await withServer(async (server) => {
        const body = await (await get(server, `/parts/${SHARED_PART}?company_id=${COMPANY_B}`, tokenA)).json();
        assert.deepStrictEqual(body.jobs, [{ id: 1, job_number: 'A-1' }]);
    });
});

test('A gets 404 for a B-only part without leaking it', async () => {
    await withServer(async (server) => {
        const res = await get(server, `/parts/${B_ONLY_PART}`, tokenA);
        const text = await res.text();
        assert.strictEqual(res.status, 404);
        assert.deepStrictEqual(JSON.parse(text), { error: 'Not found' });
        assert.ok(!text.includes('Secret') && !text.includes('b.pdf'));
    });
});

test('bad ids are 404', async () => {
    await withServer(async (server) => {
        for (const id of ['abc', '0', '-1', '1.5', '99999999999']) {
            assert.strictEqual((await get(server, `/parts/${id}`, tokenA)).status, 404, id);
        }
    });
});

test('is 401 without a token and 403 for an admin token', async () => {
    await withServer(async (server) => {
        assert.strictEqual((await get(server, `/parts/${SHARED_PART}`)).status, 401);
        assert.strictEqual((await get(server, `/parts/${SHARED_PART}`, tokenAdmin)).status, 403);
    });
});
