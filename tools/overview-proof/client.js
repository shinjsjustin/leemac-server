const { isInsideViewport, overTallSections } = require('./checks');
const admin = require('./admin');
const CLIENT_OVERVIEW_ROUTE = '/client-overview';
const PAGE_HEIGHT_PX = 800;
const WIDTHS_PX = [1400, 1199, 1000, 768, 600, 393];
const PAGE_ROOTS = ['.portal-overview', '.portal-job-page'];
const FURTHEST_COUNT = 5;
const LABEL_LENGTH = 40;
const STACKED_BELOW_PX = 1200;
// Panel padding measures up to 58px around painted content.
const SECTION_SLACK_PX = 64;
// Page padding, section padding and the gaps between sections add a steady 193px over the painted heights.
const PAGE_SLACK_PX = 200;
const PHONE_WIDTH_PX = 393;
const THREE_COLUMNS = 3;
const NOTE_WIDTHS_PX = [1000, 768];
const NOTE_ROUTES = ['/client-overview', '/client-job/100'];
const OWN_NOTE = { id: 2, content: 'Thanks, confirmed.' };
const NOTED_JOB = { id: 100, number: 'J-2026-13800-REV-B' };
const UNNOTED_JOB = { id: 102, number: 'J-2026-13802-REV-B' };
const NEW_NOTE_TEXT = 'Please ship by Friday.';
const FORCED_TALL_CSS = '.portal-overview-right { min-height: 1500px !important; }';
const FROZEN_MENU_CSS = '.jpm-menu { top: 300px !important; max-height: none !important; }';
const CONTROL_WIDTH_PX = 1000;
const EDITED_NOTE_TEXT = 'Confirmed, thanks again.';

// Runs in the page: sizes the page and finds the furthest-right elements of whichever root page is showing.
function measurePage({ roots, furthestCount, labelLength }) {
  const rootEl = roots.map((selector) => document.querySelector(selector)).find(Boolean);
  const doc = document.documentElement;
  const label = (el) => {
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).join('.') : '';
    return `${el.tagName.toLowerCase()}${classes ? `.${classes}` : ''} "${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, labelLength)}"`;
  };
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
    furthest,
  };
}

const PAINTED_SELECTOR = 'img, input, textarea, button, canvas, .portal-tile, .portal-sched-track';

// Runs in the page: what each section of the root takes versus the height of what is painted in it.
function measureStack(rootSelector, paintedSelector) {
  const root = document.querySelector(rootSelector);
  const paintedRects = (section) => {
    const rects = [...section.querySelectorAll(paintedSelector)].map((el) => el.getBoundingClientRect());
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    return rects.filter((r) => r.height > 0 && r.width > 0);
  };
  const painted = (section) => {
    const rects = paintedRects(section);
    if (rects.length === 0) return 0;
    return Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
  };
  const sections = [...root.children]
    .filter((el) => el.getBoundingClientRect().height > 0)
    .map((el) => ({ name: el.className, height: Math.round(el.getBoundingClientRect().height), painted: Math.round(painted(el)) }));
  const style = getComputedStyle(root);
  const gap = parseFloat(style.rowGap) || 0;
  const topBar = document.querySelector('.portal-topbar');
  return {
    columns: style.gridTemplateColumns.split(' ').length,
    sections,
    pageHeight: document.documentElement.scrollHeight,
    expected: Math.round((topBar ? topBar.offsetHeight : 0)
      + sections.reduce((sum, s) => sum + s.painted, 0) + gap * (sections.length - 1)),
  };
}

const MAX_PAGE_HEIGHT_PX = { 1199: 3800, 1000: 4200, 768: 4900, 600: 6100 };
const MAX_BOARD_ROW_PX = 60;
const JOB_ROW_COUNT = 24;
const PART_TILE_COUNT = 30;
const EDGE_TOLERANCE_PX = 1;

// Runs in the page: sizes of the schedule rows and job numbers, and whether job rows stay in their column.
function measureLists(edgeTolerance) {
  const rect = (el) => el.getBoundingClientRect();
  const column = rect(document.querySelector('.portal-overview-left'));
  const boardRows = [...document.querySelectorAll('.portal-board-row')];
  const jobRows = [...document.querySelectorAll('.portal-overview-left .portal-job-row')];
  return {
    boardRowCount: boardRows.length,
    tallBoardRows: boardRows.map((el) => Math.round(rect(el).height)).filter((h) => h > 0).sort((a, b) => b - a).slice(0, 3),
    cutOffNumbers: [...document.querySelectorAll('.portal-board-row .portal-job-num')]
      .filter((el) => el.scrollWidth > el.clientWidth + edgeTolerance || rect(el).right > rect(el.closest('.portal-board-row')).right + edgeTolerance)
      .map((el) => el.textContent),
    jobRowCount: jobRows.length,
    strayJobRows: jobRows
      .filter((el) => rect(el).left < column.left - edgeTolerance || rect(el).right > column.right + edgeTolerance)
      .map((el) => el.textContent.slice(0, LABEL_LENGTH)),
    tileCount: document.querySelectorAll('.portal-parts-tile').length,
  };
}

