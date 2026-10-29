const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { SESSION_HANDLER, clientToken: signClientToken } = require('../helpers/session');

const fakeDb = {
    execute: async (sql) => {
        if (SESSION_HANDLER.match.test(sql)) return [SESSION_HANDLER.rows];
        const h = HANDLERS.find((x) => x.match.test(sql));
        return [h ? h.rows : []];
    },
};
fakeDb.query = fakeDb.execute;

const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const contracts = require('../../src/client/src/api/contracts/portalApi.json');
const portalRouter = require('../../src/routes/portal');

const clientToken = signClientToken({ id: 1, username: 'u', name: 'Pat', company_id: 5 });

const HANDLERS = [
    { match: /SELECT job\.id FROM job WHERE job\.id = \? AND job\.company_id/, rows: [{ id: 1 }] },
    { match: /SELECT jp\.part_id FROM job_part jp/, rows: [{ part_id: 1 }] },
    { match: /SELECT p\.id, p\.number, p\.description FROM part p WHERE p\.id = \?/, rows: [{ id: 1, number: 'P-1', description: 'bracket' }] },
    { match: /COUNT\(\*\)/, rows: [{ total: 0 }] },
    { match: /FROM job j\s+WHERE j\.id = \?/, rows: [{ id: 1, job_number: 'J1' }] },
    { match: /SELECT f\.id, f\.filename/, rows: [{ id: 1, filename: 'a.pdf', mimetype: 'application/pdf', size: 3, uploaded_at: null }] },
    {
        match: /SELECT f\.filename, f\.mimetype/,
        rows: [{ filename: 'a.pdf', mimetype: 'application/pdf', size: 3, content: Buffer.from('abc') }],
    },
];

async function send({ method, path, body }) {
    const app = express();
    app.use(express.json());
    app.use('/portal', portalRouter);
    const info = mock.method(console, 'info', () => {});
    const { baseUrl, close } = await start(app);
    try {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${clientToken}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        await res.arrayBuffer();
        return res.status;
    } finally {
        await close();
        info.mock.restore();
    }
}

for (const [name, value] of Object.entries(contracts)) {
    for (const entry of [].concat(value)) {
        test(`${name} ${entry.method} ${entry.path} answers 2xx`, async () => {
            const status = await send(entry);
            assert.ok(status >= 200 && status < 300, `got ${status}`);
        });
    }
}
