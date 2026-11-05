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
};

module.exports = { SUITES };
