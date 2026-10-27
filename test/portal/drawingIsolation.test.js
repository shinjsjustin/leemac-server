const { test, mock, beforeEach } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

// In-memory model of two companies. Handlers answer from the bound params, so a
// refusal follows the token's company instead of a canned row.
const BYTES = 'COMPANY-A-DRAWING-BYTES';
const COMPANY_A = 5;
const COMPANY_B = 6;
const PART_DRAWING_ID = 100;
const JOB_FILE_ID = 101;

let model;
const freshModel = () => ({
    jobs: [
        { id: 1, company_id: COMPANY_A, job_number: 'A-1' },
        { id: 2, company_id: COMPANY_B, job_number: 'B-1' },
    ],
    jobParts: [
        { id: 11, job_id: 1, part_id: 10 },
        { id: 21, job_id: 2, part_id: 20 },
    ],
    files: [
        { id: PART_DRAWING_ID, part_id: 10, job_id: null, note_id: null, filename: 'a.pdf', mimetype: 'application/pdf', size: BYTES.length, content: Buffer.from(BYTES) },
        { id: JOB_FILE_ID, part_id: null, job_id: 1, note_id: null, filename: 'job.pdf', mimetype: 'application/pdf', size: BYTES.length, content: Buffer.from(BYTES) },
    ],
});

const companyOwnsPart = (companyId, partId) =>
    model.jobParts.some((jp) => jp.part_id === partId && model.jobs.find((j) => j.id === jp.job_id).company_id === companyId);

const HANDLERS = [
    [/SELECT job\.id FROM job WHERE job\.id = \? AND job\.company_id/, ([jobId, companyId]) =>
        model.jobs.filter((j) => j.id === jobId && j.company_id === companyId).map((j) => ({ id: j.id }))],
    [/FROM job j\s+WHERE j\.id = \? AND j\.company_id = \?/, ([jobId, companyId]) =>
        model.jobs.filter((j) => j.id === jobId && j.company_id === companyId)],
    [/FROM job_part jp\s+JOIN part p/, (jobIds) =>
        model.jobParts.filter((jp) => jobIds.includes(jp.job_id)).map((jp) => ({
            job_id: jp.job_id, job_part_id: jp.id, part_id: jp.part_id, part_number: `P${jp.part_id}`,
        }))],
    [/SELECT jp\.part_id FROM job_part jp/, ([partId, companyId]) =>
        companyOwnsPart(companyId, partId) ? [{ part_id: partId }] : []],
    [/SELECT f\.id, f\.filename/, ([partId]) =>
        model.files.filter((f) => f.part_id === partId && f.job_id === null && f.note_id === null)],
    [/SELECT f\.filename, f\.mimetype/, ([fileId, companyId]) =>
        model.files.filter((f) => f.id === fileId && f.part_id !== null && f.job_id === null && f.note_id === null
            && companyOwnsPart(companyId, f.part_id))],
];

const fakeDb = {};
fakeDb.execute = async (sql, params) => {
    if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
    const handler = HANDLERS.find(([match]) => match.test(sql));
    return [handler ? handler[1](params) : []];
};
fakeDb.query = fakeDb.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const tokenA = signClientToken({ id: 1, username: 'a', name: 'Ann', company_id: COMPANY_A });
const tokenB = signClientToken({ id: 2, username: 'b', name: 'Bob', company_id: COMPANY_B });

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
    fetch(`${server.baseUrl}/api/portal${path}`, { headers: { Authorization: `Bearer ${token}` } });

async function assertRefused(server, path, token) {
    const res = await get(server, path, token);
    const body = await res.text();
    assert.strictEqual(res.status, 404, path);
    assert.deepStrictEqual(JSON.parse(body), { error: 'Not found' }, path);
    assert.ok(!body.includes(BYTES), `${path} leaks no file bytes`);
}

test("company A gets 200 on its own job, part files and drawing", async () => {
    await withServer(async (server) => {
        assert.strictEqual((await get(server, '/jobs/1', tokenA)).status, 200);
        const list = await get(server, '/parts/10/files', tokenA);
        assert.strictEqual(list.status, 200);
        assert.deepStrictEqual((await list.json()).map((f) => f.id), [PART_DRAWING_ID]);
        const file = await get(server, `/files/${PART_DRAWING_ID}`, tokenA);
        assert.strictEqual(file.status, 200);
        assert.strictEqual(await file.text(), BYTES);
    });
});

test("company B is refused A's job, part and drawing with 404 and no bytes", async () => {
    await withServer(async (server) => {
        for (const path of ['/jobs/1', '/parts/10/files', `/files/${PART_DRAWING_ID}`]) {
            await assertRefused(server, path, tokenB);
        }
    });
});

test('a job-level file is 404 on /files/:id even for its own company', async () => {
    await withServer(async (server) => {
        await assertRefused(server, `/files/${JOB_FILE_ID}`, tokenA);
        await assertRefused(server, `/files/${JOB_FILE_ID}`, tokenB);
    });
});

test("company B can list and fetch a part's drawing only after one of B's jobs has that part", async () => {
    await withServer(async (server) => {
        await assertRefused(server, '/parts/10/files', tokenB);
        await assertRefused(server, `/files/${PART_DRAWING_ID}`, tokenB);

        model.jobParts.push({ id: 22, job_id: 2, part_id: 10 });

        const list = await get(server, '/parts/10/files', tokenB);
        assert.strictEqual(list.status, 200);
        assert.deepStrictEqual((await list.json()).map((f) => f.id), [PART_DRAWING_ID]);
        const file = await get(server, `/files/${PART_DRAWING_ID}`, tokenB);
        assert.strictEqual(file.status, 200);
        assert.strictEqual(await file.text(), BYTES);
        await assertRefused(server, '/jobs/1', tokenB);
    });
});
