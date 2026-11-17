const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShareDb } = require('../helpers/shareSqliteDb');
const { createShareLinksAdminRouter } = require('../../src/routes/shareLinksAdmin');

// Job 12 (company 10) has a saved quote; job 13 has none. Part 1 belongs to company 10 through job 12.
function seed() {
    const db = makeShareDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme'), (11, 'Other');
        INSERT INTO job (id, company_id, job_number, created_at) VALUES (12, 10, 'J-12', '2026-01-01'), (13, 10, 'J-13', '2026-01-02');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (12, 1, 5);
        INSERT INTO job_document (job_id, type, fields, parts, saved_at) VALUES (12, 'quote', '{}', '[]', '2026-01-01');
        CREATE TABLE admin (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
        INSERT INTO admin (id, name, email) VALUES (7, 'Ad Min', 'ad@leemac.test');
    `);
    return db;
}

async function mounted(access, fn) {
    const db = seed();
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = { id: 7, email: 'ad@leemac.test', role: 'admin', access_level: access, access };
        next();
    });
    app.use('/share-links', createShareLinksAdminRouter({ db }));
    const server = await start(app);
    const call = async (method, path, body) => {
        const res = await fetch(`${server.baseUrl}/share-links${path}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        return { res, json: await res.json() };
    };
    try {
        await fn(call, db);
    } finally {
        await server.close();
    }
}

const QUOTE = { type: 'quote', target_id: 12 };
const QC = { type: 'qc', target_id: 1, company_id: 10 };

test('access 1 is refused on GET; access 2 reads null when no link exists', async () => {
    await mounted(1, async (call) => {
        assert.equal((await call('GET', '/?type=quote&target_id=12')).res.status, 403);
    });
    await mounted(2, async (call) => {
        const { res, json } = await call('GET', '/?type=quote&target_id=12');
        assert.equal(res.status, 200);
        assert.deepEqual(json, { link: null });
    });
});

test('access 2 gets 403 on create and turn-off', async () => {
    await mounted(2, async (call) => {
        assert.equal((await call('POST', '/', QUOTE)).res.status, 403);
        assert.equal((await call('POST', '/1/turn-off')).res.status, 403);
    });
});

test('access 3 creates a quote link, reuses it, and GET returns the same fields', async () => {
    await mounted(3, async (call) => {
        const first = await call('POST', '/', QUOTE);
        assert.equal(first.res.status, 200);
        assert.equal(first.res.headers.get('cache-control'), 'no-store');
        const { link } = first.json;
        assert.match(link.token, /^[A-Za-z0-9_-]{43}$/);
        assert.deepEqual(Object.keys(link).sort(), ['expires_at', 'id', 'last_opened_at', 'open_count', 'token']);
        assert.equal(link.open_count, 0);

        const again = await call('POST', '/', QUOTE);
        assert.deepEqual(again.json, first.json);
        const read = await call('GET', '/?type=quote&target_id=12');
        assert.deepEqual(read.json, first.json);
    });
});

test('access 3 creates a qc link per company and reads it back with company_id', async () => {
    await mounted(3, async (call) => {
        const created = await call('POST', '/', QC);
        assert.equal(created.res.status, 200);
        const read = await call('GET', '/?type=qc&target_id=1&company_id=10');
        assert.deepEqual(read.json, created.json);
        const wrongCompany = await call('GET', '/?type=qc&target_id=1&company_id=11');
        assert.deepEqual(wrongCompany.json, { link: null });
    });
});

test('turn-off at 3 removes the link; a new POST makes a different one', async () => {
    await mounted(3, async (call) => {
        const { json: { link } } = await call('POST', '/', QUOTE);
        const off = await call('POST', `/${link.id}/turn-off`);
        assert.equal(off.res.status, 200);
        assert.deepEqual((await call('GET', '/?type=quote&target_id=12')).json, { link: null });
        const fresh = await call('POST', '/', QUOTE);
        assert.notEqual(fresh.json.link.token, link.token);
    });
});

test('bad input gives 400 or 404 JSON, never 500, with no-store', async () => {
    await mounted(3, async (call) => {
        const cases = [
            ['POST', '/', { type: 'nope', target_id: 12 }, 400],
            ['POST', '/', { type: 'quote', target_id: '12' }, 400],
            ['POST', '/', { type: 'quote', target_id: -1 }, 400],
            ['POST', '/', {}, 400],
            ['POST', '/', { type: 'quote', target_id: 13 }, 409],
            ['POST', '/', { type: 'qc', target_id: 1, company_id: 11 }, 400],
            ['POST', '/', { type: 'qc', target_id: 1 }, 400],
            ['GET', '/?type=quote&target_id=abc', undefined, 400],
            ['GET', '/?type=qc&target_id=1', undefined, 400],
            ['GET', '/?type=zzz&target_id=1', undefined, 400],
            ['GET', '/', undefined, 400],
            ['POST', '/abc/turn-off', undefined, 404],
            ['POST', '/999/turn-off', undefined, 404],
        ];
        for (const [method, path, body, status] of cases) {
            const { res, json } = await call(method, path, body);
            assert.equal(res.status, status, `${method} ${path} ${JSON.stringify(body)}`);
            assert.equal(typeof json.error, 'string');
            assert.equal(res.headers.get('cache-control'), 'no-store');
        }
    });
});
