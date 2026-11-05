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

const SUITES = {
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