const measureOverview = (page) => page.evaluate(measureStack, '.portal-overview', PAINTED_SELECTOR);

function printMeasure(width, m, sections) {
  console.log(`${width}px  ${m.path}  page ${m.scrollWidth} x ${m.scrollHeight}`);
  sections.forEach((s) => console.log(`  section ${s.name}: height ${s.height}, painted content ${s.painted}`));
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
      const { sections } = m.root === '.portal-overview' ? await measureOverview(page) : { sections: [] };
      printMeasure(width, m, sections);
      await page.close();
    }
  },
  async 'client-layout'({ openPage, check }) {
    let desktopBoardRows;
    for (const width of WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, CLIENT_OVERVIEW_ROUTE, 'client');
      const m = await page.evaluate(measurePage, { roots: PAGE_ROOTS, furthestCount: FURTHEST_COUNT, labelLength: LABEL_LENGTH });
      if (width !== PHONE_WIDTH_PX) {
        const lists = await page.evaluate(measureLists, EDGE_TOLERANCE_PX);
        if (width === WIDTHS_PX[0]) desktopBoardRows = lists.boardRowCount;
        if (width < STACKED_BELOW_PX) {
          const s = await measureOverview(page);
          check(`${width}px page height is at most ${MAX_PAGE_HEIGHT_PX[width]}`, s.pageHeight <= MAX_PAGE_HEIGHT_PX[width], `page ${s.pageHeight}`);
          check(`${width}px schedule rows are at most ${MAX_BOARD_ROW_PX}px tall`, lists.tallBoardRows.every((h) => h <= MAX_BOARD_ROW_PX), `tallest ${lists.tallBoardRows}`);
          check(`${width}px no schedule job number is cut off`, lists.cutOffNumbers.length === 0, lists.cutOffNumbers.join(', '));
          check(`${width}px no job row sticks out of its column`, lists.strayJobRows.length === 0, lists.strayJobRows.join(' | '));
          check(`${width}px shows every job row, schedule row and part tile`,
            lists.jobRowCount === JOB_ROW_COUNT && lists.tileCount === PART_TILE_COUNT && lists.boardRowCount === desktopBoardRows,
            JSON.stringify({ jobs: lists.jobRowCount, tiles: lists.tileCount, board: lists.boardRowCount, desktopBoardRows }));
        }
      }
      check(`${width}px does not scroll sideways`, m.scrollWidth <= width, `scrollWidth ${m.scrollWidth}`);
      if (width === PHONE_WIDTH_PX) {
        check(`${width}px redirects to the job page`, m.path.startsWith('/client-job/'), `landed on ${m.path}`);
      } else if (width < STACKED_BELOW_PX) {
        const s = await measureOverview(page);
        const tall = overTallSections(s.sections, SECTION_SLACK_PX);
        check(`${width}px sections are no taller than their content`, tall.length === 0, JSON.stringify(tall));
        check(`${width}px page height fits its content`, s.pageHeight <= s.expected + PAGE_SLACK_PX, `page ${s.pageHeight}, expected at most ${s.expected + PAGE_SLACK_PX}`);
      } else {
        const s = await measureOverview(page);
        check(`${width}px keeps three columns`, s.columns === THREE_COLUMNS, `${s.columns} columns`);
      }
      await page.close();
    }
  },

  // Proves the checks can fail: each broken stylesheet must be caught by the real checks.
  async 'proof-controls'({ openPage, check }) {
    const tallPage = await openPage({ width: CONTROL_WIDTH_PX, height: PAGE_HEIGHT_PX }, CLIENT_OVERVIEW_ROUTE, 'client');
    await tallPage.addStyleTag({ content: FORCED_TALL_CSS });
    const forced = overTallSections((await measureOverview(tallPage)).sections, SECTION_SLACK_PX);
    check('control: a forced min-height section is flagged as too tall', forced.some((s) => s.name.includes('portal-overview-right')), JSON.stringify(forced));
    await tallPage.close();

    const menuPage = await openPage({ width: CONTROL_WIDTH_PX, height: admin.PAGE_HEIGHT_PX }, admin.OVERVIEW_ROUTE);
    await menuPage.waitForSelector(admin.TOGGLE_SELECTOR);
    await menuPage.addStyleTag({ content: FROZEN_MENU_CSS });
    const results = [];
    const record = (name, isOk) => results.push({ name, isOk });
    await admin.checkMenu({ page: menuPage, index: 0, topPx: admin.TOP_CLEARANCE_PX, label: 'frozen', width: CONTROL_WIDTH_PX, check: record });
    const caught = (text) => results.some((r) => !r.isOk && r.name.includes(text));
    check('control: a frozen menu is flagged after a scroll', caught('follows its toggle after a scroll'), JSON.stringify(results));
    check('control: a frozen menu is flagged after a resize', caught('inside the window after a resize'), JSON.stringify(results));
    await menuPage.close();
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
