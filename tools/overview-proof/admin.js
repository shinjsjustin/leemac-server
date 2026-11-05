const fixtures = require('./fixtures');
const { isInsideViewport } = require('./checks');

const OVERVIEW_ROUTE = '/starred-jobs';
const PAGE_HEIGHT_PX = 800;
const WIDTHS_PX = [1000, 768, 393];
// Keeps the toggle clear of the sticky top bar (52px, taller when it wraps on a phone) and the phone tab bar (64px) so it can be clicked.
const TOP_CLEARANCE_PX = 120;
const BOTTOM_CLEARANCE_PX = 72;
const TOGGLE_SIZE_PX = 28;
const TOGGLE_SELECTOR = 'button[aria-label="Job options"]';
const ITEM_SELECTOR = '.jpm-menu [role="menuitem"]';

const printable = (type, label, reason = null) => ({ type, label, file_id: reason ? null : 5, filename: `${type}.pdf`, reason });
const PRINTABLES = {
  documents: [
    printable('quote', 'Quote'),
    printable('order', 'Order', 'Not made yet'),
    printable('invoice', 'Invoice', 'Click Update invoice first'),
    printable('packing', 'Packing list', 'Click Update invoice first'),
    printable('shipping', 'Shipping label', 'Click Update invoice first'),
  ],
  drawings: 6,
};

// The harness takes replyFor from this module when it loads, so run.js must
// require this file first for the print menu call to be answered.
const baseReplyFor = fixtures.replyFor;
fixtures.replyFor = (method, url) => (
  method === 'GET' && url.startsWith('/api/internal/print/job?') ? { status: 200, body: PRINTABLES } : baseReplyFor(method, url)
);

// Scrolls the nearest scrolling ancestor (or the window) so the toggle's top sits at topPx.
async function placeToggle(page, index, topPx) {
  await page.$$eval(TOGGLE_SELECTOR, (buttons, i, top) => {
    const button = buttons[i];
    const isScroller = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight;
    let scroller = button.parentElement;
    while (scroller && !isScroller(scroller)) scroller = scroller.parentElement;
    const delta = button.getBoundingClientRect().top - top;
    if (scroller) scroller.scrollTop += delta;
    else window.scrollBy(0, delta);
  }, index, topPx);
}

// Opens the menu of one job and checks every option is on screen and not covered.
async function checkMenu({ page, index, topPx, label, width, check }) {
  await placeToggle(page, index, topPx);
  const toggles = await page.$$(TOGGLE_SELECTOR);
  await toggles[index].click();
  await page.waitForSelector(ITEM_SELECTOR);
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const options = await page.$$eval(ITEM_SELECTOR, (els) => els.map((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      isHit: Boolean(hit) && el.contains(hit),
    };
  }));
  const name = `job menu ${label} at ${width}px`;
  check(`${name} has options`, options.length > 0, `found ${options.length}`);
  check(`${name} options are inside the window`, options.every((o) => isInsideViewport(o.rect, viewport)), JSON.stringify(options.map((o) => o.rect)));
  check(`${name} options are not covered`, options.every((o) => o.isHit), `${options.filter((o) => !o.isHit).length} covered`);
  await page.keyboard.press('Escape');
}

const SUITES = {
  async 'job-menu'({ openPage, check }) {
    for (const width of WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE);
      await page.waitForSelector(TOGGLE_SELECTOR);
      const count = (await page.$$(TOGGLE_SELECTOR)).length;
      const common = { page, width, check };
      await checkMenu({ ...common, index: 0, topPx: TOP_CLEARANCE_PX, label: 'near the top' });
      await checkMenu({ ...common, index: count - 1, topPx: PAGE_HEIGHT_PX - BOTTOM_CLEARANCE_PX - TOGGLE_SIZE_PX, label: 'near the bottom' });
      await checkMenu({ ...common, index: Math.floor(count / 2), topPx: PAGE_HEIGHT_PX / 2, label: 'in the middle' });
      await page.close();
    }
  },
};

module.exports = { SUITES };
