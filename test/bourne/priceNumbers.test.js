const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { start } = require('../helpers/server');
const { makeFakeDb } = require('../helpers/fakeDb');

const KEY = process.env.BOURNE_READ_KEY;

const JOB = { id: 3, job_number: '103', client: 'Acme', created_at: '2026-01-01T00:00:00Z' };
const PART_ROWS = [
    { job_part_id: 10, part_id: 100, job_id: 3, number: 'P-100', description: 'Bracket', quantity: 5, price: '12.50', star_status: 'done' },
    { job_part_id: 11, part_id: 101, job_id: 3, number: 'P-101', description: 'Plate', quantity: 1, price: null, star_status: 'new' },
];

async function get(db, path) {
    const { createBourneRouter } = require('../../src/routes/bourne');
    const app = express();
    app.use('/api/bourne', createBourneRouter({ db }));
    const server = await start(app);
    try {
        const res = await fetch(`${server.baseUrl}/api/bourne${path}`, { headers: { 'X-Bourne-Key': KEY } });
        return await res.json();
    } finally { await server.close(); }
}

test('/jobs/:id returns prices as numbers and keeps null', async () => {
    const db = makeFakeDb([
        { match: /FROM job j/, rows: [JOB] },
        { match: /FROM job_part/, rows: PART_ROWS },
    ]);
    const body = await get(db, '/jobs/3');
    assert.deepStrictEqual(body.job.parts.map((p) => p.price), [12.5, null]);
});

test('/starred returns prices as numbers and keeps null', async () => {
    const db = makeFakeDb([{ match: /FROM stars/, rows: PART_ROWS }]);
    const body = await get(db, '/starred');
    assert.deepStrictEqual(body.jobs[0].parts.map((p) => p.price), [12.5, null]);
});

test('/parts/:id returns prices as numbers and keeps null', async () => {
    const db = makeFakeDb([
        { match: /FROM part p/, rows: [{ id: 100, number: 'P-100', description: 'Bracket' }] },
        { match: /FROM job_part/, rows: PART_ROWS },
    ]);
    const body = await get(db, '/parts/100');
    assert.deepStrictEqual(body.part.jobs.map((j) => j.price), [12.5, null]);
});
