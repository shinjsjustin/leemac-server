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

const SUITES = {
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
