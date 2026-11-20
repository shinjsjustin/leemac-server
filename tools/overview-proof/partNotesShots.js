const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// IDEA-0065 headless shots of the admin note screens, logged in as a level 3 admin. SHOTS_DIR overrides where the PNGs go.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0065-shots');
const SETTLE_MS = 150;
const LOAD_TIMEOUT_MS = 10000;
const SPILL_SLACK_PX = 1;
const MAX_GROW_TRIES = 3;
const MIN_NOTE_TEXT_PX = 220;
// A tab label on one line is about one line tall; two lines are well over this many line heights.
const ONE_LINE_HEIGHTS = 1.5;

const PRIVATE = 'Private (Leemac only)';
const SHARED = 'Shared with client';
const STATES = [
  {
    state: 'admin-part',
    route: '/part/9000',
    ready: '.part-steps-text',
    scope: '.part-info-section',
    labels: ['Messages', 'Job #13800', 'Part only', PRIVATE, SHARED, 'Process Steps', 'Pat Example (client)'],
  },
  {
    state: 'admin-part-edit',
    route: '/part/9000',
    ready: '.part-steps-text',
    clickText: 'Edit',
    after: '.part-steps-input',
    scope: '.part-info-section',
    labels: ['Process Steps', 'Save', 'Cancel'],
  },
  {
    state: 'job-notes',
    route: '/job/100',
    ready: '.jn-note',
    scope: '.js-tabs, .jn-list, .jn-compose',
    checksTabs: true,
    labels: [`${PRIVATE} 2`, `${SHARED} 2`, 'HSX-BRACKET-9000'],
    // The phone job card leaves these part fields out; they show only on the desktop row.
    desktopLabels: ['Prints on quote / invoice', 'Shop note (Leemac only)'],
  },
  {
    state: 'simple-card',
    route: '/simple-overview',
    ready: '.sm-card',
    scope: '.sm-card',
    labels: ['Pat Example (고객)', '비공개', '공유'],
  },
];

// Boxes whose text overflows sideways or downward, so a label that wraps or spills is caught.
const labelsFit = (boxes) => boxes.filter((b) => b.scrollWidth > b.clientWidth + SPILL_SLACK_PX || b.scrollHeight > b.clientHeight + SPILL_SLACK_PX);
const narrowBlocks = (widths, minPx) => widths.filter((w) => w < minPx);

const settle = (page) => page.evaluate((ms) => new Promise((r) => { setTimeout(r, ms); }), SETTLE_MS);

