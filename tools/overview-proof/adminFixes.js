const PAGE_HEIGHT_PX = 800;
const WIDTH_PX = 1000;
const PAGES = [
  { route: '/job/100', selector: '.jp-part', label: 'job page' },
  { route: '/part/9000', selector: 'input', label: 'part page' },
  { route: '/partlist', selector: '.table-row', label: 'parts page' },
];
const LEVELS = [
  { role: 'admin', level: 3, pages: PAGES },
  { role: 'admin2', level: 2, pages: PAGES },
  { role: 'admin1', level: 1, pages: PAGES.slice(0, 1) },
];

const JOB_ROUTE = '/job/100';
const JOB_WIDTHS_PX = [1440, 1181, 1180, 1000, 901, 900, 768];
const PHONE_WIDTH_PX = 393;
const JOB_LEVELS = [{ role: 'admin', level: 3 }, { role: 'admin2', level: 2 }, { role: 'admin1', level: 1 }];
const PART_ACTIONS = '.jp-part button';
const PART_STAGE = '.jp-part .stage-control';
const PAGE_SCROLL_SLACK_PX = 1;

// Counts part buttons outside their .jp-part box, stage controls, and how far the page scrolls sideways.
const measureJob = (page) => page.evaluate((actionsSel, stageSel, slack) => {
  const outside = [...document.querySelectorAll(actionsSel)].filter((button) => {
    const box = button.closest('.jp-part').getBoundingClientRect();
    const r = button.getBoundingClientRect();
    return r.left < box.left - slack || r.right > box.right + slack || r.top < box.top - slack || r.bottom > box.bottom + slack;
  }).length;
  const root = document.scrollingElement;
  return {
    actions: document.querySelectorAll(actionsSel).length,
    outside,
    stages: document.querySelectorAll(stageSel).length,
    chips: document.querySelectorAll('.jh-sum').length,
    sideways: Math.max(root.scrollWidth - root.clientWidth, ...[...document.querySelectorAll('.admin-main, .jp-grid')].map((el) => el.scrollWidth - el.clientWidth)),
  };
}, PART_ACTIONS, PART_STAGE, PAGE_SCROLL_SLACK_PX);

const EMAIL_ROUTES = ['/job/100', '/part/9000'];
const EMAIL_WIDTHS_PX = [1440, 1000, 768];

// Finds the Emails section by its heading; counts rows, their parts, parts outside the section, and sideways scroll.
const measureEmails = (page) => page.evaluate((slack) => {
  const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Emails');
  const section = heading.parentElement;
  const rows = [...section.querySelectorAll('li')];
  const box = section.getBoundingClientRect();
  const parts = [...section.querySelectorAll('li > div:first-child, li a, li button')];
  const outside = parts.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.left < box.left - slack || r.right > box.right + slack;
  }).length;
  const root = document.scrollingElement;
  return {
    rows: rows.length,
    subjects: rows.filter((li) => li.querySelector('strong')?.textContent.trim()).length,
    opens: rows.filter((li) => li.querySelector('a')?.textContent === 'Open' && li.querySelector('a').href.startsWith('message://')).length,
    deletes: rows.filter((li) => li.querySelector('button')?.textContent === 'Delete').length,
    outside,
    sideways: Math.max(root.scrollWidth - root.clientWidth, ...[...document.querySelectorAll('.admin-main, .jp-grid')].map((el) => el.scrollWidth - el.clientWidth)),
  };
}, PAGE_SCROLL_SLACK_PX);

const OVERVIEW_ROUTE = '/starred-jobs';
const STRIP_SCROLL_WIDTHS_PX = [1000, 768];
const STRIP_WIDTHS_PX = [1440, 1000, 768];
const WIDE_STRIP_WIDTH_PX = 1440;
const STRIP = '.ov-strip';

// Scrolls stage i's button to the bar's right edge, then reports its centre and whether that point hits the button inside the bar.
const locateStage = (page, i) => page.evaluate((sel, index) => {
  const bar = document.querySelector(sel);
  const button = bar.children[index];
  bar.scrollLeft = button.offsetLeft + button.offsetWidth - bar.clientWidth;
  const b = button.getBoundingClientRect();
  const area = bar.getBoundingClientRect();
  const x = b.left + b.width / 2;
  const y = b.top + b.height / 2;
  const isVisible = b.left >= area.left && b.right <= area.right && document.elementFromPoint(x, y)?.closest('button') === button;
  return { x, y, isVisible };
}, STRIP, i);

