const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const jobs = require('../../src/lib/printJobs');
const agent = require('../../src/lib/printAgentToken');

const LETTER = { id: 1, cups_queue: 'Q', role: 'letter', media: 'Letter', copies: { packing: 2 }, enabled: 1 };

// handlers: array of [regex, rows-or-result]; first match wins.
function makeDb(handlers = []) {
    return {
        calls: [],
        async execute(sql, params) {
            this.calls.push({ sql, params });
            for (const [re, out] of handlers) if (re.test(sql)) return [typeof out === 'function' ? out(params) : out];
            return [/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) ? { insertId: 9, affectedRows: 1 } : []];
        },
    };
}
const sqls = (db) => db.calls.map((c) => c.sql.replace(/\s+/g, ' ').trim());

async function code(promise) {
    try { await promise; } catch (e) { return e.code; }
    return null;
}

test('enqueuePrint stores copies and options, emits the job id and returns it', async () => {
    const db = makeDb([
        [/FROM uploaded_files/, [{ id: 4, filename: 'p.pdf', mimetype: 'application/pdf' }]],
        [/FROM printer/, [LETTER]],
    ]);
    const seen = [];
    jobs.events.once('job', (id) => seen.push(id));
    const id = await jobs.enqueuePrint(db, { fileId: 4, kind: 'packing', user: { id: 'u1', name: 'Ann' } });
    assert.strictEqual(id, 9);
    assert.deepStrictEqual(seen, [9]);
    const ins = db.calls.find((c) => /INSERT INTO print_job/.test(c.sql));
    assert.deepStrictEqual(ins.params, [4, 1, 'packing', 2, JSON.stringify(['media=Letter', 'fit-to-page']), 'u1', 'Ann']);
});

test('enqueuePrint with printerId uses that printer instead of routing', async () => {
    const db = makeDb([
        [/FROM uploaded_files/, [{ id: 4, filename: 'p.pdf', mimetype: 'application/pdf' }]],
        [/FROM printer/, [{ ...LETTER, id: 7 }]],
    ]);
    await jobs.enqueuePrint(db, { fileId: 4, kind: 'quote', user: { id: 'u', name: 'n' }, printerId: 7 });
    const sel = db.calls.find((c) => /FROM printer/.test(c.sql));
    assert.deepStrictEqual(sel.params, [7]);
    assert.strictEqual(db.calls.find((c) => /INSERT/.test(c.sql)).params[1], 7);
});

test('enqueuePrint throws NOT_FOUND for a missing file and NOT_PDF for other types, inserting nothing', async () => {
    const user = { id: 'u', name: 'n' };
    let db = makeDb([]);
    assert.strictEqual(await code(jobs.enqueuePrint(db, { fileId: 1, kind: 'file', user })), 'NOT_FOUND');
    db = makeDb([[/FROM uploaded_files/, [{ id: 1, filename: 'a.step', mimetype: 'application/octet-stream' }]]]);
    assert.strictEqual(await code(jobs.enqueuePrint(db, { fileId: 1, kind: 'file', user })), 'NOT_PDF');
    assert.ok(!sqls(db).some((s) => /INSERT/.test(s)));
});

test('enqueuePrint accepts a .pdf name sent as octet-stream', async () => {
    const db = makeDb([
        [/FROM uploaded_files/, [{ id: 1, filename: 'A.PDF', mimetype: 'application/octet-stream' }]],
        [/FROM printer/, [LETTER]],
    ]);
    assert.strictEqual(await jobs.enqueuePrint(db, { fileId: 1, kind: 'file', user: { id: 'u', name: 'n' } }), 9);
});

test('enqueuePrint propagates NO_PRINTER', async () => {
    const db = makeDb([[/FROM uploaded_files/, [{ id: 1, filename: 'a.pdf', mimetype: 'application/pdf' }]]]);
    assert.strictEqual(await code(jobs.enqueuePrint(db, { fileId: 1, kind: 'file', user: { id: 'u', name: 'n' } })), 'NO_PRINTER');
});

test('claimNext expires old queued jobs, fails or requeues lapsed leases, then claims oldest', async () => {
    const claimed = { id: 3, file_id: 4, kind: 'packing', copies: 2, options: ['a'], cups_queue: 'Q', filename: 'p.pdf' };
    const db = makeDb([
        [/^\s*SELECT id FROM print_job/, [{ id: 3 }]],
        [/^\s*SELECT j\./, [claimed]],
    ]);
    const job = await jobs.claimNext(db);
    assert.deepStrictEqual(job, claimed);
    const s = sqls(db);
    assert.match(s[0], /SET status = 'expired'.*WHERE status = 'queued' AND created_at < .*72 HOUR/);
    assert.match(s[1], /SET status = 'failed'.*WHERE status = 'sent' AND claimed_at < .*5 MINUTE AND attempts >= 3/);
    assert.match(s[2], /SET status = 'queued'.*WHERE status = 'sent' AND claimed_at < .*5 MINUTE AND attempts < 3/);
    assert.match(s[3], /SELECT id FROM print_job WHERE status = 'queued' ORDER BY created_at, id LIMIT 1/);
    assert.match(s[4], /SET status = 'sent', claimed_at = NOW\(\), attempts = attempts \+ 1 WHERE id = \? AND status = 'queued'/);
    assert.deepStrictEqual(db.calls[4].params, [3]);
});

