const { isInsideViewport, rectsMatch, followsAnchor } = require('./checks');

const OVERVIEW_ROUTE = '/starred-jobs';
const PAGE_HEIGHT_PX = 800;
const WIDTHS_PX = [1000, 768, 393];
// Keeps the toggle clear of the sticky top bar (52px, taller when it wraps on a phone) and the phone tab bar (64px) so it can be clicked.
const TOP_CLEARANCE_PX = 120;
const BOTTOM_CLEARANCE_PX = 72;
const TOGGLE_SIZE_PX = 28;
const TOGGLE_SELECTOR = 'button[aria-label="Job options"]';
const ITEM_SELECTOR = '.jpm-menu [role="menuitem"]';
const STAGE_TRIGGERS = {
  'chip menu': '.ov-prow .stage-control .chip',
};
const STAGE_ITEM_SELECTOR = '.stage-control .menu button';
const STAGE_WIDTHS_PX = [1000, 768];
const PHONE_WIDTH_PX = 393;
const TRAY_ARROWS = '.ov-prow button[aria-expanded]';
const TRAY_MACHINING = '.ov-prow .tray .stagebar > button[title="Machining"]';
const LAST_LOADED_OPTION = 'Print all part drawings';
// 5 documents, the drawings and Unstar Job.
const JOB_MENU_OPTION_COUNT = 7;
const SCROLL_STEP_PX = 40;
const RESIZE_SHRINK_PX = 100;
const MENU_SELECTOR = '.jpm-menu';
const OPEN_TOGGLE_SELECTOR = `${TOGGLE_SELECTOR}[aria-expanded="true"]`;
const SHEET_SELECTOR = '.sheet';

const UNSTAR_PATH = '/api/internal/job/unstarjob';

// Scrolls the nearest scrolling ancestor (or the window) so the toggle's top sits at topPx.
async function placeToggle(page, index, topPx, selector = TOGGLE_SELECTOR) {
  await page.$$eval(selector, (buttons, i, top) => {
    const button = buttons[i];
    const isScroller = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight;
    let scroller = button.parentElement;
    while (scroller && !isScroller(scroller)) scroller = scroller.parentElement;
    const delta = button.getBoundingClientRect().top - top;
    if (scroller) scroller.scrollTop += delta;
    else window.scrollBy(0, delta);
  }, index, topPx);
}

// Checks every option matching selector is on screen and not covered.
async function checkOptions({ page, selector, name, check, expectedCount = 0 }) {
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const options = await page.$$eval(selector, (els) => els.map((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      isHit: Boolean(hit) && el.contains(hit),
    };
  }));
  const hasCount = expectedCount ? options.length === expectedCount : options.length > 0;
  check(`${name} has ${expectedCount ? `all ${expectedCount}` : 'its'} options`, hasCount, `found ${options.length}`);
  check(`${name} options are inside the window`, options.every((o) => isInsideViewport(o.rect, viewport)), JSON.stringify(options.map((o) => o.rect)));
  check(`${name} options are not covered`, options.every((o) => o.isHit), `${options.filter((o) => !o.isHit).length} covered`);
}

// Waits for the menu's scroll and resize listeners to place it again.
const nextFrames = (page) => page.evaluate(() => new Promise((done) => {
  requestAnimationFrame(() => requestAnimationFrame(done));
}));

// Rectangles of the open toggle and its menu.
const menuAnchor = (page) => page.evaluate((toggleSelector, menuSelector) => {
  const plain = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  return { toggle: plain(document.querySelector(toggleSelector)), menu: plain(document.querySelector(menuSelector)) };
}, OPEN_TOGGLE_SELECTOR, MENU_SELECTOR);

// Scrolls the open toggle's scroller (or the window) by stepPx, down when there is room and up otherwise.
async function scrollTowardRoom(page, stepPx) {
  await page.evaluate((step, toggleSelector) => {
    const isScroller = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight;
    let scroller = document.querySelector(toggleSelector).parentElement;
    while (scroller && !isScroller(scroller)) scroller = scroller.parentElement;
    const target = scroller || document.scrollingElement;
    const roomDown = target.scrollHeight - target.clientHeight - target.scrollTop;
    target.scrollTop += roomDown >= step ? step : -Math.min(step, target.scrollTop);
  }, stepPx, OPEN_TOGGLE_SELECTOR);
  await nextFrames(page);
}

