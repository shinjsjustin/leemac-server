const { test, mock } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, adminToken: signAdmin, clientToken: signClient } = require('../helpers/session');

const fakeDb = {
    execute: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
    query: async (sql) => [/FROM auth_session/.test(sql) ? SESSION_HANDLER.rows : []],
};
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const review = require('../../src/lib/quoteRequestReview');
const jobLib = require('../../src/lib/quoteRequestJob');
const { QuoteRequestError } = require('../../src/lib/quoteRequests');
const { createQuoteRequestsAdminRouter } = require('../../src/routes/quoteRequestsAdmin');

const DB = { marker: 'db' };

async function withRouter(fn) {
    const app = express();
    app.use(express.json());
    app.use('/q', createQuoteRequestsAdminRouter({ db: DB }));
    const server = await start(app);
    const quiet = mock.method(console, 'error', () => {});
    try {
        await fn((method, path, body) => fetch(`${server.baseUrl}/q${path}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        }));
    } finally {
        quiet.mock.restore();
        mock.restoreAll();
        await server.close();
    }
}

test('GET / lists the inbox, passing the status filter, with no-store', async () => {
    await withRouter(async (req) => {
        const fn = mock.method(review, 'listInbox', async () => [{ id: 1 }]);
        const res = await req('GET', '/?status=in_review');
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), [{ id: 1 }]);
        assert.strictEqual(res.headers.get('cache-control'), 'no-store');
        assert.deepStrictEqual(fn.mock.calls[0].arguments, [DB, { status: 'in_review' }]);
        await req('GET', '/');
        assert.deepStrictEqual(fn.mock.calls[1].arguments, [DB, { status: undefined }]);
    });
});

test('GET / answers 400 for an unknown status without hitting the lib', async () => {
    await withRouter(async (req) => {
        const fn = mock.method(review, 'listInbox', async () => []);
        assert.strictEqual((await req('GET', '/?status=draft')).status, 400);
        assert.strictEqual(fn.mock.callCount(), 0);
    });
});

test('GET /:id, PUT /:id and GET /:id/check call the matching lib functions', async () => {
    await withRouter(async (req) => {
        const get = mock.method(review, 'getReview', async () => ({ id: 4 }));
        const save = mock.method(review, 'saveReview', async () => ({ saved: true }));
        const check = mock.method(review, 'checkMatches', async () => [{ line_id: 1 }]);
        assert.deepStrictEqual(await (await req('GET', '/4')).json(), { id: 4 });
        assert.deepStrictEqual(get.mock.calls[0].arguments, [DB, 4]);
        const put = await req('PUT', '/4', { name: 'x' });
        assert.deepStrictEqual(await put.json(), { saved: true });
        assert.deepStrictEqual(save.mock.calls[0].arguments, [DB, 4, { name: 'x' }]);
        assert.deepStrictEqual(await (await req('GET', '/4/check')).json(), [{ line_id: 1 }]);
        assert.deepStrictEqual(check.mock.calls[0].arguments, [DB, 4]);
    });
});

test('POST /:id/job answers 201 with the job id and number', async () => {
    await withRouter(async (req) => {
        const fn = mock.method(jobLib, 'createJobFromRequest', async () => ({ id: 9, job_number: 120 }));
        const res = await req('POST', '/4/job');
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(await res.json(), { id: 9, job_number: 120 });
        assert.deepStrictEqual(fn.mock.calls[0].arguments, [DB, 4]);
    });
});

test('null results answer 404', async () => {
    await withRouter(async (req) => {
        mock.method(review, 'getReview', async () => null);
        mock.method(review, 'saveReview', async () => null);
        mock.method(review, 'checkMatches', async () => null);
        mock.method(jobLib, 'createJobFromRequest', async () => null);
        mock.method(review, 'getRequestFile', async () => null);
        for (const [m, p] of [['GET', '/4'], ['PUT', '/4'], ['GET', '/4/check'], ['POST', '/4/job'], ['GET', '/4/files/2']]) {
            assert.strictEqual((await req(m, p, m === 'PUT' ? {} : undefined)).status, 404, `${m} ${p}`);
        }
    });
});

test('QuoteRequestError keeps its status and other errors give a generic 500', async () => {
    await withRouter(async (req) => {
        const fn = mock.method(jobLib, 'createJobFromRequest', async () => {
            throw new QuoteRequestError('Already has a job', 409);
        });
        const conflict = await req('POST', '/4/job');
        assert.strictEqual(conflict.status, 409);
        assert.deepStrictEqual(await conflict.json(), { error: 'Already has a job' });
        fn.mock.mockImplementation(async () => { throw new Error('secret SQL detail'); });
        const boom = await req('POST', '/4/job');
        assert.strictEqual(boom.status, 500);
        assert.deepStrictEqual(await boom.json(), { error: 'Internal Server Error' });
    });
});

test('non-numeric, zero and oversized ids answer 404 without calling the lib', async () => {
    await withRouter(async (req) => {
        const fn = mock.method(review, 'getReview', async () => ({}));
        for (const id of ['abc', '0', '01', '12345678901']) {
            assert.strictEqual((await req('GET', `/${id}`)).status, 404, id);
        }
        assert.strictEqual((await req('GET', '/4/files/x')).status, 404);
        assert.strictEqual(fn.mock.callCount(), 0);
    });
});

test('GET /:id/files/:fileId sends content with a sanitised inline disposition', async () => {
    await withRouter(async (req) => {
        const fn = mock.method(review, 'getRequestFile', async () => ({
            filename: 'a"b\\c\r\nd.pdf', mimetype: 'application/pdf', content: Buffer.from('PDFDATA'),
        }));
        const res = await req('GET', '/4/files/2');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
        assert.strictEqual(res.headers.get('content-disposition'), 'inline; filename="abcd.pdf"');
        assert.strictEqual(await res.text(), 'PDFDATA');
        assert.deepStrictEqual(fn.mock.calls[0].arguments, [DB, 4, 2]);
    });
});

test('file without a mimetype is sent as octet-stream', async () => {
    await withRouter(async (req) => {
        mock.method(review, 'getRequestFile', async () => ({ filename: 'f', mimetype: null, content: Buffer.from('x') }));
        const res = await req('GET', '/4/files/2');
        assert.strictEqual(res.headers.get('content-type'), 'application/octet-stream');
    });
});

test('through the app, level 2 is admitted and client and level 1 are refused', async () => {
    const server = await start(require('../../src/app'));
    const status = async (token) => (await fetch(`${server.baseUrl}/api/internal/quote-requests`, {
        headers: { Authorization: `Bearer ${token}` },
    })).status;
    const admin = (level) => signAdmin({ id: 7, email: 'a@x.com', name: 'A', access_level: level });
    try {
        assert.strictEqual(await status(signClient({ id: 1, username: 'u', name: 'n', company_id: 2 })), 403);
        assert.strictEqual(await status(admin(1)), 403);
        assert.strictEqual(await status(admin(2)), 200);
    } finally {
        await server.close();
    }
});
