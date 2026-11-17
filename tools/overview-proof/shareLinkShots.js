const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// IDEA-0064 headless shots of the share panels. SHOTS_DIR overrides where the PNGs go.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0064-shots');
const SETTLE_MS = 150;
const MAX_GROW_TRIES = 3;
const COPY_LABEL = 'Copy';
const PANEL = '.share-panel';
const UNSAVED_NOTE = 'Save the quote first';

// A button only counts as shown when it has size and nothing (such as a fixed bar) sits over its centre.
const isButtonClear = (found) => Boolean(found) && found.width > 0 && found.height > 0 && found.isTopmost;

const settle = (page) => page.evaluate((ms) => new Promise((r) => { setTimeout(r, ms); }), SETTLE_MS);

// Measures the first panel's visible Copy button; null when there is none.
const measureCopy = (page) => page.evaluate((selector, label) => {
  const panel = document.querySelector(selector);
  const button = panel && [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  if (!button) return null;
  button.scrollIntoView({ block: 'center' });
  const { width, height, left, top } = button.getBoundingClientRect();
  const hit = document.elementFromPoint(left + width / 2, top + height / 2);
  return { width, height, isTopmost: Boolean(hit) && button.contains(hit) };
}, PANEL, COPY_LABEL);

const panelText = (page) => page.evaluate((selector) => (document.querySelector(selector) || {}).textContent || '', PANEL);

// A fullPage shot keeps fixed bars at the viewport's edges; growing the viewport to the page height puts them at the true edges.
async function growToPage(page, viewport) {
  for (let i = 0; i < MAX_GROW_TRIES; i += 1) {
    const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
    if (height <= page.viewport().height) return;
    await page.setViewport({ width: viewport.width, height });
    await settle(page);
  }
}

async function shoot(page, state, viewport) {
  const file = path.join(shotsDir(), `${state}-${viewport.name}-${viewport.width}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

async function open({ openPage }, viewport, route) {
  const page = await openPage({ width: viewport.width, height: viewport.height }, route, 'admin');
  await settle(page);
  await page.evaluate((selector) => document.querySelector(selector)?.scrollIntoView({ block: 'center' }), PANEL);
  return page;
}

async function shootPanel(page, viewport, state) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await growToPage(page, viewport);
  await shoot(page, state, viewport);
}

async function liveState(context, viewport, { state, route }) {
  const at = `${viewport.width}px`;
  const page = await open(context, viewport, route);
  context.check(`${state} shows a visible, uncovered Copy button at ${at}`, isButtonClear(await measureCopy(page)), '');
  const text = await panelText(page);
  context.check(`${state} shows expiry and opens at ${at}`, /Expires/.test(text) && /Opened 3 times/.test(text), text);
  context.check(`${state} shows Turn off at ${at}`, /Turn off/.test(text), text);
  await shootPanel(page, viewport, state);
  await page.close();
}

async function unsavedState(context, viewport) {
  const at = `${viewport.width}px`;
  const page = await open(context, viewport, '/job/101');
  const text = await panelText(page);
  context.check(`job-quote-unsaved says ${UNSAVED_NOTE} at ${at}`, text.includes(UNSAVED_NOTE), text);
  context.check(`job-quote-unsaved offers no usable Copy at ${at}`, (await measureCopy(page)) === null, text);
  await shootPanel(page, viewport, 'job-quote-unsaved');
  await page.close();
}

async function copiedState(context, viewport) {
  const at = `${viewport.width}px`;
  const page = await open(context, viewport, '/job/100');
  const origin = new URL(page.url()).origin;
  await page.browser().defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write']);
  const found = await measureCopy(page);
  context.check(`job-quote-copied shows a visible, uncovered Copy button at ${at}`, isButtonClear(found), JSON.stringify(found));
  await page.evaluate((selector, label) => [...document.querySelector(selector).querySelectorAll('button')].find((b) => b.textContent.trim() === label).click(), PANEL, COPY_LABEL);
  await settle(page);
  const text = await panelText(page);
  const hasManualBox = (await page.$(`${PANEL} input[aria-label="Share link"]`)) !== null;
  context.check(`job-quote-copied shows Copied or the manual link box at ${at}`, /Copied/.test(text) || hasManualBox, text);
  await shootPanel(page, viewport, 'job-quote-copied');
  await page.close();
}

const SUITES = {
  async 'share-link-shots'(context) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    for (const viewport of VIEWPORTS) {
      await liveState(context, viewport, { state: 'job-quote-share', route: '/job/100' });
      await unsavedState(context, viewport);
      await copiedState(context, viewport);
      await liveState(context, viewport, { state: 'part-qc-share', route: '/part/9000' });
    }
    console.log(`share link shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES, isButtonClear };
