const test = require('node:test');
const assert = require('node:assert');
const { isInsideBox, isInsideViewport, rectsMatch, overTallSections, followsAnchor } = require('../../tools/overview-proof/checks');
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

const { runEach, ALL_SUITE_NAMES } = require('../../tools/overview-proof/runEach');

function recorder() {
  const checks = [];
  return { checks, check: (name, isOk, detail = '') => checks.push({ name, isOk, detail }) };
}

test('ALL_SUITE_NAMES includes admin-fixes and leaves out no-fixture', () => {
  assert.deepStrictEqual(ALL_SUITE_NAMES, ['proof-controls', 'admin', 'client', 'smoke', 'admin-fixes']);
  assert.ok(!ALL_SUITE_NAMES.includes('no-fixture'));
});

test('runEach runs every named suite in order on the shared context', async () => {
  const ctx = recorder();
  const ran = [];
  const suites = {
    a: async (c) => { ran.push('a'); c.check('a ok', true); },
    b: async (c) => { ran.push('b'); c.check('b ok', true); },
  };
  await runEach(['a', 'b'], suites, ctx);
  assert.deepStrictEqual(ran, ['a', 'b']);
  assert.deepStrictEqual(ctx.checks.map((c) => c.name), ['a ok', 'b ok']);
});

test('runEach records a crash as a failed check naming the suite and keeps going', async () => {
  const ctx = recorder();
  const suites = {
    a: async () => { throw new Error('boom'); },
    b: async (c) => c.check('b ok', true),
  };
  await runEach(['a', 'b'], suites, ctx);
  const failed = ctx.checks.filter((c) => !c.isOk);
  assert.strictEqual(failed.length, 1);
  assert.match(failed[0].name, /a/);
  assert.match(failed[0].detail, /boom/);
  assert.ok(ctx.checks.some((c) => c.name === 'b ok' && c.isOk));
});

test('runEach records a failed check for an unknown suite name and keeps going', async () => {
  const ctx = recorder();
  const suites = { b: async (c) => c.check('b ok', true) };
  await runEach(['missing', 'b'], suites, ctx);
  const failed = ctx.checks.filter((c) => !c.isOk);
  assert.strictEqual(failed.length, 1);
  assert.match(failed[0].name, /missing/);
  assert.ok(ctx.checks.some((c) => c.name === 'b ok'));
});

const box = rect(100, 100, 300, 300);

test('isInsideBox accepts a rectangle inside the box, within 1px', () => {
  assert.strictEqual(isInsideBox(rect(120, 120, 280, 280), box), true);
  assert.strictEqual(isInsideBox(rect(99, 99, 301, 301), box), true);
});

test('isInsideBox rejects a rectangle past any edge', () => {
  assert.strictEqual(isInsideBox(rect(98, 120, 280, 280), box), false);
  assert.strictEqual(isInsideBox(rect(120, 98, 280, 280), box), false);
  assert.strictEqual(isInsideBox(rect(120, 120, 302, 280), box), false);
  assert.strictEqual(isInsideBox(rect(120, 120, 280, 302), box), false);
});

const { fakeToken } = require('../../tools/overview-proof/harness');
const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

test('fakeToken carries access 1 for admin1, 2 for admin2 and 3 for admin', () => {
  assert.strictEqual(claims(fakeToken('admin1')).access, 1);
  assert.strictEqual(claims(fakeToken('admin2')).access, 2);
  assert.strictEqual(claims(fakeToken('admin')).access, 3);
  assert.strictEqual(claims(fakeToken('admin1')).role, 'admin');
});

test('replyFor answers the job summary with parts ids from 9000 and long unbroken values', () => {
  const { status, body } = replyFor('GET', '/api/internal/job/jobsummary?id=100');
  assert.strictEqual(status, 200);
  assert.ok(body.job.job_number && body.job.company_name);
  assert.ok(body.parts.length >= 2);
  body.parts.forEach((p, i) => {
    assert.strictEqual(p.id, 9000 + i);
    ['rev', 'details', 'material', 'finish', 'stock_size', 'price', 'note'].forEach((k) => assert.ok(p[k], k));
  });
  assert.ok(body.parts.some((p) => /\S{60,}/.test(p.details)));
});

test('replyFor answers the job page calls', () => {
  const stages = replyFor('GET', '/api/internal/job/jobstages?id=100').body.stages;
  assert.ok(stages.length >= 2);
  assert.strictEqual(replyFor('GET', '/api/internal/job/checkjobstarred?jobId=100').body.isStarred, false);
  assert.ok(Array.isArray(replyFor('GET', '/api/internal/job/files?jobId=100').body));
  assert.ok(Array.isArray(replyFor('GET', '/api/internal/expenses/byjob/100').body));
  assert.ok(replyFor('GET', '/api/internal/job/documents?id=100').body);
  assert.ok(replyFor('GET', '/api/internal/notes/getnote?jobid=100').body);
});

test('replyFor answers emails for a job and for a part with two long subjects', () => {
  ['jobId=100', 'partId=9000'].forEach((q) => {
    const { emails } = replyFor('GET', `/api/internal/emails?${q}`).body;
    assert.strictEqual(emails.length, 2);
    emails.forEach((e) => assert.ok(e.subject.length > 80 && e.id && e.message_id && e.from && e.date));
  });
});

test('replyFor answers the part page calls', () => {
  assert.ok(replyFor('GET', '/api/internal/part/getpart?id=9000').body.number);
  assert.ok(Array.isArray(replyFor('GET', '/api/internal/part/getjobs?partId=9000').body));
});

test('getblob returns a PDF only for partID 9000 and up', () => {
  const [file] = replyFor('GET', '/api/internal/part/getblob?partID=9001').body;
  assert.strictEqual(file.mimetype, 'application/pdf');
  assert.strictEqual(Buffer.from(file.content, 'base64').subarray(0, 5).toString(), '%PDF-');
  assert.deepStrictEqual(replyFor('GET', '/api/internal/part/getblob?partID=8999').body, []);
  assert.deepStrictEqual(replyFor('GET', '/api/internal/part/getblob?partID=501').body, []);
});

test('replyFor answers the parts page with two part lists and parts that have drawings', () => {
  const lists = replyFor('GET', '/api/internal/part-lists').body;
  assert.strictEqual(lists.length, 2);
  lists.forEach((l) => assert.ok(l.id && l.name && Array.isArray(l.part_ids)));
  const parts = replyFor('GET', '/api/internal/part/getparts?number=&description=').body;
  assert.ok(parts.length >= 3);
  parts.forEach((p) => assert.ok(p.id && p.number && p.description));
});

const { SUITES } = require('../../tools/overview-proof/adminFixes');

test('adminFixes exports fixes-smoke and admin-fixes', () => {
  assert.strictEqual(typeof SUITES['fixes-smoke'], 'function');
  assert.strictEqual(typeof SUITES['admin-fixes'], 'function');
});

test('admin-fixes runs every other suite in SUITES, including ones added later', async () => {
  const ran = [];
  const originals = { ...SUITES };
  const others = Object.keys(originals).filter((name) => name !== 'admin-fixes');
  others.forEach((name) => { SUITES[name] = async () => ran.push(name); });
  SUITES.extra = async () => ran.push('extra');
  try {
    await SUITES['admin-fixes'](recorder());
  } finally {
    delete SUITES.extra;
    Object.assign(SUITES, originals);
  }
  assert.deepStrictEqual(ran.sort(), [...others, 'extra'].sort());
});
