const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clientJobStage, clientPartStage } = require('../../src/lib/shopStages');

const NO_PO = { po_number: '', po_date: null };
const WITH_PO = { po_number: 'PO-1', po_date: null };
const DATE_PO = { po_number: null, po_date: '2026-06-01' };

test('clientJobStage gives quoted for a job with no PO and no stars or early stars', () => {
    const cases = [
        [NO_PO, [], 'quoted'],
        [NO_PO, ['quoted'], 'quoted'],
        [NO_PO, ['open'], 'quoted'],
        [NO_PO, ['urgent', 'qa'], 'quoted'],
        [{ po_number: '  ', po_date: '' }, [], 'quoted'],
    ];
    for (const [job, statuses, expected] of cases) assert.equal(clientJobStage(job, statuses), expected);
});

test('clientJobStage gives the least advanced star stage once past in_shop', () => {
    assert.equal(clientJobStage(NO_PO, ['checking_stock', 'qa']), 'material');
    assert.equal(clientJobStage(WITH_PO, ['qa', 'running_manual']), 'machining');
    assert.equal(clientJobStage(WITH_PO, ['open']), 'in_shop');
    assert.equal(clientJobStage(WITH_PO, ['quoted', 'qa']), 'quoted');
});

test('clientJobStage without stars uses PO, then ship and invoice dates, never open', () => {
    assert.equal(clientJobStage(WITH_PO, []), 'in_shop');
    assert.equal(clientJobStage(DATE_PO, []), 'in_shop');
    assert.equal(clientJobStage({ ...WITH_PO, ship_date: '2026-06-02' }, []), 'shipped');
    assert.equal(clientJobStage({ ...WITH_PO, ship_date: '2026-06-02', invoice_date: '2026-06-03' }, []), 'invoiced');
    assert.equal(clientJobStage({ ...NO_PO, ship_date: '2026-06-02' }, []), 'shipped');
});

test('clientPartStage gives the star stage, quoted for in_shop without a PO, null without a star', () => {
    assert.equal(clientPartStage(NO_PO, 'open'), 'quoted');
    assert.equal(clientPartStage(WITH_PO, 'open'), 'in_shop');
    assert.equal(clientPartStage(NO_PO, 'qa'), 'inspection');
    assert.equal(clientPartStage(NO_PO, 'quoted'), 'quoted');
    assert.equal(clientPartStage(WITH_PO, null), null);
    assert.equal(clientPartStage(WITH_PO, undefined), null);
});
