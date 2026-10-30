const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');

const dbPath = require.resolve('../../src/db/db.js');
const fakeDb = { execute: async () => [[]] };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const { createJobDocumentsRouter } = require('../../src/routes/job/documents');
const contracts = require('../../src/client/src/api/contracts/jobDocumentsApi.json');

const ADMIN_LEVEL = 3;
const router = createJobDocumentsRouter({
    db: fakeDb,
    makeDocument: async (db, id, type) => ({ id: 80, job_id: id, type }),
    latestDocuments: async () => [],
    getDocument: async (db, id, type) => ({ job_id: id, type, fields: {}, parts: [] }),
    refillDocument: async (db, id, type) => ({ job_id: id, type, fields: {}, parts: [] }),
    saveDocument: async (db, id, type, body) => ({ job_id: id, type, ...body }),
});

for (const [name, { method, path, body }] of Object.entries(contracts)) {
    test(`${name} ${method} ${path} answers 2xx`, async () => {
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => { req.user = { role: 'admin', access: ADMIN_LEVEL }; next(); });
        app.use('/internal/job', router);
        const server = await start(app);
        try {
            const res = await fetch(`${server.baseUrl}${path}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            assert.ok(res.status >= 200 && res.status < 300, `got ${res.status}`);
        } finally {
            await server.close();
        }
    });
}
