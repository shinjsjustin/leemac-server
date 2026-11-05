const CLIENT_OVERVIEW_ROUTE = '/client-overview';
const PAGE_HEIGHT_PX = 800;
const WIDTHS_PX = [1400, 1199, 1000, 768, 600, 393];
const PAGE_ROOTS = ['.portal-overview', '.portal-job-page'];
const FURTHEST_COUNT = 5;
const LABEL_LENGTH = 40;

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
};

module.exports = { SUITES };