// Only the screens' note areas are measured: the page around them (drawing rows, side menu) has its own layout.
const measure = (page, scope) => page.evaluate((selector) => {
  // Each button's text as a box: wider than the button, or taller than one line, means it spills or wraps.
  const textBoxes = (buttons) => [...document.querySelectorAll(buttons)].map((button) => {
    const range = document.createRange();
    range.selectNodeContents(button);
    const lineHeight = parseFloat(getComputedStyle(button).fontSize) * 1.5;
    const text = range.getBoundingClientRect();
    return { label: button.textContent.trim(), scrollWidth: Math.max(button.scrollWidth, text.width), clientWidth: button.clientWidth, scrollHeight: text.height, clientHeight: Math.min(lineHeight, button.clientHeight) };
  });
  const inScope = [...document.querySelectorAll(selector)].flatMap((root) => [root, ...root.querySelectorAll('*')]);
  return {
    text: document.body.innerText,
    furthestRight: Math.max(0, ...inScope.map((el) => el.getBoundingClientRect().right)),
    // Boxes that scroll or clip sideways hide content off-screen even when the page itself fits.
    clipped: inScope.filter((el) => {
      const { overflowX } = getComputedStyle(el);
      return overflowX !== 'visible' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
    }).map((el) => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`),
    scopeCount: inScope.length,
    tabs: textBoxes('.js-tabs button'),
    // The part row's Download PDF / Print buttons beside the drawing thumbnail.
    drawButtons: textBoxes('.jp-draw button'),
    noteWidths: [...document.querySelectorAll('.jn-note > span:not(.jn-vis)')].map((el) => el.getBoundingClientRect().width),
  };
}, scope);

const pageWidth = (page) => page.evaluate(() => document.scrollingElement.scrollWidth);

// Grow the viewport to the page height so a fixed bar sits at the true bottom of the full-page shot.
async function growToPage(page, viewport) {
  for (let i = 0; i < MAX_GROW_TRIES; i += 1) {
    const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
    if (height <= page.viewport().height) return;
    await page.setViewport({ width: viewport.width, height });
    await settle(page);
  }
}

async function clickButton(page, text) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
    if (button) button.click();
    return Boolean(button);
  }, text);
  return clicked;
}

async function waitFor(context, page, selector, name) {
  try {
    await page.waitForSelector(selector, { timeout: LOAD_TIMEOUT_MS });
  } catch (e) {
    context.check(name, false, e.message);
  }
}

async function shootState(context, viewport, { state, route, ready, clickText, after, scope, labels, desktopLabels = [], checksTabs = false }) {
  const at = `${viewport.width}px`;
  const page = await context.openPage({ width: viewport.width, height: viewport.height }, route);
  await waitFor(context, page, ready, `${state} finishes loading at ${at}`);
  if (clickText) {
    context.check(`${state} has a ${clickText} button at ${at}`, await clickButton(page, clickText), clickText);
    await waitFor(context, page, after, `${state} opens the editor at ${at}`);
  }
  await settle(page);
  const found = await measure(page, scope);
  context.check(`${state} has note content to measure at ${at}`, found.scopeCount > 0, scope);
  const expected = viewport.name === 'desktop' ? [...labels, ...desktopLabels] : labels;
  expected.forEach((label) => context.check(`${state} shows "${label}" at ${at}`, found.text.includes(label), found.text));
  context.check(`${state} note content stays inside the viewport width at ${at}`, found.furthestRight <= viewport.width + SPILL_SLACK_PX, `right edge ${found.furthestRight}`);
  const scrollWidth = await pageWidth(page);
  context.check(`${state} whole page fits the viewport width at ${at}`, scrollWidth <= viewport.width + SPILL_SLACK_PX, `page scroll width ${scrollWidth}`);
  if (checksTabs) {
    const spilled = labelsFit(found.tabs);
    context.check(`${state} tab labels stay on one line inside their buttons at ${at}`, spilled.length === 0, JSON.stringify(spilled));
    const drawSpilled = labelsFit(found.drawButtons);
    context.check(`${state} part row drawing buttons stay on one line inside their buttons at ${at}`, drawSpilled.length === 0, JSON.stringify(drawSpilled));
  }
  if (checksTabs && viewport.name === 'desktop') {
    const narrow = narrowBlocks(found.noteWidths, MIN_NOTE_TEXT_PX);
    context.check(`${state} note text is at least ${MIN_NOTE_TEXT_PX}px wide at ${at}`, narrow.length === 0, narrow.join(', '));
  }
  context.check(`${state} hides no content in a sideways scroll box at ${at}`, found.clipped.length === 0, found.clipped.join(', '));
  await growToPage(page, viewport);
  await page.screenshot({ path: path.join(shotsDir(), `${state}-${viewport.name}-${viewport.width}.png`), fullPage: true });
  await page.close();
}

const SUITES = {
  async 'part-notes-shots'(context) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    const only = (process.env.PART_NOTES_STATES || '').split(',').map((n) => n.trim()).filter(Boolean);
    const states = only.length ? STATES.filter((s) => only.includes(s.state)) : STATES;
    for (const viewport of VIEWPORTS) {
      for (const state of states) await shootState(context, viewport, state);
    }
    console.log(`part notes shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES, labelsFit, narrowBlocks };