test('claimNext returns null when the queue is empty', async () => {
    assert.strictEqual(await jobs.claimNext(makeDb()), null);
});

test('claimNext returns null when another claimer won the job', async () => {
    const db = makeDb([
        [/^\s*SELECT id FROM print_job/, [{ id: 3 }]],
        [/SET status = 'sent'/, { affectedRows: 0 }],
    ]);
    assert.strictEqual(await jobs.claimNext(db), null);
});

test('waitForJob resolves true when a job is enqueued and false on timeout, leaving no listener', async () => {
    const pending = jobs.waitForJob(1000);
    jobs.events.emit('job', 1);
    assert.strictEqual(await pending, true);
    assert.strictEqual(await jobs.waitForJob(5), false);
    assert.strictEqual(jobs.events.listenerCount('job'), 0);
});

test('recordResult marks a sent job printed with the lp id, or failed with the error', async () => {
    let db = makeDb();
    assert.strictEqual(await jobs.recordResult(db, 3, { ok: true, lpJobId: 'Q-12' }), true);
    assert.match(sqls(db)[0], /SET status = \?, lp_job_id = \?, error = \?, finished_at = NOW\(\) WHERE id = \? AND status = 'sent'/);
    assert.deepStrictEqual(db.calls[0].params, ['printed', 'Q-12', null, 3]);
    db = makeDb();
    await jobs.recordResult(db, 3, { ok: false, error: 'no paper' });
    assert.deepStrictEqual(db.calls[0].params, ['failed', null, 'no paper', 3]);
});

test('recordResult returns false when the job was not in sent state', async () => {
    const db = makeDb([[/UPDATE/, { affectedRows: 0 }]]);
    assert.strictEqual(await jobs.recordResult(db, 3, { ok: true }), false);
});

test('recentJobs returns newest first with a validated limit', async () => {
    const db = makeDb([[/FROM print_job/, [{ id: 2 }]]]);
    assert.deepStrictEqual(await jobs.recentJobs(db, 10), [{ id: 2 }]);
    assert.match(sqls(db)[0], /ORDER BY j\.id DESC LIMIT 10$/);
    await jobs.recentJobs(db, '5; DROP');
    assert.match(sqls(db)[1], /LIMIT 50$/);
});

test('issueToken returns a random token and stores only its SHA-256 hash, replacing the row', async () => {
    const db = makeDb();
    const a = await agent.issueToken(db);
    const b = await agent.issueToken(makeDb());
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notStrictEqual(a, b);
    const s = sqls(db);
    assert.match(s[0], /^DELETE FROM print_agent/);
    assert.match(s[1], /^INSERT INTO print_agent \(token_hash\)/);
    assert.deepStrictEqual(db.calls[1].params, [crypto.createHash('sha256').update(a).digest('hex')]);
    assert.ok(!JSON.stringify(db.calls).includes(a));
});

test('verifyToken accepts the matching token and stamps last_seen_at', async () => {
    const token = 'secret-token';
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const db = makeDb([[/SELECT/, [{ id: 8, token_hash: hash }]]]);
    assert.strictEqual(await agent.verifyToken(db, token), true);
    const upd = db.calls.find((c) => /UPDATE print_agent SET last_seen_at = NOW\(\)/.test(c.sql));
    assert.deepStrictEqual(upd.params, [8]);
});

test('verifyToken rejects wrong, empty and non-string tokens without stamping', async () => {
    const hash = crypto.createHash('sha256').update('right').digest('hex');
    for (const t of ['wrong', '', undefined, 123]) {
        const db = makeDb([[/SELECT/, [{ id: 8, token_hash: hash }]]]);
        assert.strictEqual(await agent.verifyToken(db, t), false);
        assert.ok(!sqls(db).some((x) => /UPDATE/.test(x)));
    }
    assert.strictEqual(await agent.verifyToken(makeDb([]), 'right'), false);
});

test('agentStatus reports unconfigured, or the timestamps', async () => {
    assert.deepStrictEqual(await agent.agentStatus(makeDb([])), { configured: false, createdAt: null, lastSeenAt: null });
    const c = new Date(1), l = new Date(2);
    const db = makeDb([[/SELECT/, [{ created_at: c, last_seen_at: l }]]]);
    assert.deepStrictEqual(await agent.agentStatus(db), { configured: true, createdAt: c, lastSeenAt: l });
});
