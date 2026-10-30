const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const crypto = require('node:crypto');
const { start } = require('../helpers/server');
const { adminToken, SESSION_HANDLER } = require('../helpers/session');

const dbPath = require.resolve('../../src/db/db.js');
const AGENT_TOKEN = 'agent-secret';
const tokenHash = crypto.createHash('sha256').update(AGENT_TOKEN).digest('hex');
const { events } = require('../../src/lib/printJobs');

let queued;
let jobs;
let resultCalls;
const db = {
    execute: async (sql, params) => {
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/FROM print_agent/.test(sql)) return [[{ id: 1, token_hash: tokenHash }]];
        if (/UPDATE print_agent/.test(sql)) return [{ affectedRows: 1 }];
        if (/^\s*UPDATE print_job SET status = 'sent'/.test(sql)) {
            return [{ affectedRows: queued.length ? 1 : 0 }];
        }
        if (/^\s*UPDATE print_job SET status = \?/.test(sql)) {
            resultCalls.push(params);
            const job = jobs[params[3]];
            return [{ affectedRows: job && job.status === 'sent' ? 1 : 0 }];
        }
        if (/^\s*UPDATE/.test(sql)) return [{ affectedRows: 0 }];
        if (/SELECT id FROM print_job WHERE status = 'queued'/.test(sql)) return [queued.map((j) => ({ id: j.id }))];
        if (/JOIN printer p/.test(sql)) {
            const job = queued.shift();
            return [[{ id: job.id, file_id: 9, kind: 'drawing', copies: 2, options: '{"sides":"two-sided"}', cups_queue: 'Brother_Q', filename: 'a.pdf' }]];
        }
        if (/FROM print_job j JOIN uploaded_files/.test(sql)) {
            const job = jobs[params[0]];
            return [job ? [job] : []];
        }
        throw new Error(`unexpected sql: ${sql}`);
    },
};
db.query = db.execute;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

beforeEach(() => {
    queued = [];
    jobs = {};
    resultCalls = [];
});

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    app.use('/api/print-agent', require('../../src/routes/printAgent').createPrintAgentRouter({ db }));
    const server = await start(app);
    try {
        return await fn(`${server.baseUrl}/api/print-agent`);
    } finally {
        await server.close();
    }
}

const auth = (token = AGENT_TOKEN) => ({ Authorization: `Bearer ${token}` });

test('every route returns 401 without a token, with a wrong token, or with an admin JWT', () =>
    withServer(async (base) => {
        const bad = [{}, auth('nope'), auth(adminToken({ id: 1, email: 'a@x.com', name: 'A', access_level: 3 }))];
        for (const headers of bad) {
            for (const [method, path] of [['GET', '/next'], ['GET', '/jobs/1/file'], ['POST', '/jobs/1/result']]) {
                const res = await fetch(base + path, { method, headers: { ...headers, 'Content-Type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
                assert.strictEqual(res.status, 401, `${method} ${path}`);
            }
        }
    }));

test('next returns 200 with the claimed job and its file url', () =>
    withServer(async (base) => {
        queued.push({ id: 5 });
        const res = await fetch(`${base}/next`, { headers: auth() });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), {
            job: { id: 5, file_url: '/api/print-agent/jobs/5/file', cups_queue: 'Brother_Q', copies: 2, options: { sides: 'two-sided' } },
        });
    }));

test('next returns 204 when nothing is queued and wait is 0', () =>
    withServer(async (base) => {
        const res = await fetch(`${base}/next`, { headers: auth() });
        assert.strictEqual(res.status, 204);
    }));

test('next waits for a job enqueued during the wait and returns it', () =>
    withServer(async (base) => {
        const pending = fetch(`${base}/next?wait=5`, { headers: auth() });
        setTimeout(() => { queued.push({ id: 8 }); events.emit('job', 8); }, 50);
        const res = await pending;
        assert.strictEqual(res.status, 200);
        assert.strictEqual((await res.json()).job.id, 8);
    }));

test('next waits the requested time before returning 204', () =>
    withServer(async (base) => {
        const started = Date.now();
        const res = await fetch(`${base}/next?wait=0.3`, { headers: auth() });
        assert.strictEqual(res.status, 204);
        assert.ok(Date.now() - started >= 250);
    }));

test('next caps wait at 25 seconds', () =>
    withServer(async (base) => {
        const realSetTimeout = global.setTimeout;
        const delays = [];
        global.setTimeout = (fn, ms, ...rest) => { delays.push(ms); return realSetTimeout(fn, ms === 25000 ? 0 : ms, ...rest); };
        try {
            const res = await fetch(`${base}/next?wait=999`, { headers: auth() });
            assert.strictEqual(res.status, 204);
        } finally {
            global.setTimeout = realSetTimeout;
        }
        assert.ok(delays.includes(25000));
        assert.ok(!delays.some((d) => d > 25000));
    }));

test('file streams the pdf only while the job is sent', () =>
    withServer(async (base) => {
        jobs[3] = { id: 3, status: 'sent', mimetype: 'application/pdf', filename: 'a.pdf', content: Buffer.from('%PDF-1') };
        const ok = await fetch(`${base}/jobs/3/file`, { headers: auth() });
        assert.strictEqual(ok.status, 200);
        assert.strictEqual(ok.headers.get('content-type'), 'application/pdf');
        assert.strictEqual(Buffer.from(await ok.arrayBuffer()).toString(), '%PDF-1');

        for (const status of ['queued', 'printed', 'failed', 'expired']) {
            jobs[4] = { ...jobs[3], id: 4, status };
            assert.strictEqual((await fetch(`${base}/jobs/4/file`, { headers: auth() })).status, 409, status);
        }
        assert.strictEqual((await fetch(`${base}/jobs/99/file`, { headers: auth() })).status, 404);
    }));

async function postResult(base, id, body) {
    return fetch(`${base}/jobs/${id}/result`, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

test('result records printed and failed with lp job id and error', () =>
    withServer(async (base) => {
        jobs[3] = { id: 3, status: 'sent' };
        assert.strictEqual((await postResult(base, 3, { status: 'printed', lp_job_id: 'q-12' })).status, 200);
        assert.deepStrictEqual(resultCalls[0], ['printed', 'q-12', null, 3]);
        assert.strictEqual((await postResult(base, 3, { status: 'failed', error: 'out of paper' })).status, 200);
        assert.deepStrictEqual(resultCalls[1], ['failed', null, 'out of paper', 3]);
    }));

test('result rejects other statuses with 400 without writing', () =>
    withServer(async (base) => {
        jobs[3] = { id: 3, status: 'sent' };
        for (const status of ['queued', 'sent', 'expired', '', undefined]) {
            assert.strictEqual((await postResult(base, 3, { status })).status, 400, String(status));
        }
        assert.strictEqual(resultCalls.length, 0);
    }));

test('result returns 409 when the job is not in sent', () =>
    withServer(async (base) => {
        jobs[3] = { id: 3, status: 'printed' };
        assert.strictEqual((await postResult(base, 3, { status: 'printed' })).status, 409);
    }));

test('src/app mounts the router outside isAuth', async () => {
    const server = await start(require('../../src/app'));
    try {
        assert.strictEqual((await fetch(`${server.baseUrl}/api/print-agent/next`)).status, 401);
        assert.strictEqual((await fetch(`${server.baseUrl}/api/print-agent/next`, { headers: auth() })).status, 204);
    } finally {
        await server.close();
    }
});
