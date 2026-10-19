const test = require('node:test');
const assert = require('node:assert');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { addEmailLinks, listEmailLinks, removeEmailLink, EmailLinkError } = require('../../src/lib/emailLinks');
const { readOnly } = require('../../src/lib/bourne/readOnlyDb');

const link = (extra = {}) => ({ job_id: 1, message_id: 'a@x', subject: 'S', from: 'f@x', date: '2024-03-05T10:20:30Z', ...extra });
const opts = { createdBy: 'sam' };

function db({ jobs = [{ id: 1 }], parts = [{ id: 2 }], existing = [], insertIds = [50, 51, 52], insertError } = {}) {
    let n = 0;
    return makeFakeTxDb([
        { match: /SELECT id FROM job WHERE id IN/, rows: jobs },
        { match: /SELECT id FROM part WHERE id IN/, rows: parts },
        { match: /SELECT id FROM email_link WHERE/, rows: (p) => existing.filter((e) => e.key === p.join('|')).map((e) => ({ id: e.id })) },
        { match: /INSERT INTO email_link/, rows: () => ({ insertId: insertIds[n++] }), error: insertError },
    ]);
}
const rejects400 = (fn, re) => assert.rejects(fn, (e) => e instanceof EmailLinkError && e.status === 400 && re.test(e.message));

const invalid = [
    ['no id', link({ job_id: undefined }), /links\[0\]: .*exactly one/],
    ['both ids', link({ part_id: 2 }), /links\[0\]: .*exactly one/],
    ['non-positive id', link({ job_id: 0 }), /links\[0\]: .*exactly one/],
    ['fractional id', link({ job_id: 1.5 }), /links\[0\]: .*exactly one/],
    ['missing message_id', link({ message_id: undefined }), /links\[0\]: message_id is required/],
    ['blank message_id', link({ message_id: ' <> ' }), /links\[0\]: message_id is required/],
    ['long message_id', link({ message_id: 'a'.repeat(256) }), /links\[0\]: message_id/],
    ['bad date', link({ date: 'nope' }), /links\[0\]: date/],
    ['missing date', link({ date: undefined }), /links\[0\]: date/],
];
for (const [name, bad, re] of invalid) {
    test(`addEmailLinks rejects ${name} with 400 before any DB call`, async () => {
        const d = db();
        await rejects400(() => addEmailLinks(d, [bad], opts), re);
        assert.deepStrictEqual(d.calls, []);
    });
}

test('addEmailLinks names the failing index', async () => {
    await rejects400(() => addEmailLinks(db(), [link(), link(), link({ message_id: '' })], opts), /^links\[2\]: message_id is required$/);
});

test('addEmailLinks rejects empty, oversize and non-array lists', async () => {
    await rejects400(() => addEmailLinks(db(), [], opts), /links/);
    await rejects400(() => addEmailLinks(db(), Array(501).fill(link()), opts), /links/);
    await rejects400(() => addEmailLinks(db(), 'x', opts), /links/);
});

test('addEmailLinks normalizes fields and inserts in a transaction', async () => {
    const d = db();
    const r = await addEmailLinks(d, [link({ message_id: ' <a@x> ', subject: 's'.repeat(300), from: 'f'.repeat(300) })], opts);
    assert.deepStrictEqual(r, { created: 1, existing: 0, ids: [50] });
    const ins = d.calls.find((c) => /INSERT INTO email_link/.test(c.sql));
    assert.strictEqual(ins.params[0], 1);
    assert.strictEqual(ins.params.includes('a@x'), true);
    assert.strictEqual(ins.params.filter((p) => typeof p === 'string' && p.length === 255).length, 2);
    assert.strictEqual(ins.params.includes('2024-03-05 10:20:30'), true);
    assert.strictEqual(ins.params.includes('sam'), true);
    const tx = d.calls.filter((c) => c.tx).map((c) => c.tx);
    assert.deepStrictEqual(tx, ['beginTransaction', 'commit', 'release']);
});

test('addEmailLinks inserts a part link with part_id', async () => {
    const d = db();
    await addEmailLinks(d, [link({ job_id: undefined, part_id: 2 })], opts);
    const sel = d.calls.find((c) => /SELECT id FROM email_link/.test(c.sql));
    assert.match(sel.sql, /part_id = \?/);
    assert.deepStrictEqual(sel.params, [2, 'a@x']);
    assert.match(d.calls.find((c) => /INSERT INTO email_link/.test(c.sql)).sql, /part_id/);
});

test('addEmailLinks reuses existing pairs and keeps input order', async () => {
    const d = db({ existing: [{ key: '1|a@x', id: 9 }] });
    const r = await addEmailLinks(d, [link(), link({ message_id: 'b@x' }), link({ job_id: undefined, part_id: 2 })], opts);
    assert.deepStrictEqual(r, { created: 2, existing: 1, ids: [9, 50, 51] });
});

