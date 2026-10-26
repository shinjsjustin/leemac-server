const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');

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

const KNOWN_JOB_PART_IDS = [11, 12];

// Only the known job_part ids exist, so an unknown id fails the ownership SELECT.
function makeDb() {
    const calls = [];
    async function run(sql, params) {
        calls.push({ sql, params });
        if (/^SELECT id FROM job_part/.test(sql)) {
            return [KNOWN_JOB_PART_IDS.includes(params[0]) ? [{ id: params[0] }] : []];
        }
        return [{}];
    }
    return { execute: run, query: run, calls };
}

beforeEach(() => {
    db = makeDb();
});

async function post(access, body) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = { role: 'admin', access };
        next();
    });
    app.use('/job', require('../../src/routes/job'));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/job/updatejobparts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return { status: res.status, json: await res.json() };
    } finally {
        await server.close();
    }
}

const updates = () => db.calls.filter((c) => /^UPDATE job_part/.test(c.sql));

test('updatejobparts saves every part through updateJobPart', async () => {
    const res = await post(2, {
        jobId: 5,
        parts: [{ job_part_id: 11, quantity: 3 }, { job_part_id: 12, rev: 'B' }],
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.json, { saved: [11, 12], failed: [] });
    assert.strictEqual(updates().length, 2);
    assert.deepStrictEqual(updates()[0].params, [3, 11, 5]);
    assert.deepStrictEqual(updates()[1].params, ['B', 12, 5]);
});

test('updatejobparts reports a bad quantity and an unknown id but still saves the rest', async () => {
    const res = await post(2, {
        jobId: 5,
        parts: [
            { job_part_id: 11, quantity: 0 },
            { job_part_id: 99, quantity: 2 },
            { job_part_id: 12, quantity: 4 },
        ],
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.json, {
        saved: [12],
        failed: [
            { job_part_id: 11, error: 'Invalid quantity' },
            { job_part_id: 99, error: 'Job part not found' },
        ],
    });
    assert.strictEqual(updates().length, 1);
});

test('updatejobparts drops price for access 1', async () => {
    const res = await post(1, { jobId: 5, parts: [{ job_part_id: 11, price: 9, rev: 'A' }] });
    assert.deepStrictEqual(res.json, { saved: [11], failed: [] });
    assert.doesNotMatch(updates()[0].sql, /price/);
    assert.deepStrictEqual(updates()[0].params, ['A', 11, 5]);
});

test('updatejobparts keeps price for access 2', async () => {
    await post(2, { jobId: 5, parts: [{ job_part_id: 11, price: 9, rev: 'A' }] });
    assert.match(updates()[0].sql, /price = \?/);
    assert.deepStrictEqual(updates()[0].params, [9, 'A', 11, 5]);
});

test('updatejobparts records a non-JobPartError as a generic failure', async () => {
    const original = console.error;
    console.error = () => {};
    db.execute = async () => {
        throw new Error('db down');
    };
    try {
        const res = await post(2, { jobId: 5, parts: [{ job_part_id: 11, quantity: 1 }] });
        assert.deepStrictEqual(res.json, {
            saved: [],
            failed: [{ job_part_id: 11, error: 'Failed to update part' }],
        });
    } finally {
        console.error = original;
    }
});

for (const [name, body] of [
    ['missing jobId', { parts: [{ job_part_id: 11, quantity: 1 }] }],
    ['parts not an array', { jobId: 5, parts: 'x' }],
    ['empty parts', { jobId: 5, parts: [] }],
]) {
    test(`updatejobparts returns 400 and runs no SQL for ${name}`, async () => {
        const res = await post(2, body);
        assert.strictEqual(res.status, 400);
        assert.ok(res.json.error);
        assert.strictEqual(db.calls.length, 0);
    });
}