// Opens the menu of one job and checks every option is on screen and not covered.
async function checkMenu({ page, index, topPx, label, width, check }) {
  await placeToggle(page, index, topPx);
  const toggles = await page.$$(TOGGLE_SELECTOR);
  await toggles[index].click();
  // Unstar Job shows before the printables load, so wait for the last loaded option.
  await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].some((el) => el.textContent === text), {}, ITEM_SELECTOR, LAST_LOADED_OPTION);
  const name = `job menu ${label} at ${width}px`;
  await checkOptions({ page, selector: ITEM_SELECTOR, name, check, expectedCount: JOB_MENU_OPTION_COUNT });
  const before = await menuAnchor(page);
  await scrollTowardRoom(page, SCROLL_STEP_PX);
  const after = await menuAnchor(page);
  check(`${name} follows its toggle after a scroll`, followsAnchor(before, after), JSON.stringify({ before, after }));
  await checkOptions({ page, selector: ITEM_SELECTOR, name: `${name} after a scroll`, check, expectedCount: JOB_MENU_OPTION_COUNT });
  const oldBottom = (await menuAnchor(page)).menu.bottom;
  await page.setViewport({ width, height: Math.round(oldBottom) - RESIZE_SHRINK_PX });
  await nextFrames(page);
  const shrunk = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const { menu } = await menuAnchor(page);
  check(`${name} is inside the window after a resize`, isInsideViewport(menu, shrunk), JSON.stringify({ menu, shrunk }));
  await page.setViewport({ width, height: PAGE_HEIGHT_PX });
  await page.keyboard.press('Escape');
}

// Opens one stage menu and checks every option is on screen and not covered.
async function checkStageMenu({ page, selector, index, topPx, label, width, check }) {
  await placeToggle(page, index, topPx, selector);
  await (await page.$$(selector))[index].click();
  await page.waitForSelector(STAGE_ITEM_SELECTOR);
  await checkOptions({ page, selector: STAGE_ITEM_SELECTOR, name: `${label} at ${width}px`, check });
  await page.keyboard.press('Escape');
}

// Opens the tray of one row, presses Machining and checks the machine list.
async function checkTrayMachineList({ page, index, topPx, label, width, check }) {
  await placeToggle(page, index, topPx, TRAY_ARROWS);
  await (await page.$$(TRAY_ARROWS))[index].click();
  await page.waitForSelector(TRAY_MACHINING);
  await page.click(TRAY_MACHINING);
  await page.waitForSelector(STAGE_ITEM_SELECTOR);
  await checkOptions({ page, selector: STAGE_ITEM_SELECTOR, name: `tray machine list ${label} at ${width}px`, check });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
}

const TRAY_PARTS = ['.chip', '.flag.urgent', '.flag.waiting', '.seen', '.tray-toggle'];
const ACTION_TILES = '.acts button';

// Rectangles of every element in the first row that is not part of the tray.
const rowRects = (page) => page.$eval('.ov-prow', (row) => [row, ...row.querySelectorAll('*')]
  .filter((el) => !el.closest('.tray'))
  .map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }));

// Rectangles of the stage chip, flags, since text, arrows and action tiles of the first row.
const partRects = (page) => page.$eval('.ov-prow', (row, parts, tiles) => (
  [...parts.map((s) => row.querySelector(s)), ...row.querySelectorAll(tiles)].map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  })
), TRAY_PARTS, ACTION_TILES);

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const hasOverlap = (rects) => rects.some((a, i) => rects.slice(i + 1).some((b) => overlaps(a, b)));

