const { test, mock, beforeEach } = require('node:test');
const assert = require('node:assert');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, clientToken: signClientToken, adminToken: signAdminToken } = require('../helpers/session');

// In-memory model of two companies. Handlers answer from the bound params, so a
// refusal follows the token's company instead of a canned row.
const BYTES = 'COMPANY-B-DRAWING-BYTES';
const COMPANY_A = 5;
const COMPANY_B = 6;
const SHARED_PART = 30;
const B_ONLY_PART = 40;
const B_ONLY_FILE_ID = 400;

let model;
const freshModel = () => ({
    jobs: [
        { id: 1, company_id: COMPANY_A, job_number: 'A-1' },
        { id: 2, company_id: COMPANY_B, job_number: 'B-1' },
    ],
    parts: [
        { id: 10, number: 'AAA-10', description: 'Bracket' },
        { id: SHARED_PART, number: 'SHR-30', description: 'Gear housing' },
        { id: B_ONLY_PART, number: 'BBB-40', description: 'Secret widget' },
    ],
    jobParts: [
        { id: 11, job_id: 1, part_id: 10 },
        { id: 12, job_id: 1, part_id: SHARED_PART },
        { id: 21, job_id: 2, part_id: SHARED_PART },
        { id: 22, job_id: 2, part_id: B_ONLY_PART },
    ],
    files: [
        { id: 300, part_id: SHARED_PART, job_id: null, note_id: null, filename: 'shared.pdf', mimetype: 'application/pdf', content: Buffer.from('shared') },
        { id: B_ONLY_FILE_ID, part_id: B_ONLY_PART, job_id: null, note_id: null, filename: 'b.pdf', mimetype: 'application/pdf', content: Buffer.from(BYTES) },
    ],
});

const companyOwnsPart = (companyId, partId) =>
    model.jobParts.some((jp) => jp.part_id === partId && model.jobs.find((j) => j.id === jp.job_id).company_id === companyId);

const contains = (value, text) => value.toLowerCase().includes(text.replace(/%/g, '').toLowerCase());

// Params are [companyId, numberPattern?, descriptionPattern?] in the order the SQL adds them.
function partRows(sql, [companyId, ...patterns]) {
    const numberPattern = /p\.number LIKE/.test(sql) ? patterns.shift() : null;
    const descriptionPattern = /p\.description LIKE/.test(sql) ? patterns.shift() : null;
    return model.jobParts.flatMap((jp) => {
        const job = model.jobs.find((j) => j.id === jp.job_id);
        const part = model.parts.find((p) => p.id === jp.part_id);
        if (job.company_id !== companyId) return [];
        if (numberPattern && !contains(part.number, numberPattern)) return [];
        if (descriptionPattern && !contains(part.description, descriptionPattern)) return [];
        return [{ part_id: part.id, part_number: part.number, part_description: part.description, job_id: job.id, job_number: job.job_number }];
    });
}

