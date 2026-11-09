const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeQcDb } = require('../helpers/qcSqliteDb');
const { createQcAdminRouter } = require('../../src/routes/qcAdmin');

const PHOTO = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const POINT = { file_id: 1, page: 1, kind: 'point', x1: 0.5, y1: 0.5, size: 10, note: 'hole' };

// Part 1 has drawing 1, jobs 1 (older) and 2 (newer) for company 10. Marking 1 is Leemac's, 2 is a client's.
function seed() {
    const db = makeQcDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name) VALUES (10, 'Acme');
        INSERT INTO job (id, company_id, job_number, created_at) VALUES (1, 10, 'J-1', '2026-01-01'), (2, 10, 'J-2', '2026-02-01');
        INSERT INTO part (id, number) VALUES (1, 'P-1');
        INSERT INTO job_part (job_id, part_id, quantity) VALUES (1, 1, 5), (2, 1, 7);
        INSERT INTO uploaded_files (id, filename, part_id) VALUES (1, 'a.pdf', 1);
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, size, author_id, author_name, created_at, updated_at)
            VALUES (1, 1, 1, 1, NULL, 'point', 0.1, 0.1, 5, '9', 'Leemac', 'now', 'now'),
                   (2, 1, 1, 1, 10, 'point', 0.2, 0.2, 5, '1', 'Alice', 'now', 'now');
        INSERT INTO qc_ping (id, part_id, company_id, pinged_by_name, pinged_at, ping_count) VALUES (1, 1, 10, 'Alice', '2999-01-01', 1);
    `);
    db.sqlite.exec(`
        CREATE TABLE admin (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
        INSERT INTO admin (id, name, email) VALUES (7, 'Ad Min', 'ad@leemac.test'), (8, NULL, 'noname@leemac.test');
    `);
    const add = db.sqlite.prepare(
        "INSERT INTO qc_photo (id, marking_id, job_id, position, value, mimetype, size, content) VALUES (?, 1, 2, ?, '5.01', 'image/jpeg', ?, ?)"
    );
    add.run(1, 1, PHOTO.length, PHOTO);
    add.run(2, 2, PHOTO.length, PHOTO);
    return db;
}

async function mounted(access, fn, role = 'admin', user = { id: 7, email: 'ad@leemac.test' }) {
    const db = seed();
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.user = { ...user, role, access_level: access, access }; next(); });
    app.use('/qc', createQcAdminRouter({ db }));
    const server = await start(app);
    const call = (method, path, body) => fetch(`${server.baseUrl}/qc${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    try {
        await fn(call, db, server.baseUrl);
    } finally {
        await server.close();
    }
}

function photoForm(bytes = PHOTO, fields = { job_id: '2', value: '5.02', caption: 'cap' }) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'p.jpg');
    return form;
}

const WRITES = [
    ['POST', '/parts/1/markings', POINT],
    ['DELETE', '/parts/1/markings'],
    ['PUT', '/markings/1', POINT],
    ['DELETE', '/markings/1'],
    ['PUT', '/markings/1/photos/order', { job_id: 2, ids: [2, 1] }],
    ['PUT', '/photos/1', { value: '1', caption: 'c' }],
    ['DELETE', '/photos/1'],
    ['PUT', '/requests/1/dismiss'],
];
const READS = ['/parts/1', '/photos/1', '/requests'];

test('access 2 gets 403 on every write and 200 on every read', async () => {
    await mounted(2, async (call, db, base) => {
        for (const [method, path, body] of WRITES) {
            assert.equal((await call(method, path, body)).status, 403, `${method} ${path}`);
        }
        const up = await fetch(`${base}/qc/markings/1/photos`, { method: 'POST', body: photoForm() });
        assert.equal(up.status, 403);
        assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM qc_marking').get().n, 2);
        assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM qc_photo').get().n, 2);
        for (const path of READS) assert.equal((await call('GET', path)).status, 200, path);
    });
});

test('access 1 gets 403 on every write and every read', async () => {
    await mounted(1, async (call, db, base) => {
        for (const [method, path, body] of WRITES) {
            assert.equal((await call(method, path, body)).status, 403, `${method} ${path}`);
        }
        const up = await fetch(`${base}/qc/markings/1/photos`, { method: 'POST', body: photoForm() });
        assert.equal(up.status, 403);
        for (const path of READS) assert.equal((await call('GET', path)).status, 403, path);
    });
});

test('GET /parts/:id returns markings, pings, photos per job and jobs newest first', async () => {
    await mounted(2, async (call) => {
        const body = await (await call('GET', '/parts/1')).json();
        assert.deepEqual(body.markings.map((m) => m.id), [1, 2]);
        assert.equal(body.pings.length, 1);
        assert.equal(body.photos.length, 1);
        assert.equal(body.photos[0].job_id, 2);
        assert.deepEqual(body.photos[0].photos.map((p) => p.id), [1, 2]);
        assert.deepEqual(body.jobs.map((j) => j.id), [2, 1]);
    });
});