const SUITES = {
  async unstar({ openPage, check }) {
    const page = await openPage({ width: 1000, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE);
    const sent = [];
    page.on('request', (request) => {
      if (request.method() === 'DELETE' && request.url().endsWith(UNSTAR_PATH)) sent.push(JSON.parse(request.postData()));
    });
    await page.waitForSelector(TOGGLE_SELECTOR);
    const jobsBefore = (await page.$$('.ov-job')).length;
    const partsInFirstJob = await page.$$eval('.ov-job:first-of-type .ov-prow', (rows) => rows.length);
    await (await page.$$(TOGGLE_SELECTOR))[0].click();
    await page.waitForSelector(ITEM_SELECTOR);
    const labels = await page.$$eval(ITEM_SELECTOR, (els) => els.map((el) => el.textContent));
    check('job menu has Unstar Job', labels.includes('Unstar Job'), JSON.stringify(labels));
    await page.evaluate((selector) => {
      [...document.querySelectorAll(selector)].find((el) => el.textContent === 'Unstar Job').click();
    }, ITEM_SELECTOR);
    await page.waitForFunction((n) => document.querySelectorAll('.ov-job').length === n, {}, jobsBefore - 1);
    check('Unstar Job sends one request per part', sent.length === partsInFirstJob, `sent ${sent.length} for ${partsInFirstJob} parts`);
    check('Unstar Job sends only jobPartId', sent.every((b) => Object.keys(b).join() === 'jobPartId'), JSON.stringify(sent));
    check('Unstar Job asks no confirm', (await page.$('[role="dialog"]')) === null);
    await page.close();
  },
  async tray({ openPage, check }) {
    for (const width of STAGE_WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE);
      await page.waitForSelector(TRAY_ARROWS);
      const name = `tray at ${width}px`;
      check(`${name} collapsed shows no stage bar`, (await page.$('.ov-prow .stagebar')) === null);
      check(`${name} chip, flags and tiles do not overlap`, !hasOverlap(await partRects(page)), JSON.stringify(await partRects(page)));
      const before = await rowRects(page);
      await page.click(TRAY_ARROWS);
      await page.waitForSelector('.ov-prow .tray .stagebar');
      const after = await rowRects(page);
      check(`${name} opening moves no other element`, rectsMatch(before, after), 'row rectangles changed');
      check(`${name} open chip, flags and tiles do not overlap`, !hasOverlap(await partRects(page)));
      await page.click(TRAY_MACHINING);
      check(`${name} machine list opens inside the tray`, (await page.$('.ov-prow .tray .menu')) !== null);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      check(`${name} Escape twice collapses the tray`, (await page.$('.ov-prow .tray')) === null);
      const count = (await page.$$(TRAY_ARROWS)).length;
      const common = { page, width, check };
      await checkTrayMachineList({ ...common, index: 0, topPx: TOP_CLEARANCE_PX, label: 'near the top' });
      await checkTrayMachineList({ ...common, index: count - 1, topPx: PAGE_HEIGHT_PX - BOTTOM_CLEARANCE_PX - TOGGLE_SIZE_PX, label: 'near the bottom' });
      await page.close();
    }
    const phone = await openPage({ width: PHONE_WIDTH_PX, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE);
    await phone.waitForSelector('.ov-prow .stage-control .chip.big');
    check(`row at ${PHONE_WIDTH_PX}px has no tray`, (await phone.$(TRAY_ARROWS)) === null);
    await phone.click('.ov-prow .stage-control .chip.big');
    await phone.waitForSelector(SHEET_SELECTOR);
    check(`bottom sheet opens at ${PHONE_WIDTH_PX}px`, true);
    await phone.close();
  },
  async 'stage-menus'({ openPage, check }) {
    for (const width of STAGE_WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE);
      for (const [name, selector] of Object.entries(STAGE_TRIGGERS)) {
        await page.waitForSelector(selector);
        const count = (await page.$$(selector)).length;
        const common = { page, width, check, selector };
        await checkStageMenu({ ...common, index: 0, topPx: TOP_CLEARANCE_PX, label: `${name} near the top` });
        await checkStageMenu({ ...common, index: count - 1, topPx: PAGE_HEIGHT_PX - BOTTOM_CLEARANCE_PX - TOGGLE_SIZE_PX, label: `${name} near the bottom` });
      }
      await page.close();
    }
    const phone = await openPage({ width: PHONE_WIDTH_PX, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE);
    await phone.waitForSelector('.ov-prow .stage-control .chip');
    await (await phone.$('.ov-prow .stage-control .chip')).click();
    await phone.waitForSelector(SHEET_SELECTOR);
    check(`stage sheet opens at ${PHONE_WIDTH_PX}px`, true);
    await phone.close();
  },
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

// Not part of admin: it fails on purpose, to prove an unstubbed call fails the run.
SUITES['no-fixture'] = async ({ openPage }) => {
  const page = await openPage({ width: 1000, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE);
  await page.evaluate(() => fetch('http://api.invalid/api/internal/nothing').catch(() => null));
  await page.close();
};

SUITES.admin = async (context) => {
  for (const name of ['job-menu', 'stage-menus', 'tray', 'unstar']) await SUITES[name](context);
};

module.exports = { SUITES, checkMenu, TOGGLE_SELECTOR, OVERVIEW_ROUTE, TOP_CLEARANCE_PX, PAGE_HEIGHT_PX };
