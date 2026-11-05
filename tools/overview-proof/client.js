const { isInsideViewport } = require('./checks');
const CLIENT_OVERVIEW_ROUTE = '/client-overview';
const PAGE_HEIGHT_PX = 800;
const WIDTHS_PX = [1400, 1199, 1000, 768, 600, 393];
const PAGE_ROOTS = ['.portal-overview', '.portal-job-page'];
const FURTHEST_COUNT = 5;
const LABEL_LENGTH = 40;
const STACKED_BELOW_PX = 1200;
const SECTION_SLACK_PX = 48;
const PAGE_SLACK_PX = 120;
const PHONE_WIDTH_PX = 393;
const THREE_COLUMNS = 3;
const NOTE_WIDTHS_PX = [1000, 768];
const NOTE_ROUTES = ['/client-overview', '/client-job/100'];
const OWN_NOTE = { id: 2, content: 'Thanks, confirmed.' };
const NOTED_JOB = { id: 100, number: 'J-2026-13800-REV-B' };
const UNNOTED_JOB = { id: 102, number: 'J-2026-13802-REV-B' };
const NEW_NOTE_TEXT = 'Please ship by Friday.';
const EDITED_NOTE_TEXT = 'Confirmed, thanks again.';

// Runs in the page: sizes the page and the sections of whichever root page is showing.
function measurePage({ roots, furthestCount, labelLength }) {
  const rootEl = roots.map((selector) => document.querySelector(selector)).find(Boolean);
  const doc = document.documentElement;
  const label = (el) => {
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).join('.') : '';
    return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, labelLength)}"`;
  };
  const sections = rootEl ? [...rootEl.children].map((el) => ({
    name: label(el).split(' "')[0],
    height: Math.round(el.getBoundingClientRect().height),
    needs: el.scrollHeight,
  })) : [];
  const furthest = [...document.body.querySelectorAll('*')]
    .map((el) => ({ el, right: el.getBoundingClientRect().right }))
    .filter(({ right }) => right > 0)
    .sort((a, b) => b.right - a.right)
    .slice(0, furthestCount)
    .map(({ el, right }) => ({ label: label(el), right: Math.round(right) }));
  return {
    path: location.pathname,
    root: rootEl ? roots.find((selector) => document.querySelector(selector) === rootEl) : null,
    scrollWidth: doc.scrollWidth,
    scrollHeight: doc.scrollHeight,
    sections,
    furthest,
  };
}

// Runs in the page: heights the stacked overview needs versus what it takes.
function measureStack(rootSelector) {
  const root = document.querySelector(rootSelector);
  const sections = [...root.children].filter((el) => el.getBoundingClientRect().height > 0);
  const style = getComputedStyle(root);
  const gap = parseFloat(style.rowGap) || 0;
  const topBar = document.querySelector('.portal-topbar');
  return {
    columns: style.gridTemplateColumns.split(' ').length,
    overTall: sections
      .map((el) => ({ name: el.className, extra: Math.round(el.getBoundingClientRect().height - el.scrollHeight) }))
      .filter((s) => s.extra > 0),
    pageHeight: document.documentElement.scrollHeight,
    expected: Math.round((topBar ? topBar.offsetHeight : 0)
      + sections.reduce((sum, el) => sum + el.scrollHeight, 0) + gap * (sections.length - 1)),
  };
}

function printMeasure(width, m) {
  console.log(`${width}px  ${m.path}  page ${m.scrollWidth} x ${m.scrollHeight}`);
  m.sections.forEach((s) => console.log(`  section ${s.name}: height ${s.height}, content needs ${s.needs}`));
  m.furthest.forEach((f) => console.log(`  right ${f.right}: ${f.label}`));
}

