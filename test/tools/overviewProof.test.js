const test = require('node:test');
const assert = require('node:assert');
const { isInsideBox, countOutside, isInsideViewport, rectsMatch, overTallSections, followsAnchor } = require('../../tools/overview-proof/checks');
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

test('replyFor answers a part list sharing call with the empty sharing state', () => {
  ['1', '2'].forEach((id) => {
    assert.deepStrictEqual(replyFor('GET', `/api/internal/part-lists/${id}/sharing`), {
      status: 200, body: { enabled: false, token: null, members: [], parts: [] },
    });
  });
});

test('parts-panel leaves the harness request listener in place', async () => {
  const calls = [];
  const page = {
    removeAllListeners: (...args) => calls.push(['removeAllListeners', ...args]),
    on: (...args) => calls.push(['on', ...args]),
    evaluate: async () => ({}),
    waitForFunction: async () => {},
    close: async () => {},
  };
  await SUITES['parts-panel']({ openPage: async () => page, check: recorder().check });
  assert.deepStrictEqual(calls, []);
});

test('countOutside counts only the pairs whose rect leaves its box', () => {
  const pairs = [
    { rect: rect(120, 120, 280, 280), box },
    { rect: rect(120, 120, 302, 280), box },
    { rect: rect(120, 98, 280, 280), box },
    { rect: rect(99, 99, 301, 301), box },
  ];
  assert.strictEqual(countOutside(pairs), 2);
  assert.strictEqual(countOutside([]), 0);
});

const insidePair = { rect: rect(120, 120, 280, 280), box };
const pastPair = { rect: rect(120, 120, 280, 320), box };
const passingMeasure = (pairs) => ({
  actions: 1, stages: 1, chips: 1, sideways: 0, rows: 1, subjects: 1, opens: 1, deletes: 1, pairs,
});
const runWithPairs = async (suite, pairs) => {
  const ctx = recorder();
  const page = { evaluate: async () => passingMeasure(pairs), close: async () => {} };
  await SUITES[suite]({ openPage: async () => page, check: ctx.check });
  return ctx.checks;
};

test('job-page fails the inside-their-part check for a rectangle past its box', async () => {
  const checks = await runWithPairs('job-page', [insidePair, pastPair]);
  const inside = checks.filter((c) => /keeps part actions inside their part/.test(c.name));
  assert.ok(inside.length > 0);
  assert.ok(inside.every((c) => !c.isOk));
});

test('job-page passes the inside-their-part check when every rectangle is inside', async () => {
  const checks = await runWithPairs('job-page', [insidePair]);
  assert.ok(checks.filter((c) => /inside their part/.test(c.name)).every((c) => c.isOk));
});

test('emails fails the stay-inside check for a rectangle past its box', async () => {
  const checks = await runWithPairs('emails', [insidePair, pastPair]);
  const inside = checks.filter((c) => /stay inside their section/.test(c.name));
  assert.ok(inside.length > 0);
  assert.ok(inside.every((c) => !c.isOk));
});

test('emails passes the stay-inside check when every rectangle is inside', async () => {
  const checks = await runWithPairs('emails', [insidePair]);
  assert.ok(checks.filter((c) => /stay inside their section/.test(c.name)).every((c) => c.isOk));
});

const { allowFinances } = require('../../tools/overview-proof/fixtures');

test('finance fixtures answer the Finances and Jobs page calls', () => {
  const invoices = replyFor('GET', '/api/internal/finances/periods/7/invoices?limit=100&offset=0');
  assert.strictEqual(invoices.status, 200);
  assert.ok(invoices.body.invoices.some((i) => i.invoice_status === 'paid' && i.paid_date));
  assert.strictEqual(replyFor('GET', '/api/internal/finances/overview').body.periods[0].id, 7);
  assert.strictEqual(replyFor('GET', '/api/internal/job/getjobs?sortBy=created_at&periodId=7').status, 200);
});

test('allowFinances(false) makes every finances call answer 403 until turned back on', () => {
  allowFinances(false);
  try {
    assert.strictEqual(replyFor('GET', '/api/internal/finances/overview').status, 403);
    assert.strictEqual(replyFor('GET', '/api/internal/job/getjobs?sortBy=created_at').status, 200);
  } finally {
    allowFinances(true);
  }
  assert.strictEqual(replyFor('GET', '/api/internal/finances/overview').status, 200);
});

test('finance-shots suite is registered for run.js', () => {
  assert.strictEqual(typeof require('../../tools/overview-proof/financeShots').SUITES['finance-shots'], 'function');
});

