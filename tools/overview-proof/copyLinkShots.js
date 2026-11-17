const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// IDEA-0064 headless shots. SHOTS_DIR overrides where the PNGs go.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0064-shots');
const SETTLE_MS = 150;
const MAX_GROW_TRIES = 3;
const BUTTON_TEXT = 'Copy client link';
const COPY_PAGES = [{ state: 'part-copy', route: '/part/9000' }, { state: 'job-copy', route: '/job/100' }];
const CLIENT_ROUTE = '/client-part/9000';
const LOGIN_PATH = `/client-login?next=${encodeURIComponent(CLIENT_ROUTE)}`;

// A button only counts as shown when it has size and nothing (such as a fixed bar) sits over its centre.
const isButtonClear = (found) => Boolean(found) && found.width > 0 && found.height > 0 && found.isTopmost;

const MIN_CONTRAST = 4.5;
const LINE_SLACK_PX = 1;

const channels = (rgb) => (String(rgb).match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
const luminance = (rgb) => {
  const [r, g, b] = channels(rgb).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG contrast ratio between two rgb() colours.
const contrastRatio = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

const isNoteReadable = (note) => Boolean(note) && contrastRatio(note.color, note.background) >= MIN_CONTRAST;

// The button must not move when the note appears, and must share the Back button's row.
const staysInLine = (pos) => {
  if (!pos || !pos.before || !pos.after || !pos.back) return false;
  const centre = (pos.before.top + pos.before.bottom) / 2;
  return Math.abs(pos.after.top - pos.before.top) <= LINE_SLACK_PX && centre >= pos.back.top && centre <= pos.back.bottom;
};

const settle = (page) => page.evaluate((ms) => new Promise((r) => { setTimeout(r, ms); }), SETTLE_MS);

const buttonBox = (page, text) => page.evaluate((label) => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  if (!button) return null;
  const { top, bottom } = button.getBoundingClientRect();
  return { top, bottom };
}, text);

const backBox = (page) => page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Back'));
  if (!button) return null;
  const { top, bottom } = button.getBoundingClientRect();
  return { top, bottom };
});

// The note's text colour and the first opaque background behind it.
const noteColours = (page) => page.evaluate(() => {
  const note = document.querySelector('.copy-link small');
  if (!note) return null;
  let el = note;
  let background = 'rgb(255, 255, 255)';
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) { background = bg; break; }
    el = el.parentElement;
  }
  return { color: getComputedStyle(note).color, background };
});

// Measures the first visible Copy client link button; null when there is none.
const measureButton = (page, text) => page.evaluate((label) => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label && b.getBoundingClientRect().width > 0);
  if (!button) return null;
  const { width, height, left, top } = button.getBoundingClientRect();
  const hit = document.elementFromPoint(left + width / 2, top + height / 2);
  return { width, height, isTopmost: Boolean(hit) && button.contains(hit) };
}, text);

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

async function copyStates({ openPage, check }, viewport, { state, route }) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, route, 'admin');
  await settle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await growToPage(page, viewport);
  const found = await measureButton(page, BUTTON_TEXT);
  check(`${state} shows a visible, uncovered ${BUTTON_TEXT} button at ${at}`, isButtonClear(found), JSON.stringify(found));
  await shoot(page, state, viewport);

  if (state === 'part-copy') {
    const origin = new URL(page.url()).origin;
    await page.browser().defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write']);
    const before = await buttonBox(page, BUTTON_TEXT);
    const back = await backBox(page);
    await page.evaluate((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label).click(), BUTTON_TEXT);
    await settle(page);
    const note = await page.evaluate(() => (document.querySelector('.copy-link small') || {}).textContent || '');
    check(`part-copied shows Copied or the manual link box at ${at}`, /Copied|Press Ctrl\+C/.test(note), note);
    const colours = await noteColours(page);
    check(`part-copied note is readable (contrast >= ${MIN_CONTRAST}) at ${at}`, isNoteReadable(colours), JSON.stringify(colours));
    const pos = { before, after: await buttonBox(page, BUTTON_TEXT), back };
    check(`part-copied keeps ${BUTTON_TEXT} in line with Back at ${at}`, staysInLine(pos), JSON.stringify(pos));
    await shoot(page, 'part-copied', viewport);
  }
  await page.close();
}

// The harness always stores a token, so a page in a fresh browser context (own storage) stands in for a logged-out visitor.
async function clientLoginState({ openPage, check }, viewport) {
  const at = `${viewport.width}px`;
  const first = await openPage({ width: viewport.width, height: viewport.height }, '/client-login', 'client');
  const origin = new URL(first.url()).origin;
  const context = await first.browser().createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height });
  await page.goto(`${origin}${CLIENT_ROUTE}`, { waitUntil: 'networkidle0' });
  await settle(page);
  const { pathname, search } = new URL(page.url());
  check(`client-part-login lands on ${LOGIN_PATH} at ${at}`, `${pathname}${search}` === LOGIN_PATH, `${pathname}${search}`);
  await shoot(page, 'client-part-login', viewport);
  await context.close();
  await first.close();
}

const SUITES = {
  async 'copy-link-shots'(context) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    for (const viewport of VIEWPORTS) {
      for (const target of COPY_PAGES) await copyStates(context, viewport, target);
      await clientLoginState(context, viewport);
    }
    console.log(`copy link shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES, isButtonClear, contrastRatio, isNoteReadable, staysInLine };
