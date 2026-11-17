const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('../helpers/server');
const { makeShareDb } = require('../helpers/shareSqliteDb');
const links = require('../../src/lib/shareLinks');
const { createShareRouter } = require('../../src/routes/shareLinksPublic');

const boss = { id: 7, name: 'Boss' };
const UNKNOWN = 'x'.repeat(43);

// Same shape as test/lib/shareLinks.test.js: part 1 is Acme's (job 1) and Beta's (job 2), part 2 is Beta's only.
// Job 1 holds the saved quote (file 5); file 1 has a Leemac and an Acme marking, file 2 only a Beta one.
function seed() {
    const db = makeShareDb();
    db.sqlite.exec(`
        INSERT INTO company (id, name, code) VALUES (10, 'Acme', 'AC'), (20, 'Beta', 'BE');
        INSERT INTO part (id, number, description) VALUES (1, 'P-1', 'Bracket'), (2, 'P-2', 'Plate');
        INSERT INTO job (id, company_id, job_number, po_number) VALUES (1, 10, 'J1', 'PO-1'), (2, 20, 'J2', 'PO-2');
        INSERT INTO job_part (job_id, part_id, quantity, details) VALUES (1, 1, 5, ''), (2, 1, 9, ''), (2, 2, 1, '');
        INSERT INTO uploaded_files (id, filename, mimetype, content, part_id, job_id, note_id, uploaded_at) VALUES
            (1, 'a.pdf', 'application/pdf', x'0102', 1, NULL, NULL, '2026-01-01 00:00:00'),
            (2, 'b.pdf', 'application/pdf', x'0304', 1, NULL, NULL, '2026-01-01 00:00:00'),
            (3, 'c.pdf', 'application/pdf', x'0506', 2, NULL, NULL, '2026-01-01 00:00:00'),
            (4, 'job.pdf', 'application/pdf', x'0708', 1, 1, NULL, '2026-01-01 00:00:00'),
            (5, 'Quote-J1-20260101-000000-site.pdf', 'application/pdf', x'0910', NULL, 1, NULL, '2026-01-01 00:00:00'),
            (6, 'Quote-J2-20260101-000000-site.pdf', 'application/pdf', x'1314', NULL, 2, NULL, '2026-01-01 00:00:00');
        INSERT INTO job_document (job_id, type, fields, parts, file_id, saved_by_name, saved_at) VALUES
            (1, 'quote', '{"leadtime":"2 weeks"}', '[{"number":"P-1","price":12}]', 5, 'Boss', '2026-01-01 00:00:00'),
            (2, 'quote', '{"leadtime":"9 weeks"}', '[{"number":"P-1","price":99}]', 6, 'Boss', '2026-01-01 00:00:00');
        INSERT INTO qc_marking (id, part_id, file_id, page, company_id, kind, x1, y1, note, author_id, author_name, created_at, updated_at)
        VALUES
            (1, 1, 1, 1, NULL, 'point', 0.1, 0.2, 'leemac note', '7', 'Boss', '2026-01-01', '2026-01-01'),
            (2, 1, 1, 1, 10, 'point', 0.3, 0.4, 'acme note', '9', 'Acme Guy', '2026-01-01', '2026-01-01'),
            (3, 1, 2, 1, 20, 'point', 0.5, 0.6, 'beta note', '9', 'Beta Guy', '2026-01-01', '2026-01-01');
        INSERT INTO qc_photo (id, marking_id, job_id, position, value, caption, mimetype, size, content) VALUES
            (1, 1, 1, 1, '5.01', 'acme shot', 'image/png', 2, x'aa'),
            (2, 1, 2, 1, '5.02', 'beta shot', 'image/png', 2, x'bb');
    `);
    return db;
}

