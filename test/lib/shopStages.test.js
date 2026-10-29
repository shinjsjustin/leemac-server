const test = require('node:test');
const assert = require('node:assert/strict');
const { VALID_STAR_STATUSES } = require('../../src/routes/job/shared');
const { STAGES, stageOf, jobStage, dueFlag } = require('../../src/lib/shopStages');

const keys = STAGES.map((s) => s.key);

test('STAGES lists keys in shop order with labels', () => {
    assert.deepEqual(keys, [
        'quoted', 'in_shop', 'material', 'preparing', 'machining', 'outside_finishing',
        'finishing', 'inspection', 'packing', 'done', 'delivered', 'invoiced',
    ]);
    assert.deepEqual(STAGES.map((s) => s.label), [
        'Quoted', 'In the shop', 'Material', 'Preparing', 'Machining', 'Outside finishing',
        'Finishing', 'Inspection', 'Packing', 'Done', 'Delivered', 'Invoiced',
    ]);
});

test('stageOf maps each star status to its stage', () => {
    const expected = {
        open: 'in_shop', urgent: 'in_shop', waiting: 'in_shop', done: 'done',
        quoted: 'quoted', checking_stock: 'material', waiting_material: 'material',
        at_subvendor: 'outside_finishing', programming: 'preparing', setup: 'preparing',
        running_machine_a: 'machining', running_machine_d: 'machining', running_manual: 'machining',
        deburr_clean: 'finishing', qa: 'inspection', waiting_finish: 'outside_finishing',
        packing: 'packing', delivered: 'delivered', invoiced: 'invoiced',
    };
    assert.deepEqual(VALID_STAR_STATUSES.slice().sort(), Object.keys(expected).sort());
    for (const status of VALID_STAR_STATUSES) assert.equal(stageOf(status), expected[status], status);
});

test('jobStage returns the least-advanced starred part stage', () => {
    assert.equal(jobStage({}, ['qa', 'setup', 'packing']), 'preparing');
    assert.equal(jobStage({ invoice_date: '2026-01-01' }, ['running_manual', 'done']), 'machining');
});

test('jobStage falls back to invoiced, shipped or open from dates', () => {
    assert.equal(jobStage({ invoice_date: '2026-01-01', ship_date: '2026-01-01' }, []), 'invoiced');
    assert.equal(jobStage({ ship_date: new Date('2026-01-01') }, []), 'shipped');
    assert.equal(jobStage({ ship_date: null, invoice_date: null }, []), 'open');
});

const now = new Date(2026, 5, 10, 15, 30);
const flag = (due, over = {}, stage = 'machining') => dueFlag({ due_date: due, ...over }, stage, now);

test('dueFlag is due_soon from 0 to 7 days ahead', () => {
    assert.equal(flag('2026-06-10'), 'due_soon');
    assert.equal(flag('2026-06-17'), 'due_soon');
    assert.equal(flag(new Date(2026, 5, 12)), 'due_soon');
    assert.equal(flag('2026-06-18'), null);
});

test('dueFlag is overdue once the due day has passed', () => {
    assert.equal(flag('2026-06-09'), 'overdue');
    assert.equal(flag(new Date(2026, 5, 1)), 'overdue');
});

test('dueFlag is null when shipped, undated, or at done or later', () => {
    assert.equal(flag('2026-06-09', { ship_date: '2026-06-08' }), null);
    assert.equal(flag(null), null);
    assert.equal(flag('2026-06-09', {}, 'done'), null);
    assert.equal(flag('2026-06-09', {}, 'invoiced'), null);
    assert.equal(flag('2026-06-09', {}, 'packing'), 'overdue');
});
