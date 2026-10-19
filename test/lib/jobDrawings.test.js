const test = require('node:test');
const assert = require('node:assert');
const { makeFakeTxDb } = require('../helpers/fakeTxDb');
const { addDrawingPartToJob } = require('../../src/lib/jobDrawings');
const { JobPartError } = require('../../src/lib/jobParts');

const file = (name, mimetype = 'application/pdf') => ({
    originalname: name, mimetype, size: 3, buffer: Buffer.from('abc'),
});
const body = (extra = {}) => ({ part_number: 'P-100', title: 'Bracket', rev: 'B', material: 'Al', finish: 'Anodize', quantity: '4', price: '12.50', ...extra });
const files = (extra = {}) => ({ drawing: [file('d.pdf')], ...extra });

function handlers({ existing }) {
    return [
        { match: /SELECT id FROM part WHERE number/, rows: existing ? [{ id: 7 }] : (() => []) },
        { match: /INSERT IGNORE INTO part/, rows: existing ? { affectedRows: 0, insertId: 0 } : { affectedRows: 1, insertId: 7 } },
        { match: /INSERT INTO job_part/, rows: { insertId: 21 } },
        { match: /INSERT INTO uploaded_files/, rows: { insertId: 90 } },
    ];
}
// SELECT after an ignored insert must find the part; before it, a new part is absent.
function newPartDb() {
    let inserted = false;
    return makeFakeTxDb([
        { match: /SELECT id FROM part WHERE number/, rows: () => (inserted ? [{ id: 7 }] : []) },
        { match: /INSERT IGNORE INTO part/, rows: () => { inserted = true; return { affectedRows: 1, insertId: 7 }; } },
        { match: /INSERT INTO job_part/, rows: { insertId: 21 } },
        { match: /INSERT INTO uploaded_files/, rows: { insertId: 90 } },
    ]);
}

test('creates new part with title description, links it, attaches pdf and step', async () => {
    const db = newPartDb();
    const result = await addDrawingPartToJob(db, 3, body(), files({ step: [file('m.STEP', 'application/octet-stream')] }));
    assert.deepStrictEqual(result, { job_part_id: 21, part_id: 7, part_created: true, file_ids: [90, 90] });
    const part = db.calls.find((c) => /INSERT IGNORE INTO part/.test(c.sql));
    assert.deepStrictEqual(part.params, ['P-100', 'Bracket']);
    const link = db.calls.find((c) => /INSERT INTO job_part/.test(c.sql));
    assert.deepStrictEqual(link.params, [3, 7, 4, 12.5, 'B', 'Al', 'Anodize', null, '*Al *Anodize']);
    const uploads = db.calls.filter((c) => /INSERT INTO uploaded_files/.test(c.sql));
    assert.deepStrictEqual(uploads.map((u) => [u.params[0], u.params[1], u.params[4]]), [
        ['d.pdf', 'application/pdf', 7], ['m.STEP', 'application/octet-stream', 7],
    ]);
    const tx = db.calls.filter((c) => c.tx).map((c) => c.tx);
    assert.deepStrictEqual(tx, ['beginTransaction', 'commit', 'release']);
});

test('reuses existing part, reports part_created false, defaults quantity and price to 1', async () => {
    const db = makeFakeTxDb(handlers({ existing: true }));
    const result = await addDrawingPartToJob(db, 3, { part_number: 'P-100', quantity: '' }, files());
    assert.strictEqual(result.part_created, false);
    assert.strictEqual(result.part_id, 7);
    const link = db.calls.find((c) => /INSERT INTO job_part/.test(c.sql));
    assert.strictEqual(link.params[2], 1);
    assert.strictEqual(link.params[3], 1);
});

const badInputs = [
    ['missing drawing', body(), {}],
    ['non-pdf drawing', body(), { drawing: [file('d.png')] }],
    ['bad step extension', body(), files({ step: [file('m.iges')] })],
    ['missing part_number', body({ part_number: '  ' }), files()],
];
for (const [name, b, f] of badInputs) {
    test(`rejects ${name} with 400 before any db call`, async () => {
        const db = makeFakeTxDb();
        await assert.rejects(addDrawingPartToJob(db, 3, b, f), (e) => e instanceof JobPartError && e.status === 400);
        assert.strictEqual(db.calls.length, 0);
    });
}

test('accepts .stp and uppercase .PDF', async () => {
    const db = newPartDb();
    await addDrawingPartToJob(db, 3, body(), { drawing: [file('D.PDF')], step: [file('m.stp')] });
    assert.ok(db.calls.some((c) => c.tx === 'commit'));
});

test('rolls back and releases when a write fails', async () => {
    const boom = new Error('boom');
    const db = makeFakeTxDb([
        { match: /SELECT id FROM part WHERE number/, rows: [] },
        { match: /INSERT IGNORE INTO part/, error: boom },
    ]);
    await assert.rejects(addDrawingPartToJob(db, 3, body(), files()), boom);
    const tx = db.calls.filter((c) => c.tx).map((c) => c.tx);
    assert.deepStrictEqual(tx, ['beginTransaction', 'rollback', 'release']);
});