async function withApp(db, fn) {
    const app = express();
    app.use(express.json());
    app.use('/api/share', createShareRouter({ db }));
    const server = await start(app);
    const post = (path, body) => fetch(`${server.baseUrl}/api/share${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    try {
        await fn(post);
    } finally {
        await server.close();
    }
}

async function assertNotFound(res) {
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Not found' });
}

const quoteLink = (db, jobId = 1) => links.createLink(db, boss, { type: 'quote', target_id: jobId });
const qcLink = (db, companyId = 10) => links.createLink(db, boss, { type: 'qc', target_id: 1, company_id: companyId });

test('POST /quote returns only its own job quote, no login, with no-store and nosniff', async () => {
    const db = seed();
    const { token } = await quoteLink(db, 1);
    await withApp(db, async (post) => {
        const res = await post('/quote', { token });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        const body = await res.json();
        assert.equal(body.company_name, 'Acme');
        assert.deepEqual(body.fields, { leadtime: '2 weeks' });
        assert.deepEqual(body.parts, [{ number: 'P-1', price: 12 }]);
    });
});

test('a quote token for job 2 returns job 2 data, not job 1', async () => {
    const db = seed();
    const { token } = await quoteLink(db, 2);
    await withApp(db, async (post) => {
        const body = await (await post('/quote', { token })).json();
        assert.equal(body.company_name, 'Beta');
        assert.deepEqual(body.fields, { leadtime: '9 weeks' });
    });
});

test('POST /quote/pdf streams its own quote file with the stored mimetype', async () => {
    const db = seed();
    const { token } = await quoteLink(db, 1);
    await withApp(db, async (post) => {
        const res = await post('/quote/pdf', { token });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'application/pdf');
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from('0910', 'hex'));
    });
});

test('POST /qc returns Leemac markings and only the linked company photos', async () => {
    const db = seed();
    const { token } = await qcLink(db, 10);
    await withApp(db, async (post) => {
        const res = await post('/qc', { token });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        const body = await res.json();
        assert.deepEqual(body.markings.map((m) => m.note), ['leemac note']);
        assert.deepEqual(body.photos.map((p) => p.id), [1]);
        assert.ok(!JSON.stringify(body).includes('acme note'));
        assert.ok(!JSON.stringify(body).includes('beta'));
    });
});

test('POST /qc is 404, not 500, and counts no open when the company lost the part', async () => {
    const db = seed();
    const { token } = await qcLink(db, 10);
    db.sqlite.exec('DELETE FROM job_part WHERE job_id = 1 AND part_id = 1');
    await withApp(db, async (post) => {
        await assertNotFound(await post('/qc', { token }));
    });
    assert.equal(db.sqlite.prepare('SELECT open_count FROM share_link').get().open_count, 0);
});

test('POST /qc/drawing serves a Leemac-marked drawing and 404s every other file', async () => {
    const db = seed();
    const { token } = await qcLink(db, 10);
    await withApp(db, async (post) => {
        const res = await post('/qc/drawing', { token, file_id: 1 });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'application/pdf');
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from('0102', 'hex'));
        for (const fileId of [2, 3, 4, 5, 99]) {
            await assertNotFound(await post('/qc/drawing', { token, file_id: fileId }));
        }
    });
});

test('POST /qc/photo serves its company photo and 404s another company photo', async () => {
    const db = seed();
    const { token } = await qcLink(db, 10);
    await withApp(db, async (post) => {
        const res = await post('/qc/photo', { token, photo_id: 1 });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('content-type'), 'image/png');
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from('aa', 'hex'));
        await assertNotFound(await post('/qc/photo', { token, photo_id: 2 }));
    });
});

test('a token of the other type gets 404 on every route', async () => {
    const db = seed();
    const quote = (await quoteLink(db)).token;
    const qc = (await qcLink(db)).token;
    await withApp(db, async (post) => {
        await assertNotFound(await post('/qc', { token: quote }));
        await assertNotFound(await post('/qc/drawing', { token: quote, file_id: 1 }));
        await assertNotFound(await post('/qc/photo', { token: quote, photo_id: 1 }));
        await assertNotFound(await post('/quote', { token: qc }));
        await assertNotFound(await post('/quote/pdf', { token: qc }));
    });
});

test('unknown, malformed, missing, expired and turned-off tokens all get the same 404', async () => {
    const db = seed();
    const expired = await quoteLink(db, 1);
    db.sqlite.exec(`UPDATE share_link SET expires_at = '2000-01-01 00:00:00' WHERE id = ${expired.id}`);
    const off = await quoteLink(db, 1);
    await links.turnOff(db, off.id);
    const tokens = [UNKNOWN, 'short', 'x'.repeat(44), `${'x'.repeat(42)}!`, 12, null, undefined, {}, expired.token, off.token];
    await withApp(db, async (post) => {
        for (const token of tokens) {
            await assertNotFound(await post('/quote', { token }));
            await assertNotFound(await post('/quote/pdf', { token }));
        }
        await assertNotFound(await post('/quote', {}));
    });
});

test('bad ids get 404 and a token in the URL is ignored', async () => {
    const db = seed();
    const { token } = await qcLink(db, 10);
    await withApp(db, async (post) => {
        for (const id of [0, -1, 1.5, '1', '01', 12345678901, null, undefined]) {
            await assertNotFound(await post('/qc/drawing', { token, file_id: id }));
            await assertNotFound(await post('/qc/photo', { token, photo_id: id }));
        }
        await assertNotFound(await post(`/quote?token=${token}`, {}));
    });
});

test('a flood from one IP is limited with 429', async () => {
    const db = seed();
    await withApp(db, async (post) => {
        const statuses = new Set();
        for (let i = 0; i < 620; i += 1) statuses.add((await post('/quote', { token: UNKNOWN })).status);
        assert.ok(statuses.has(404));
        assert.ok(statuses.has(429));
    });
});