test('addEmailLinks 404 lists unknown ids and inserts nothing', async () => {
    const d = db({ jobs: [], parts: [] });
    await assert.rejects(() => addEmailLinks(d, [link({ job_id: 7 }), link({ job_id: undefined, part_id: 8 })], opts),
        (e) => e instanceof EmailLinkError && e.status === 404 && /7/.test(e.message) && /8/.test(e.message));
    assert.strictEqual(d.calls.some((c) => /INSERT/.test(c.sql)), false);
    assert.deepStrictEqual(d.calls.filter((c) => c.tx).map((c) => c.tx), ['beginTransaction', 'rollback', 'release']);
});

test('addEmailLinks rolls back, releases and rethrows on insert failure', async () => {
    const boom = new Error('boom');
    const d = db({ insertError: boom });
    await assert.rejects(() => addEmailLinks(d, [link()], opts), (e) => e === boom);
    assert.deepStrictEqual(d.calls.filter((c) => c.tx).map((c) => c.tx), ['beginTransaction', 'rollback', 'release']);
});

test('listEmailLinks issues one read-only SELECT and maps columns', async () => {
    const d = makeFakeTxDb([{ match: /FROM email_link/, rows: [
        { id: 3, message_id: 'm', subject: 's', from_address: 'f', sent_at: '2024-01-01', created_by: 'sam' }] }]);
    const r = await listEmailLinks(readOnly(d), { jobId: 4 });
    assert.deepStrictEqual(r, [{ id: 3, message_id: 'm', subject: 's', from: 'f', date: '2024-01-01', created_by: 'sam' }]);
    assert.strictEqual(d.calls.length, 1);
    assert.match(d.calls[0].sql, /WHERE job_id = \?/);
    assert.match(d.calls[0].sql, /ORDER BY sent_at DESC, id DESC/);
    assert.deepStrictEqual(d.calls[0].params, [4]);
});

test('listEmailLinks filters by part', async () => {
    const d = makeFakeTxDb();
    await listEmailLinks(d, { partId: 5 });
    assert.match(d.calls[0].sql, /WHERE part_id = \?/);
    assert.deepStrictEqual(d.calls[0].params, [5]);
});

test('removeEmailLink deletes by id', async () => {
    const d = makeFakeTxDb([{ match: /DELETE FROM email_link WHERE id = \?/, rows: { affectedRows: 1 } }]);
    await removeEmailLink(d, 6);
    assert.deepStrictEqual(d.calls[0].params, [6]);
});

test('removeEmailLink 404 when nothing deleted', async () => {
    const d = makeFakeTxDb([{ match: /DELETE/, rows: { affectedRows: 0 } }]);
    await assert.rejects(() => removeEmailLink(d, 6), (e) => e instanceof EmailLinkError && e.status === 404);
});

const idRows = (ids) => (p) => p.filter((id) => ids.includes(id)).map((id) => ({ id }));
const lookupDb = ({ jobs = [1, 2], parts = [3, 4] } = {}) => makeFakeTxDb([
    { match: /SELECT id FROM job WHERE id IN/, rows: idRows(jobs) },
    { match: /SELECT id FROM part WHERE id IN/, rows: idRows(parts) },
    { match: /SELECT id FROM email_link WHERE/, rows: [] },
    { match: /INSERT INTO email_link/, rows: { insertId: 9 } },
]);

test('addEmailLinks expands the job lookup to one placeholder per distinct id', async () => {
    const d = lookupDb();
    const links = [link({ job_id: 1 }), link({ job_id: 2, message_id: 'b@x' }), link({ job_id: 2, message_id: 'c@x' })];
    await addEmailLinks(d, links, opts);
    const lookup = d.calls.find((c) => /FROM job WHERE/.test(c.sql || ''));
    assert.ok(lookup.sql.includes('IN (?, ?)'));
    assert.deepStrictEqual(lookup.params, [1, 2]);
});

test('addEmailLinks names only the missing part id with 404 and does not insert', async () => {
    const d = lookupDb({ parts: [3] });
    const links = [link({ job_id: undefined, part_id: 3 }), link({ job_id: undefined, part_id: 4, message_id: 'b@x' })];
    await assert.rejects(() => addEmailLinks(d, links, opts),
        (e) => e instanceof EmailLinkError && e.status === 404 && /part 4$/.test(e.message));
    assert.ok(!d.calls.some((c) => /INSERT/.test(c.sql || '')));
});

test('addEmailLinks issues every SQL call with as many placeholders as params', async () => {
    const d = lookupDb();
    const links = [link({ job_id: 1 }), link({ job_id: 2, message_id: 'b@x' }),
        link({ job_id: undefined, part_id: 3, message_id: 'c@x' }), link({ job_id: undefined, part_id: 4, message_id: 'd@x' })];
    await addEmailLinks(d, links, opts);
    const sqlCalls = d.calls.filter((c) => c.sql);
    assert.ok(sqlCalls.length > 0);
    for (const c of sqlCalls) assert.strictEqual((c.sql.match(/\?/g) || []).length, c.params.length, c.sql);
});