// Runs before the app loads: records note writes, and marks one fixture note as the client's own
// because the fixtures carry no `mine`.
function installNoteSpy(ownNoteId) {
  window.__noteWrites = [];
  const realFetch = window.fetch;
  window.fetch = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    if (!String(url).includes('/portal-notes')) return realFetch(url, init);
    if (method !== 'GET') window.__noteWrites.push({ method, path: new URL(url).pathname, body: JSON.parse(init.body) });
    const response = await realFetch(url, init);
    if (method !== 'GET' || !response.ok) return response;
    const data = await response.json();
    Object.values(data.jobs).flat().forEach((note) => { note.mine = note.id === ownNoteId; });
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

async function openNotePage(openPage, width, route) {
  const page = await openPage({ width, height: PAGE_HEIGHT_PX }, route, 'client');
  await page.evaluateOnNewDocument(installNoteSpy, OWN_NOTE.id);
  await page.reload({ waitUntil: 'networkidle0' });
  return page;
}

// Runs in the page: the form must sit inside the window and be what the user hits at its key points.
function measureForm() {
  const form = document.querySelector('.portal-note-form');
  if (!form) return null;
  const rect = form.getBoundingClientRect();
  const topmostIsForm = (el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(hit) && form.contains(hit);
  };
  return {
    rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    onTop: [form, ...form.querySelectorAll('textarea, button')].every(topmostIsForm),
    text: form.querySelector('textarea').value,
    pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
  };
}

// Runs in the page: the button sits below its own row link and over nothing else.
function measureButton(label) {
  const button = document.querySelector(`button[aria-label="${label}"]`);
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  const link = button.parentElement.querySelector('a.portal-job-row').getBoundingClientRect();
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return { belowLink: rect.top >= link.bottom - 1, onTop: hit === button, count: button.textContent };
}

const clickButton = (page, label) => page.$eval(`button[aria-label="${label}"]`, (el) => el.click());
const notesWrites = (page) => page.evaluate(() => window.__noteWrites);

async function saveNote(page, text) {
  await page.$eval('.portal-note-form textarea', (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.$eval('.portal-note-form button[type="submit"]', (el) => el.click());
  await page.waitForSelector('.portal-note-form', { hidden: true });
}

async function checkForm({ page, check }, name, label, expectedText) {
  await clickButton(page, label);
  await page.waitForSelector('.portal-note-form');
  const form = await page.evaluate(measureForm);
  const { rect, viewport } = form;
  check(`${name}: form is inside the window`, isInsideViewport(rect, viewport), JSON.stringify({ rect, viewport }));
  check(`${name}: form is on top`, form.onTop, 'elementFromPoint hit something outside the form');
  check(`${name}: form opens with ${expectedText ? 'the latest note' : 'an empty box'}`, form.text === expectedText, `text "${form.text}"`);
  check(`${name}: page does not scroll sideways`, !form.pageScrollsSideways);
}

const SUITES = {
  // Measures only; a page that loads always passes.
  async 'client-measure'({ openPage, check }) {
    for (const width of WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, CLIENT_OVERVIEW_ROUTE, 'client');
      const m = await page.evaluate(measurePage, { roots: PAGE_ROOTS, furthestCount: FURTHEST_COUNT, labelLength: LABEL_LENGTH });
      check(`client page at ${width}px loaded`, m.root !== null, `no page content on ${m.path}`);
      printMeasure(width, m);
      await page.close();
    }
  },
  async 'client-layout'({ openPage, check }) {
    for (const width of WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, CLIENT_OVERVIEW_ROUTE, 'client');
      const m = await page.evaluate(measurePage, { roots: PAGE_ROOTS, furthestCount: FURTHEST_COUNT, labelLength: LABEL_LENGTH });
      check(`${width}px does not scroll sideways`, m.scrollWidth <= width, `scrollWidth ${m.scrollWidth}`);
      if (width === PHONE_WIDTH_PX) {
        check(`${width}px redirects to the job page`, m.path.startsWith('/client-job/'), `landed on ${m.path}`);
      } else if (width < STACKED_BELOW_PX) {
        const s = await page.evaluate(measureStack, '.portal-overview');
        const tall = s.overTall.filter((o) => o.extra > SECTION_SLACK_PX);
        check(`${width}px sections are no taller than their content`, tall.length === 0, JSON.stringify(tall));
        check(`${width}px page height fits its content`, s.pageHeight <= s.expected + PAGE_SLACK_PX, `page ${s.pageHeight}, expected at most ${s.expected + PAGE_SLACK_PX}`);
      } else {
        const s = await page.evaluate(measureStack, '.portal-overview');
        check(`${width}px keeps three columns`, s.columns === THREE_COLUMNS, `${s.columns} columns`);
      }
      await page.close();
    }
  },

  async 'client-notes'({ openPage, check }) {
    for (const width of NOTE_WIDTHS_PX) {
      for (const route of NOTE_ROUTES) {
        const name = `${width}px ${route}`;
        const noted = `Notes on ${NOTED_JOB.number}`;
        const unnoted = `Notes on ${UNNOTED_JOB.number}`;

        const page = await openNotePage(openPage, width, route);
        const button = await page.evaluate(measureButton, noted);
        check(`${name}: note button shows`, button !== null, `no button "${noted}"`);
        if (button) {
          check(`${name}: note button sits below its row link`, button.belowLink);
          check(`${name}: note button overlaps nothing`, button.onTop);
          check(`${name}: note button shows the count`, button.count === 'Notes 3', `"${button.count}"`);
        }
        await checkForm({ page, check }, `${name} edit`, noted, OWN_NOTE.content);
        await saveNote(page, EDITED_NOTE_TEXT);
        const [edit] = await notesWrites(page);
        check(`${name}: save sends PUT with { content }`,
          JSON.stringify(edit) === JSON.stringify({ method: 'PUT', path: `/api/portal-notes/${OWN_NOTE.id}`, body: { content: EDITED_NOTE_TEXT } }),
          JSON.stringify(edit));
        await page.close();

        const fresh = await openNotePage(openPage, width, route);
        await checkForm({ page: fresh, check }, `${name} new`, unnoted, '');
        await saveNote(fresh, NEW_NOTE_TEXT);
        const [created] = await notesWrites(fresh);
        check(`${name}: first save sends POST with { job_id, content }`,
          JSON.stringify(created) === JSON.stringify({ method: 'POST', path: '/api/portal-notes', body: { job_id: UNNOTED_JOB.id, content: NEW_NOTE_TEXT } }),
          JSON.stringify(created));
        await fresh.close();
      }
    }
    const phone = await openNotePage(openPage, PHONE_WIDTH_PX, CLIENT_OVERVIEW_ROUTE);
    const counts = await phone.evaluate(() => ({
      visibleButtons: [...document.querySelectorAll('.portal-job-note-btn')].filter((el) => el.getBoundingClientRect().width > 0).length,
      visiblePins: [...document.querySelectorAll('.portal-pin')].filter((el) => el.getBoundingClientRect().width > 0).length,
    }));
    check(`${PHONE_WIDTH_PX}px shows no job row note button`, counts.visibleButtons === 0, `${counts.visibleButtons} showing`);
    check(`${PHONE_WIDTH_PX}px part cards keep their note pin`, counts.visiblePins > 0, 'no pin showing');
    await phone.close();
  },
  async client(context) {
    await SUITES['client-layout'](context);
    await SUITES['client-notes'](context);
  },
};

module.exports = { SUITES };