test('invite and expense fixtures answer the company list and both jobs', () => {
  const companies = replyFor('GET', '/api/internal/company/getcompanies').body;
  assert.ok(companies.length >= 3 && companies.every((c) => c.id && c.name));
  assert.notDeepStrictEqual(companies.map((c) => c.name), [...companies.map((c) => c.name)].sort());
  assert.strictEqual(replyFor('GET', '/api/internal/job/jobsummary?id=100').body.job.total_cost, 1200);
  assert.strictEqual(replyFor('GET', '/api/internal/job/jobsummary?id=101').body.job.total_cost, '');
  ['100', '101'].forEach((id) => {
    const rows = replyFor('GET', `/api/internal/expenses/byjob/${id}`).body;
    assert.ok(rows.length >= 2 && rows.some((r) => r.file_id));
  });
});

test('invite-expense-shots suite is registered for run.js and left out of all', () => {
  assert.strictEqual(typeof require('../../tools/overview-proof/inviteExpenseShots').SUITES['invite-expense-shots'], 'function');
  assert.ok(!ALL_SUITE_NAMES.includes('invite-expense-shots'));
});

test('invite-emails-shots suite is registered for run.js and left out of all', () => {
  assert.strictEqual(typeof require('../../tools/overview-proof/inviteEmailsShots').SUITES['invite-emails-shots'], 'function');
  assert.ok(!ALL_SUITE_NAMES.includes('invite-emails-shots'));
});

test('replyFor answers the part page quality and file download calls', () => {
  assert.deepStrictEqual(replyFor('GET', '/api/internal/qc/parts/9000').body, { markings: [], pings: [], photos: [], jobs: [] });
  assert.strictEqual(replyFor('GET', '/api/internal/part/blob/download?fileID=7001').status, 200);
});

test('rectsOverlap flags a bar that crosses the card and ignores one that only touches its edge', () => {
  const { rectsOverlap } = require('../../tools/overview-proof/inviteEmailsShots');
  const card = { left: 28, top: 830, right: 362, bottom: 1168 };
  assert.strictEqual(rectsOverlap({ left: 0, top: 780, right: 390, bottom: 844 }, card), true);
  assert.strictEqual(rectsOverlap({ left: 0, top: 1528, right: 390, bottom: 1592 }, card), false);
  assert.strictEqual(rectsOverlap({ left: 0, top: 766, right: 390, bottom: 830 }, card), false);
});

test('copy-link-shots suite is registered for run.js and left out of all', () => {
  assert.strictEqual(typeof require('../../tools/overview-proof/copyLinkShots').SUITES['copy-link-shots'], 'function');
  assert.ok(!ALL_SUITE_NAMES.includes('copy-link-shots'));
});

test('isButtonClear passes a sized button that is the topmost thing at its centre', () => {
  const { isButtonClear } = require('../../tools/overview-proof/copyLinkShots');
  assert.strictEqual(isButtonClear({ width: 120, height: 30, isTopmost: true }), true);
  assert.strictEqual(isButtonClear({ width: 0, height: 30, isTopmost: true }), false);
  assert.strictEqual(isButtonClear({ width: 120, height: 0, isTopmost: true }), false);
  assert.strictEqual(isButtonClear({ width: 120, height: 30, isTopmost: false }), false);
  assert.strictEqual(isButtonClear(null), false);
});

test('contrastRatio rates near-white on white unreadable and dark grey on white readable', () => {
  const { contrastRatio, isNoteReadable } = require('../../tools/overview-proof/copyLinkShots');
  assert.ok(contrastRatio('rgb(240, 240, 240)', 'rgb(255, 255, 255)') < 1.2);
  assert.ok(contrastRatio('rgb(68, 68, 68)', 'rgb(255, 255, 255)') > 9);
  assert.strictEqual(isNoteReadable({ color: 'rgb(238, 238, 238)', background: 'rgb(248, 249, 250)' }), false);
  assert.strictEqual(isNoteReadable({ color: 'rgb(68, 68, 68)', background: 'rgb(255, 255, 255)' }), true);
  assert.strictEqual(isNoteReadable(null), false);
});

test('staysInLine fails when the button moves after a click or sits off the Back row', () => {
  const { staysInLine } = require('../../tools/overview-proof/copyLinkShots');
  const back = { top: 100, bottom: 136 };
  assert.strictEqual(staysInLine({ before: { top: 100, bottom: 136 }, after: { top: 100, bottom: 136 }, back }), true);
  assert.strictEqual(staysInLine({ before: { top: 100, bottom: 136 }, after: { top: 92, bottom: 128 }, back }), false);
  assert.strictEqual(staysInLine({ before: { top: 150, bottom: 186 }, after: { top: 150, bottom: 186 }, back }), false);
  assert.strictEqual(staysInLine(null), false);
});

