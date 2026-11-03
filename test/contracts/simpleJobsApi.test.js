const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { adminToken, SESSION_HANDLER } = require('../helpers/session');

const JOB = { id: 5, po_number: null };
const db = {
    execute: async (sql) => {
        if (/FROM auth_session/.test(sql)) return [SESSION_HANDLER.rows];
        if (/COUNT\(\*\) AS total FROM job/.test(sql)) return [[{ total: 0 }]];
        if (/^\s*SELECT job\.id, job\.job_number/.test(sql)) return [[]];
        if (/^SELECT id, po_number FROM job/.test(sql)) return [[JOB]];
        if (/^UPDATE job SET/.test(sql)) return [{ affectedRows: 1 }];
        if (/^INSERT INTO note/.test(sql)) return [{ insertId: 9 }];
        throw new Error(`unexpected sql: ${sql}`);
    },
};
db.query = db.execute;
const dbPath = require.resolve('../../src/db/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const contracts = require('../../src/client/src/api/contracts/simpleJobsApi.json');
const isAuth = require('../../src/middleware/isAuth');
const { createSimpleJobsRouter } = require('../../src/routes/simpleJobs');
const { createNotesRouter } = require('../../src/routes/notes');

const ADMIN_LEVEL = 3;
const token = adminToken({ id: 7, email: 'a@x.com', name: 'A', access_level: ADMIN_LEVEL });

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use('/internal', isAuth);
    app.use('/internal/simple', createSimpleJobsRouter({ db }));
    app.use('/internal/notes', createNotesRouter({ db }));
    return app;
}

for (const [name, { method, path, body }] of Object.entries(contracts)) {
    test(`${name} ${method} ${path} answers 2xx`, async () => {
        const server = await start(makeApp());
        try {
            const res = await fetch(`${server.baseUrl}${path}`, {
                method,
                headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
                body: body ? JSON.stringify(body) : undefined,
            });
            assert.ok(res.status >= 200 && res.status < 300, `got ${res.status}`);
        } finally {
            await server.close();
        }
    });
}
