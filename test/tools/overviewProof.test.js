const test = require('node:test');
const assert = require('node:assert');
const { isInsideViewport, rectsMatch } = require('../../tools/overview-proof/checks');
const { overviewData, replyFor } = require('../../tools/overview-proof/fixtures');

const VIEWPORT = { width: 1000, height: 700 };
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

test('isInsideViewport accepts a rectangle fully inside', () => {
  assert.strictEqual(isInsideViewport(rect(10, 10, 200, 100), VIEWPORT), true);
  assert.strictEqual(isInsideViewport(rect(0, 0, 1000, 700), VIEWPORT), true);
});

test('isInsideViewport rejects a rectangle past any edge', () => {
  assert.strictEqual(isInsideViewport(rect(-1, 10, 200, 100), VIEWPORT), false);
  assert.strictEqual(isInsideViewport(rect(10, -1, 200, 100), VIEWPORT), false);
  assert.strictEqual(isInsideViewport(rect(10, 10, 1001, 100), VIEWPORT), false);
  assert.strictEqual(isInsideViewport(rect(10, 10, 200, 701), VIEWPORT), false);
});

test('rectsMatch allows 1px of difference and no more', () => {
  const a = [rect(10, 10, 100, 50), rect(0, 0, 5, 5)];
  assert.strictEqual(rectsMatch(a, [rect(11, 9, 101, 51), rect(0, 0, 5, 5)]), true);
  assert.strictEqual(rectsMatch(a, [rect(10, 10, 102, 50), rect(0, 0, 5, 5)]), false);
});

test('rectsMatch rejects lists of different length', () => {
  assert.strictEqual(rectsMatch([rect(0, 0, 1, 1)], []), false);
  assert.strictEqual(rectsMatch([], []), true);
});

test('overview fixture has several jobs with several parts each', () => {
  const { jobs } = overviewData();
  assert.ok(jobs.length >= 3);
  jobs.forEach((job) => assert.ok(job.parts.length >= 3));
});

test('overview fixture covers multi-sub-step stages and has unique part ids', () => {
  const parts = overviewData().jobs.flatMap((job) => job.parts);
  const statuses = new Set(parts.map((p) => p.status));
  ['running_machine_a', 'running_machine_d', 'checking_stock', 'at_subvendor'].forEach((s) => assert.ok(statuses.has(s), s));
  assert.strictEqual(new Set(parts.map((p) => p.job_part_id)).size, parts.length);
});

test('replyFor answers the overview and schedule calls', () => {
  assert.deepStrictEqual(replyFor('GET', '/api/internal/job/overview').body, overviewData());
  assert.ok(Array.isArray(replyFor('GET', '/api/internal/job/schedule').body.board));
});

test('replyFor ignores the query string', () => {
  assert.ok(replyFor('GET', '/api/internal/part/getblob?partID=11'));
});

test('replyFor returns null for an unknown call so the run can fail', () => {
  assert.strictEqual(replyFor('GET', '/api/internal/nothing'), null);
  assert.strictEqual(replyFor('DELETE', '/api/internal/job/overview'), null);
});

test('replyFor answers the job print menu call with documents and a drawing count', () => {
  const { status, body } = replyFor('GET', '/api/internal/print/job?jobID=100');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.documents.length, 5);
  assert.strictEqual(body.drawings, 6);
});

test('replyFor answers the unstar call', () => {
  assert.deepStrictEqual(replyFor('DELETE', '/api/internal/job/unstarjob'), { status: 200, body: {} });
});