test('replyFor answers share link lookups per target: live quote, unsaved quote, live qc', () => {
  const quote = replyFor('GET', '/api/internal/share-links?type=quote&target_id=100').body;
  assert.strictEqual(quote.ready, true);
  assert.ok(quote.link.token && quote.link.open_count > 0 && quote.link.expires_at);
  assert.deepStrictEqual(replyFor('GET', '/api/internal/share-links?type=quote&target_id=101').body, { link: null, ready: false });
  const qc = replyFor('GET', '/api/internal/share-links?type=qc&target_id=9000&company_id=7').body;
  assert.strictEqual(qc.ready, true);
  assert.ok(qc.link.token && qc.link.open_count > 0);
});

test('replyFor answers the share companies list with two companies and the share create call with a link', () => {
  assert.strictEqual(replyFor('GET', '/api/internal/share-links/companies?part_id=9000').body.companies.length, 2);
  assert.ok(replyFor('POST', '/api/internal/share-links').body.link.token);
});

test('replyFor answers the shared quote with two lines and tax', () => {
  const { status, body } = replyFor('POST', '/api/share/quote');
  assert.strictEqual(status, 200);
  assert.strictEqual(body.parts.length, 2);
  assert.strictEqual(body.fields.tax.flag, 'Y');
  assert.ok(body.fields.reference && body.fields.dates.created && body.company_name);
});

test('replyFor answers the shared QC with part 9000, two markings and two photos, no job data', () => {
  const { status, body } = replyFor('POST', '/api/share/qc');
  assert.strictEqual(status, 200);
  assert.ok(body.part.number.endsWith('9000'));
  assert.strictEqual(body.markings.length, 2);
  assert.strictEqual(body.photos.length, 2);
  body.photos.forEach((p) => assert.ok(body.markings.some((m) => m.id === p.marking_id)));
  assert.ok(!JSON.stringify(body).match(/job|po_number|is_leemac/i));
});

test('replyFor answers the shared drawing and photo with base64 file content', () => {
  const drawing = replyFor('POST', '/api/share/qc/drawing').body;
  assert.strictEqual(drawing.mimetype, 'application/pdf');
  assert.ok(Buffer.from(drawing.content, 'base64').toString().startsWith('%PDF'));
  const photo = replyFor('POST', '/api/share/qc/photo').body;
  assert.strictEqual(photo.mimetype, 'image/png');
  assert.strictEqual(Buffer.from(photo.content, 'base64').subarray(1, 4).toString(), 'PNG');
});

test('replyFor answers a share call for the token gone with 404', () => {
  ['/api/share/quote', '/api/share/qc', '/api/share/quote/pdf'].forEach((path) => {
    assert.strictEqual(replyFor('POST', `${path}?token=gone`).status, 404, path);
  });
  assert.strictEqual(replyFor('POST', '/api/share/quote?token=other').status, 200);
});

test('part notes fixtures: getpart has multi-line process steps and partnotes mixes job, shared and client notes', () => {
  assert.ok(replyFor('GET', '/api/internal/part/getpart?id=9000').body.process_steps.split('\n').length >= 3);
  const { status, body } = replyFor('GET', '/api/internal/notes/partnotes?partid=9000');
  assert.strictEqual(status, 200);
  assert.ok(body.some((n) => n.job_number && !n.is_client && !n.shared));
  assert.ok(body.some((n) => !n.is_client && n.shared));
  assert.ok(body.some((n) => n.is_client && n.job_number === null));
});

test('part notes fixtures: getnote for job 100 has a part-number note and files lookups answer', () => {
  const notes = replyFor('GET', '/api/internal/notes/getnote?jobid=100').body;
  assert.ok(notes.some((n) => n.part_number));
  assert.ok(notes.some((n) => n.shared) && notes.some((n) => !n.shared));
  assert.deepStrictEqual(replyFor('GET', '/api/internal/notes/getblob?noteID=1').body, []);
});

test('part notes fixtures: simple overview has a client note and shared and private admin notes', () => {
  const { status, body } = replyFor('GET', '/api/internal/simple/overview?page=1');
  assert.strictEqual(status, 200);
  assert.ok(body.pages >= 1);
  const notes = body.jobs.flatMap((j) => [...j.notes, ...j.parts.flatMap((p) => p.notes)]);
  assert.ok(notes.some((n) => n.is_client) && notes.some((n) => n.shared && !n.is_client) && notes.some((n) => !n.shared));
});

test('part-notes-shots is a suite in run.js SUITES source but not in ALL_SUITE_NAMES', () => {
  const { SUITES } = require('../../tools/overview-proof/partNotesShots');
  assert.strictEqual(typeof SUITES['part-notes-shots'], 'function');
  assert.ok(!ALL_SUITE_NAMES.includes('part-notes-shots'));
});

const sized = (scrollWidth, clientWidth, scrollHeight, clientHeight) => ({ scrollWidth, clientWidth, scrollHeight, clientHeight });