const HANDLERS = [
    [/FROM job_part jp\s+JOIN job j ON jp\.job_id = j\.id\s+JOIN part p/, partRows],
    [/SELECT f\.id, f\.filename, f\.mimetype, f\.part_id/, (sql, partIds) =>
        model.files.filter((f) => partIds.includes(f.part_id) && f.job_id === null && f.note_id === null)],
    [/SELECT job\.id FROM job WHERE job\.id = \? AND job\.company_id/, (sql, [jobId, companyId]) =>
        model.jobs.filter((j) => j.id === jobId && j.company_id === companyId).map((j) => ({ id: j.id }))],
    [/FROM job j\s+WHERE j\.id = \? AND j\.company_id = \?/, (sql, [jobId, companyId]) =>
        model.jobs.filter((j) => j.id === jobId && j.company_id === companyId)],
    [/FROM job_part jp\s+JOIN part p/, (sql, jobIds) =>
        model.jobParts.filter((jp) => jobIds.includes(jp.job_id)).map((jp) => ({
            job_id: jp.job_id, job_part_id: jp.id, part_id: jp.part_id, part_number: `P${jp.part_id}`,
        }))],
    [/SELECT jp\.part_id FROM job_part jp/, (sql, [partId, companyId]) =>
        companyOwnsPart(companyId, partId) ? [{ part_id: partId }] : []],
    [/SELECT f\.id, f\.filename/, (sql, [partId]) =>
        model.files.filter((f) => f.part_id === partId && f.job_id === null && f.note_id === null)],
    [/SELECT f\.filename, f\.mimetype/, (sql, [fileId, companyId]) =>
        model.files.filter((f) => f.id === fileId && f.part_id !== null && f.job_id === null && f.note_id === null
            && companyOwnsPart(companyId, f.part_id))],
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
const tokenB = signClientToken({ id: 2, username: 'b', name: 'Bob', company_id: COMPANY_B });
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

const partsFor = async (server, query, token) => (await get(server, `/parts${query}`, token)).json();

async function assertRefused(server, path, token) {
    const res = await get(server, path, token);
    const body = await res.text();
    assert.strictEqual(res.status, 404, path);
    assert.deepStrictEqual(JSON.parse(body), { error: 'Not found' }, path);
    assert.ok(!body.includes(BYTES), `${path} leaks no file bytes`);
}

test("each company sees the shared part with only its own job", async () => {
    await withServer(async (server) => {
        const a = await partsFor(server, '', tokenA);
        assert.deepStrictEqual(a.map((p) => p.part_id), [10, SHARED_PART]);
        assert.deepStrictEqual(a.find((p) => p.part_id === SHARED_PART).jobs, [{ id: 1, job_number: 'A-1' }]);

        const b = await partsFor(server, '', tokenB);
        assert.deepStrictEqual(b.map((p) => p.part_id), [SHARED_PART, B_ONLY_PART]);
        assert.deepStrictEqual(b.find((p) => p.part_id === SHARED_PART).jobs, [{ id: 2, job_number: 'B-1' }]);
    });
});

test("a part only on B's jobs never appears for A, even with company_id in the query", async () => {
    await withServer(async (server) => {
        const a = await partsFor(server, `?company_id=${COMPANY_B}`, tokenA);
        assert.ok(!a.some((p) => p.part_id === B_ONLY_PART));
        assert.deepStrictEqual(a.map((p) => p.part_id), [10, SHARED_PART]);
    });
});

test("number and description search return only matching own parts", async () => {
    await withServer(async (server) => {
        assert.deepStrictEqual((await partsFor(server, '?number=SHR', tokenA)).map((p) => p.part_id), [SHARED_PART]);
        assert.deepStrictEqual((await partsFor(server, '?description=bracket', tokenA)).map((p) => p.part_id), [10]);
        assert.deepStrictEqual(await partsFor(server, '?number=BBB', tokenA), []);
        assert.deepStrictEqual(await partsFor(server, '?description=secret', tokenA), []);
        assert.deepStrictEqual((await partsFor(server, '?number=BBB', tokenB)).map((p) => p.part_id), [B_ONLY_PART]);
    });
});

test("part-level PDFs are summarised only for the caller's own parts", async () => {
    await withServer(async (server) => {
        const a = await partsFor(server, '', tokenA);
        const shared = a.find((p) => p.part_id === SHARED_PART);
        assert.strictEqual(shared.drawing_count, 1);
        assert.deepStrictEqual(shared.latest_drawing, { id: 300, filename: 'shared.pdf', mimetype: 'application/pdf' });
        assert.strictEqual(a.find((p) => p.part_id === 10).latest_drawing, null);
        assert.ok(!JSON.stringify(a).includes('b.pdf'));
    });
});

test("A gets 404 for B's job, B-only part files and a file on a B-only part", async () => {
    await withServer(async (server) => {
        for (const path of ['/jobs/2', `/parts/${B_ONLY_PART}/files`, `/files/${B_ONLY_FILE_ID}`]) {
            await assertRefused(server, path, tokenA);
        }
    });
});

test("no /parts response carries price, unit_price, content or details keys", async () => {
    await withServer(async (server) => {
        for (const token of [tokenA, tokenB]) {
            const text = JSON.stringify(await partsFor(server, '', token));
            for (const key of ['price', 'unit_price', 'content', 'details']) {
                assert.ok(!text.includes(`"${key}"`), key);
            }
        }
    });
});

test('/parts is 401 without a token and 403 for an admin token', async () => {
    await withServer(async (server) => {
        assert.strictEqual((await get(server, '/parts')).status, 401);
        assert.strictEqual((await get(server, '/parts', tokenAdmin)).status, 403);
    });
});