test('level 3 adds, edits, deletes and clears Leemac markings', async () => {
    await mounted(3, async (call, db) => {
        const created = await call('POST', '/parts/1/markings', POINT);
        assert.equal(created.status, 201);
        const { id } = await created.json();
        const marking = db.sqlite.prepare('SELECT company_id, author_id, author_name FROM qc_marking WHERE id = ?').get(id);
        assert.equal(marking.company_id, null);
        assert.equal(marking.author_id, '7');
        assert.equal(marking.author_name, 'Ad Min');
        assert.equal((await call('PUT', `/markings/${id}`, { ...POINT, note: 'new' })).status, 200);
        assert.equal(db.sqlite.prepare('SELECT note FROM qc_marking WHERE id = ?').get(id).note, 'new');
        assert.equal((await call('DELETE', `/markings/${id}`)).status, 200);
        assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM qc_marking WHERE id = ?').get(id).n, 0);
        assert.equal((await call('DELETE', '/parts/1/markings')).status, 200);
        assert.deepEqual(db.sqlite.prepare('SELECT id FROM qc_marking').all().map((r) => r.id), [2]);
    });
});

test('changing a client marking is 403', async () => {
    await mounted(3, async (call, db) => {
        assert.equal((await call('PUT', '/markings/2', { ...POINT, note: 'x' })).status, 403);
        assert.equal((await call('DELETE', '/markings/2')).status, 403);
        assert.equal(db.sqlite.prepare('SELECT note FROM qc_marking WHERE id = 2').get().note, null);
    });
});

test('invalid ids and bodies are 404 and 400', async () => {
    await mounted(3, async (call) => {
        assert.equal((await call('GET', '/parts/abc')).status, 404);
        assert.equal((await call('PUT', '/markings/999', POINT)).status, 404);
        assert.equal((await call('POST', '/parts/1/markings', { kind: 'blob' })).status, 400);
    });
});

test('level 3 uploads, edits, reorders and deletes photos', async () => {
    await mounted(3, async (call, db, base) => {
        const up = await fetch(`${base}/qc/markings/1/photos`, { method: 'POST', body: photoForm() });
        assert.equal(up.status, 201);
        const { id } = await up.json();
        const row = db.sqlite.prepare('SELECT * FROM qc_photo WHERE id = ?').get(id);
        assert.equal(row.value, '5.02');
        assert.equal(row.caption, 'cap');
        assert.equal(row.job_id, 2);
        assert.equal(row.position, 3);
        assert.equal(row.uploaded_by_name, 'Ad Min');
        assert.equal(Buffer.compare(Buffer.from(row.content), PHOTO), 0);

        assert.equal((await call('PUT', `/photos/${id}`, { value: '9', caption: 'z' })).status, 200);
        assert.equal(db.sqlite.prepare('SELECT value FROM qc_photo WHERE id = ?').get(id).value, '9');

        assert.equal((await call('PUT', '/markings/1/photos/order', { job_id: 2, ids: [id, 2, 1] })).status, 200);
        assert.equal(db.sqlite.prepare('SELECT position FROM qc_photo WHERE id = ?').get(id).position, 1);
        assert.equal((await call('PUT', '/markings/1/photos/order', { job_id: 2, ids: [1] })).status, 400);

        assert.equal((await call('DELETE', `/photos/${id}`)).status, 200);
        assert.equal((await call('DELETE', `/photos/${id}`)).status, 404);
    });
});

test('a photo over 3 MB is a 413 JSON error and stores nothing', async () => {
    await mounted(3, async (call, db, base) => {
        const big = Buffer.alloc(3 * 1024 * 1024 + 1024, 1);
        const res = await fetch(`${base}/qc/markings/1/photos`, { method: 'POST', body: photoForm(big) });
        assert.equal(res.status, 413);
        assert.match(res.headers.get('content-type'), /json/);
        assert.ok((await res.json()).error);
        assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM qc_photo').get().n, 2);
    });
});

test('GET /photos/:id returns the stored bytes with the stored mimetype', async () => {
    await mounted(2, async (call) => {
        const res = await call('GET', '/photos/1');
        assert.equal(res.headers.get('content-type'), 'image/jpeg');
        assert.equal(Buffer.compare(Buffer.from(await res.arrayBuffer()), PHOTO), 0);
        assert.equal((await call('GET', '/photos/99')).status, 404);
    });
});

test('GET /requests lists the open ping and PUT dismiss closes it', async () => {
    await mounted(3, async (call) => {
        const before = await (await call('GET', '/requests')).json();
        assert.equal(before.length, 1);
        assert.equal(before[0].status, 'open');
        assert.equal((await call('PUT', '/requests/1/dismiss')).status, 200);
        const after = await (await call('GET', '/requests')).json();
        assert.equal(after[0].status, 'dismissed');
        assert.equal((await call('PUT', '/requests/99/dismiss')).status, 404);
    });
});

test('an admin row without a name stores the token email as author and uploader', async () => {
    const noName = { id: 8, email: 'noname@leemac.test' };
    await mounted(3, async (call, db, base) => {
        const { id } = await (await call('POST', '/parts/1/markings', POINT)).json();
        assert.equal(db.sqlite.prepare('SELECT author_name FROM qc_marking WHERE id = ?').get(id).author_name, 'noname@leemac.test');
        const up = await fetch(`${base}/qc/markings/1/photos`, { method: 'POST', body: photoForm() });
        const photo = db.sqlite.prepare('SELECT uploaded_by_name FROM qc_photo WHERE id = ?').get((await up.json()).id);
        assert.equal(photo.uploaded_by_name, 'noname@leemac.test');
    }, 'admin', noName);
});
