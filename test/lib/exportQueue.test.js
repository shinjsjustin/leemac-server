const test = require('node:test');
const assert = require('node:assert/strict');
const { createExportQueue, ExportQueueTimeout } = require('../../src/lib/exportQueue');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('runs jobs one at a time in request order', async () => {
    const queue = createExportQueue();
    const log = [];
    let active = 0;
    let maxActive = 0;
    const job = (name, ms) => async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        log.push(`start ${name}`);
        await sleep(ms);
        log.push(`end ${name}`);
        active--;
        return name;
    };
    const results = await Promise.all([
        queue.run(job('a', 15)),
        queue.run(job('b', 1)),
        queue.run(job('c', 1)),
    ]);
    assert.deepEqual(results, ['a', 'b', 'c']);
    assert.equal(maxActive, 1);
    assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
    assert.equal(queue.size(), 0);
});

test('a rejected job rejects its caller and does not block the next', async () => {
    const queue = createExportQueue();
    const first = queue.run(async () => { throw new Error('boom'); });
    const second = queue.run(async () => 'ok');
    await assert.rejects(first, /boom/);
    assert.equal(await second, 'ok');
});

test('size counts waiting and running jobs', async () => {
    const queue = createExportQueue();
    const a = queue.run(() => sleep(5));
    const b = queue.run(() => sleep(1));
    assert.equal(queue.size(), 2);
    await Promise.all([a, b]);
    assert.equal(queue.size(), 0);
});

test('a job waiting longer than maxWaitMs rejects 503 and never runs', async () => {
    const queue = createExportQueue({ maxWaitMs: 10 });
    let ran = false;
    const slow = queue.run(() => sleep(40));
    const waiting = queue.run(async () => { ran = true; });
    const after = queue.run(async () => 'later');
    await assert.rejects(waiting, (err) => {
        assert.ok(err instanceof ExportQueueTimeout);
        assert.equal(err.status, 503);
        assert.equal(err.message, 'Another export is still running; try again shortly');
        return true;
    });
    await slow;
    assert.equal(await after.catch((e) => e.status), 503);
    assert.equal(ran, false);
    assert.equal(queue.size(), 0);
});

test('a job that starts before maxWaitMs runs normally', async () => {
    const queue = createExportQueue({ maxWaitMs: 50 });
    const a = queue.run(() => sleep(5));
    const b = queue.run(async () => 'b');
    await a;
    assert.equal(await b, 'b');
});