test('labelsFit returns only the boxes whose text overflows sideways or down, with 1px slack', () => {
  const { labelsFit } = require('../../tools/overview-proof/partNotesShots');
  const fits = sized(100, 100, 20, 20);
  const slack = sized(101, 100, 21, 20);
  const wide = sized(102, 100, 20, 20);
  const tall = sized(100, 100, 42, 20);
  assert.deepStrictEqual(labelsFit([fits, slack, wide, tall]), [wide, tall]);
  assert.deepStrictEqual(labelsFit([]), []);
});

test('narrowBlocks returns the widths under the minimum and keeps one equal to it', () => {
  const { narrowBlocks } = require('../../tools/overview-proof/partNotesShots');
  assert.deepStrictEqual(narrowBlocks([300, 219, 220, 40], 220), [219, 40]);
  assert.deepStrictEqual(narrowBlocks([300, 220], 220), []);
});

// A page whose scroll width, viewport and measurements the test controls; records what the suite does to it.
function fakeNotesPage({ pageHeight, scrollWidth, viewportWidth }) {
  const log = { viewports: [], shots: [] };
  let viewport = { width: viewportWidth, height: 844 };
  const page = {
    viewport: () => viewport,
    setViewport: async (v) => { viewport = v; log.viewports.push(v); },
    waitForSelector: async () => {},
    close: async () => {},
    screenshot: async (opts) => { log.shots.push({ height: viewport.height, opts }); },
    evaluate: async (fn, arg) => {
      const src = String(fn);
      if (src.includes('scrollingElement.scrollHeight')) return pageHeight;
      if (src.includes('scrollingElement.scrollWidth')) return scrollWidth;
      if (src.includes('overflowX')) {
        return { text: 'Messages Job #13800 Part only', furthestRight: 100, clipped: [], scopeCount: 3, tabs: [], noteWidths: [400] };
      }
      return true;
    },
  };
  return { page, log };
}

async function runPartNotes(env, fake) {
  const { SUITES } = require('../../tools/overview-proof/partNotesShots');
  const ctx = recorder();
  const states = [];
  const saved = { SHOTS_DIR: process.env.SHOTS_DIR, PART_NOTES_STATES: process.env.PART_NOTES_STATES };
  process.env.SHOTS_DIR = require('node:os').tmpdir();
  if (env === undefined) delete process.env.PART_NOTES_STATES; else process.env.PART_NOTES_STATES = env;
  try {
    await SUITES['part-notes-shots']({
      openPage: async (vp, route) => { states.push(route); return fake().page; },
      check: ctx.check,
    });
  } finally {
    Object.entries(saved).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  }
  return { checks: ctx.checks, states };
}

test('PART_NOTES_STATES limits the states that run and unset runs all four at both sizes', async () => {
  const quiet = console.log;
  console.log = () => {};
  try {
    const one = await runPartNotes('simple-card', () => fakeNotesPage({ pageHeight: 800, scrollWidth: 390, viewportWidth: 390 }));
    assert.deepStrictEqual(one.states, ['/simple-overview', '/simple-overview']);
    const two = await runPartNotes('job-notes, simple-card', () => fakeNotesPage({ pageHeight: 800, scrollWidth: 390, viewportWidth: 390 }));
    assert.strictEqual(two.states.length, 4);
    const all = await runPartNotes(undefined, () => fakeNotesPage({ pageHeight: 800, scrollWidth: 390, viewportWidth: 390 }));
    assert.strictEqual(all.states.length, 8);
  } finally {
    console.log = quiet;
  }
});

test('part-notes-shots fails a state whose whole page scrolls wider than the viewport', async () => {
  const quiet = console.log;
  console.log = () => {};
  try {
    const wide = await runPartNotes('simple-card', () => fakeNotesPage({ pageHeight: 800, scrollWidth: 500, viewportWidth: 390 }));
    const spill = wide.checks.filter((c) => /whole page/.test(c.name));
    assert.ok(spill.length > 0 && spill.some((c) => !c.isOk));
    const fine = await runPartNotes('simple-card', () => fakeNotesPage({ pageHeight: 800, scrollWidth: 390, viewportWidth: 390 }));
    assert.ok(fine.checks.filter((c) => /whole page/.test(c.name)).every((c) => c.isOk));
  } finally {
    console.log = quiet;
  }
});

test('part-notes-shots grows the viewport to the page height before the full-page shot', async () => {
  const quiet = console.log;
  console.log = () => {};
  const fakes = [];
  try {
    await runPartNotes('simple-card', () => { const f = fakeNotesPage({ pageHeight: 1700, scrollWidth: 390, viewportWidth: 390 }); fakes.push(f); return f; });
  } finally {
    console.log = quiet;
  }
  assert.ok(fakes.length > 0);
  fakes.forEach(({ log }) => {
    assert.strictEqual(log.shots.length, 1);
    assert.strictEqual(log.shots[0].height, 1700);
    assert.strictEqual(log.shots[0].opts.fullPage, true);
  });
});