const isStageOn = (page, i) => page.evaluate((sel, index) => document.querySelector(sel).children[index].classList.contains('on'), STRIP, i);

// Bar scroll range, stage count, how much of the bar the stages fill, and page sideways scroll.
const measureStrip = (page) => page.evaluate((sel) => {
  const bar = document.querySelector(sel);
  const root = document.scrollingElement;
  const last = bar.lastElementChild.getBoundingClientRect();
  return {
    stages: bar.children.length,
    scrollRange: bar.scrollWidth - bar.clientWidth,
    gap: bar.getBoundingClientRect().right - last.right,
    sideways: Math.max(root.scrollWidth - root.clientWidth, ...[...document.querySelectorAll('.admin-main')].map((el) => el.scrollWidth - el.clientWidth)),
  };
}, STRIP);

const JUMP_WIDTHS_PX = [1000, 768];
const TOP_BAR_PX = 52;
const FAR_JOB = 104;
const BOARD_JOB = 100;
const SCROLL_SETTLE_MS = 1200;
const HIGHLIGHT_SEEN_MS = 300;
const HIGHLIGHT_GONE_MS = 2000;
const SCHEDULE_LINKS = '.ov-sched a.portal-board-row';
const BOARD_VIEW_BUTTON = 'Stage board';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hrefOfRows = (page) => page.$$eval(SCHEDULE_LINKS, (links) => links.map((a) => a.getAttribute('href')));
const jumpState = (page) => page.evaluate(() => {
  const jobs = [...document.querySelectorAll('section.ov-job')];
  const hit = jobs.find((el) => el.classList.contains('ov-job--hit'));
  return { path: location.pathname, hit: hit ? hit.querySelector('.no').textContent : null, tops: jobs.map((el) => [el.querySelector('.no').textContent, el.getBoundingClientRect().top]) };
});
const clickRow = (page, id) => page.click(`${SCHEDULE_LINKS}[href="/job/${id}"]`);

