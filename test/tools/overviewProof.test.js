const test = require('node:test');
const assert = require('node:assert');
const { isInsideViewport, rectsMatch, overTallSections, followsAnchor } = require('../../tools/overview-proof/checks');
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

test('overTallSections flags a section taller than its painted content plus slack', () => {
  const sections = [
    { name: 'left', height: 900, painted: 880 },
    { name: 'right', height: 1500, painted: 400 },
    { name: 'edge', height: 464, painted: 400 },
    { name: 'over', height: 465, painted: 400 },
  ];
  assert.deepStrictEqual(overTallSections(sections, 64).map((s) => s.name), ['right', 'over']);
});

test('overTallSections reports the extra height and passes tight sections', () => {
  assert.deepStrictEqual(overTallSections([{ name: 'a', height: 1000, painted: 100 }], 64), [{ name: 'a', extra: 900 }]);
  assert.deepStrictEqual(overTallSections([{ name: 'a', height: 100, painted: 300 }], 64), []);
});

const anchored = (toggleTop, menuTop) => ({ toggle: rect(0, toggleTop, 28, toggleTop + 28), menu: rect(0, menuTop, 200, menuTop + 300) });

test('followsAnchor accepts a menu that moved with its toggle', () => {
  assert.strictEqual(followsAnchor(anchored(300, 330), anchored(260, 290)), true);
  assert.strictEqual(followsAnchor(anchored(300, 330), anchored(260, 289.5)), true);
});

test('followsAnchor rejects a frozen menu while the toggle moved', () => {
  assert.strictEqual(followsAnchor(anchored(300, 330), anchored(260, 330)), false);
});

test('followsAnchor rejects a toggle that never moved, even with the menu still', () => {
  assert.strictEqual(followsAnchor(anchored(300, 330), anchored(300, 330)), false);
  assert.strictEqual(followsAnchor(anchored(300, 330), anchored(300.5, 330.5)), false);
});

test('followsAnchor rejects a menu that moved a different distance', () => {
  assert.strictEqual(followsAnchor(anchored(300, 330), anchored(260, 280)), false);
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

test('replyFor answers the note POST and PUT calls', () => {
  assert.deepStrictEqual(replyFor('POST', '/api/portal-notes'), { status: 201, body: { id: 900 } });
  assert.deepStrictEqual(replyFor('PUT', '/api/portal-notes/41'), { status: 200, body: { id: 41 } });
  assert.strictEqual(replyFor('PUT', '/api/portal-notes'), null);
});

test('replyFor answers the notes list with several authors on jobs and parts', () => {
  const { status, body } = replyFor('GET', '/api/portal-notes');
  assert.strictEqual(status, 200);
  const notes = [...Object.values(body.jobs), ...Object.values(body.parts)].flat();
  assert.ok(new Set(notes.map((n) => n.author)).size >= 3);
  assert.ok(notes.some((n) => n.is_client) && notes.some((n) => !n.is_client));
});

test('replyFor answers the client overview, schedule and ticker calls', () => {
  const overview = replyFor('GET', '/api/portal/overview').body;
  assert.ok(overview.jobs.length >= 10 && overview.parts.length >= 10);
  assert.ok(overview.lists.length >= 2 && overview.requests.length >= 2);
  assert.ok(overview.parts.some((p) => p.drawings.length === 0));
  assert.ok(replyFor('GET', '/api/portal/schedule').body.board.length >= 5);
  assert.ok(replyFor('GET', '/api/portal/ticker').body.length >= 10);
});

test('replyFor answers the job list with its pagination', () => {
  const { jobs, pagination } = replyFor('GET', '/api/portal/jobs?limit=100&offset=0').body;
  assert.ok(jobs.length >= 10);
  assert.deepStrictEqual(pagination, { total: jobs.length, limit: 100, offset: 0, hasMore: false });
});

test('replyFor answers a job path carrying an id with that job and its parts', () => {
  const { jobs } = replyFor('GET', '/api/portal/jobs?limit=100&offset=0').body;
  const { status, body } = replyFor('GET', `/api/portal/jobs/${jobs[2].id}`);
  assert.strictEqual(status, 200);
  assert.strictEqual(body.id, jobs[2].id);
  assert.ok(body.parts.length >= 8);
  body.parts.forEach((p) => assert.ok(p.part_number && p.part_description && p.part_id));
  assert.strictEqual(replyFor('GET', '/api/portal/jobs/999999'), null);
});

test('replyFor answers a part-files path carrying an id, with no drawings', () => {
  const { status, body } = replyFor('GET', '/api/portal/parts/501/files');
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(body));
  body.forEach((f) => assert.ok(!/\.pdf$/i.test(f.filename)));
});
