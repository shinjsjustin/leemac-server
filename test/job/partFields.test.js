const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const dbPath = require.resolve('../../src/db/db.js');
let db;
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        execute: (...a) => db.execute(...a),
        query: (...a) => db.query(...a),
    },
};

const JOB_SUMMARY_ROW = { company_id: 1 };

beforeEach(() => {
    db = makeFakeDb([{ match: /FROM job\s+JOIN company/, rows: [JOB_SUMMARY_ROW] }]);
});

async function withServer(fn) {
    const app = express();
    app.use(express.json());
    app.use('/job', require('../../src/routes/job'));
    const server = await start(app);
    try {
        return await fn((method, path, body) =>
            fetch(`${server.baseUrl}/job/${path}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body && JSON.stringify(body),
            })
        );
    } finally {
        await server.close();
    }
}

test('jobpartjoin stores cents price and trimmed part fields', async () => {
    await withServer(async (call) => {
        const res = await call('POST', 'jobpartjoin', {
            jobId: 1, partId: 2, quantity: 3, price: '12.50', rev: 'A', details: 'd',
            material: ' 6061 ', finish: 'anodize', stock_size: '1x2',
        });
        assert.strictEqual(res.status, 201);
    });
    assert.strictEqual(db.calls.length, 1);
    assert.match(db.calls[0].sql, /INSERT INTO job_part \(job_id, part_id, quantity, price, rev, details, material, finish, stock_size\)/);
    assert.deepStrictEqual(db.calls[0].params, [1, 2, 3, 12.5, 'A', 'd', '6061', 'anodize', '1x2']);
});

test('jobpartjoin uses null for missing or empty part fields', async () => {
    await withServer((call) =>
        call('POST', 'jobpartjoin', {
            jobId: 1, partId: 2, quantity: 3, price: 5, rev: 'A', details: 'd', finish: '  ',
        })
    );
    assert.deepStrictEqual(db.calls[0].params, [1, 2, 3, 5, 'A', 'd', null, null, null]);
});

test('jobpartjoin returns 400 and runs no query for an invalid price', async () => {
    await withServer(async (call) => {
        const res = await call('POST', 'jobpartjoin', { jobId: 1, partId: 2, quantity: 3, price: 'abc' });
        assert.strictEqual(res.status, 400);
        assert.ok((await res.json()).error);
    });
    assert.strictEqual(db.calls.length, 0);
});

test('updatejobpartjoin from an old client updates only the original columns', async () => {
    await withServer(async (call) => {
        const res = await call('POST', 'updatejobpartjoin', {
            jobId: 1, partId: 2, quantity: 3, price: 4, rev: 'A', details: 'd',
        });
        assert.strictEqual(res.status, 200);
    });
    assert.strictEqual(
        db.calls[0].sql.replace(/\s+/g, ' '),
        'UPDATE job_part SET quantity = ?, price = ?, rev = ?, details = ?, note = ? WHERE job_id = ? AND part_id = ?'
    );
    assert.deepStrictEqual(db.calls[0].params, [3, 4, 'A', 'd', null, 1, 2]);
});

test('updatejobpartjoin sets only the part fields present in the body', async () => {
    await withServer((call) =>
        call('POST', 'updatejobpartjoin', {
            jobId: 1, partId: 2, quantity: 3, price: '7.256', rev: 'A', details: 'd',
            material: ' steel ', stock_size: '',
        })
    );
    const { sql, params } = db.calls[0];
    assert.match(sql, /note = \?, material = \?, stock_size = \? WHERE/);
    assert.doesNotMatch(sql, /finish/);
    assert.deepStrictEqual(params, [3, 7.26, 'A', 'd', null, 'steel', null, 1, 2]);
});

test('updatejobpartjoin returns 400 and runs no query for an invalid price', async () => {
    await withServer(async (call) => {
        const res = await call('POST', 'updatejobpartjoin', { jobId: 1, partId: 2, quantity: 3, price: -1 });
        assert.strictEqual(res.status, 400);
    });
    assert.strictEqual(db.calls.length, 0);
});

test('jobsummary selects material, finish and stock_size for each part', async () => {
    await withServer(async (call) => {
        const res = await call('GET', 'jobsummary?id=9');
        assert.strictEqual(res.status, 200);
    });
    const partsSql = db.calls[1].sql;
    for (const col of ['material', 'finish', 'stock_size']) {
        assert.match(partsSql, new RegExp(`job_part\\.${col}`));
    }
});