const SUITES = {
  async 'schedule-jump'({ openPage, check }) {
    for (const width of JUMP_WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE, 'admin');
      const name = `schedule at ${width}px`;
      const hrefs = await hrefOfRows(page);
      check(`${name} keeps an href on every row`, hrefs.length === 5 && hrefs.every((h) => /^\/job\/\d+$/.test(h)), JSON.stringify(hrefs));
      await clickRow(page, FAR_JOB);
      await sleep(HIGHLIGHT_SEEN_MS);
      const marked = await jumpState(page);
      check(`${name} click stays on the overview`, marked.path === OVERVIEW_ROUTE, marked.path);
      check(`${name} click highlights the job`, marked.hit === String(13800 + FAR_JOB - 100), String(marked.hit));
      await sleep(SCROLL_SETTLE_MS - HIGHLIGHT_SEEN_MS);
      const [, top] = (await jumpState(page)).tops.find(([no]) => no === String(13800 + FAR_JOB - 100));
      check(`${name} click scrolls the job below the top bar`, top >= TOP_BAR_PX - 1 && top < PAGE_HEIGHT_PX, `top ${top}px`);
      await sleep(HIGHLIGHT_GONE_MS - SCROLL_SETTLE_MS);
      check(`${name} highlight fades after about 1.6 seconds`, (await jumpState(page)).hit === null);
      await page.close();
    }

    const page = await openPage({ width: JUMP_WIDTHS_PX[0], height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE, 'admin');
    await page.evaluate((label) => [...document.querySelectorAll('.ov-toggle button')].find((b) => b.textContent === label).click(), BOARD_VIEW_BUTTON);
    await clickRow(page, BOARD_JOB);
    await page.waitForFunction((path) => location.pathname === path, { timeout: SCROLL_SETTLE_MS * 3 }, `/job/${BOARD_JOB}`);
    check('Stage board click opens the job page', true);
    await page.close();
  },

  async 'stage-strip'({ openPage, check }) {
    for (const width of STRIP_WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE, 'admin');
      const m = await measureStrip(page);
      const name = `stage bar at ${width}px`;
      check(`${name} has no sideways page scroll`, m.sideways <= PAGE_SCROLL_SLACK_PX, `${m.sideways}px`);
      if (width === WIDE_STRIP_WIDTH_PX) check(`${name} fills its width`, m.gap <= PAGE_SCROLL_SLACK_PX, `${m.gap}px spare`);
      if (STRIP_SCROLL_WIDTHS_PX.includes(width)) {
        check(`${name} scrolls sideways`, m.scrollRange > 0, `range ${m.scrollRange}px`);
        for (let i = 0; i < m.stages; i += 1) {
          const at = await locateStage(page, i);
          check(`${name} stage ${i + 1} is visible in the bar`, at.isVisible, JSON.stringify(at));
          if (!at.isVisible) continue;
          await page.mouse.click(at.x, at.y);
          check(`${name} stage ${i + 1} turns on when clicked`, await isStageOn(page, i));
          await page.mouse.click(at.x, at.y);
          check(`${name} stage ${i + 1} turns off when clicked again`, !(await isStageOn(page, i)));
        }
      }
      await page.close();
    }
  },

  async 'job-page'({ openPage, check }) {
    for (const { role, level } of JOB_LEVELS) {
      for (const width of JOB_WIDTHS_PX) {
        const page = await openPage({ width, height: PAGE_HEIGHT_PX }, JOB_ROUTE, role);
        const m = await measureJob(page);
        const name = `job page at ${width}px level ${level}`;
        check(`${name} shows part actions`, m.actions > 0, `found ${m.actions}`);
        check(`${name} keeps part actions inside their part`, m.outside === 0, `${m.outside} outside`);
        check(`${name} has no sideways scroll`, m.sideways <= PAGE_SCROLL_SLACK_PX, `${m.sideways}px`);
        check(`${name} shows no stage control`, m.stages === 0, `found ${m.stages}`);
        await page.close();
      }
    }
    for (const { role, level } of JOB_LEVELS) {
      const page = await openPage({ width: PHONE_WIDTH_PX, height: PAGE_HEIGHT_PX }, JOB_ROUTE, role);
      const m = await measureJob(page);
      const name = `job page at ${PHONE_WIDTH_PX}px level ${level}`;
      check(`${name} keeps the part stage control`, m.stages > 0, `found ${m.stages}`);
      check(`${name} shows stage summary chips`, m.chips > 0, `found ${m.chips}`);
      check(`${name} keeps part actions inside their part`, m.outside === 0, `${m.outside} outside`);
      await page.close();
    }
  },

  async emails({ openPage, check }) {
    for (const route of EMAIL_ROUTES) {
      for (const width of EMAIL_WIDTHS_PX) {
        const page = await openPage({ width, height: PAGE_HEIGHT_PX }, route, 'admin');
        const m = await measureEmails(page);
        const name = `${route} emails at ${width}px`;
        check(`${name} show each subject, Open and Delete`, m.rows > 0 && m.subjects === m.rows && m.opens === m.rows && m.deletes === m.rows, JSON.stringify(m));
        check(`${name} stay inside their section`, m.outside === 0, `${m.outside} outside`);
        check(`${name} have no sideways scroll`, m.sideways <= PAGE_SCROLL_SLACK_PX, `${m.sideways}px`);
        await page.close();
      }
    }
  },

  async 'fixes-smoke'({ openPage, check }) {
    for (const { role, level, pages } of LEVELS) {
      for (const { route, selector, label } of pages) {
        const page = await openPage({ width: WIDTH_PX, height: PAGE_HEIGHT_PX }, route, role);
        const found = await page.$$eval(selector, (els) => els.length);
        check(`${label} opens at level ${level}`, found > 0, `found ${found} of ${selector}`);
        await page.close();
      }
    }
  },
};

// Later tasks only add suites above; this runs them all.
SUITES['admin-fixes'] = async (context) => {
  for (const [name, suite] of Object.entries(SUITES)) {
    if (name !== 'admin-fixes') await suite(context);
  }
};

module.exports = { SUITES };
