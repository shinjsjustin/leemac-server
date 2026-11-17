const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// IDEA-0064 headless shots of the public share pages, opened with no stored login. SHOTS_DIR overrides where the PNGs go.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0064-shots');
const SETTLE_MS = 150;
const LOAD_TIMEOUT_MS = 10000;
const SPILL_SLACK_PX = 1;
const GONE_TOKEN = 'gone';
const STATES = [
  { state: 'share-quote', route: '/share/quote/proof-token', ready: 'table.portal-share-table' },
  { state: 'share-qc', route: '/share/qc/proof-token', ready: '.portal-qc-photos-main img' },
  { state: 'share-not-found', route: `/share/quote/${GONE_TOKEN}`, ready: '.portal-message' },
];

const settle = (page) => page.evaluate((ms) => new Promise((r) => { setTimeout(r, ms); }), SETTLE_MS);

// Runs in the page before the app. The harness stores a fake login on every load, so drop it. It also
// puts the body's token on share calls' query (fixtures see no body) and turns file replies into real bytes.
function prepareSharePage() {
  localStorage.removeItem('token');
  const realFetch = window.fetch;
  window.fetch = async (url, init = {}) => {
    const isShare = String(url).includes('/api/share/');
    const token = isShare && init.body ? JSON.parse(init.body).token : null;
    const response = await realFetch(token ? `${url}?token=${encodeURIComponent(token)}` : url, init);
    const isFile = /\/(quote\/pdf|qc\/drawing|qc\/photo)$/.test(String(url));
    if (!isFile || !response.ok) return response;
    const { content, mimetype } = await response.json();
    const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': mimetype } });
  };
}

async function openLoggedOut({ openPage }, viewport, route) {
  // Any static file loads the harness page without starting the app; then the next load runs the cleanup after the harness's login.
  const page = await openPage({ width: viewport.width, height: viewport.height }, '/favicon.png');
  await page.evaluateOnNewDocument(prepareSharePage);
  await page.goto(`${new URL(page.url()).origin}${route}`, { waitUntil: 'networkidle0' });
  return page;
}

const measure = (page) => page.evaluate(() => ({
  text: document.body.innerText,
  hasLogin: [...document.querySelectorAll('a')].some((a) => a.textContent.trim() === 'Log in' && a.getAttribute('href') === '/client-login'),
  navCount: document.querySelectorAll('nav').length,
  scrollWidth: document.scrollingElement.scrollWidth,
  // Boxes that scroll or clip sideways hide content off-screen even when the page itself fits.
  clipped: [...document.querySelectorAll('body *')].filter((el) => {
    const { overflowX } = getComputedStyle(el);
    return overflowX !== 'visible' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
  }).map((el) => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`),
  markCount: document.querySelectorAll('.portal-qc-mark--leemac').length,
  photoCount: document.querySelectorAll('.portal-qc-photos-main img').length,
}));

function contentChecks({ check }, state, found, at) {
  const { text } = found;
  if (state === 'share-quote') {
    check(`share-quote shows line items, Total and View PDF at ${at}`, /HSX-BRACKET-9001/.test(text) && /Total/.test(text) && /View PDF/.test(text), text);
  }
  if (state === 'share-qc') {
    check(`share-qc shows Leemac markings at ${at}`, found.markCount === 2, `found ${found.markCount}`);
    check(`share-qc shows photos at ${at}`, found.photoCount === 2, `found ${found.photoCount}`);
    check(`share-qc shows no job number or PO at ${at}`, !/\bjob\b|\bPO\b|1380\d/i.test(text), text);
  }
  if (state === 'share-not-found') {
    check(`share-not-found shows the plain message at ${at}`, /couldn't find that quote/.test(text) && /expired or been turned off/.test(text), text);
  }
}

async function shootState(context, viewport, { state, route, ready }) {
  const at = `${viewport.width}px`;
  const page = await openLoggedOut(context, viewport, route);
  try {
    await page.waitForSelector(ready, { timeout: LOAD_TIMEOUT_MS });
  } catch (e) {
    context.check(`${state} finishes loading at ${at}`, false, e.message);
  }
  await settle(page);
  const found = await measure(page);
  context.check(`${state} shows the Log in link at ${at}`, found.hasLogin, found.text);
  context.check(`${state} shows no portal nav bar at ${at}`, found.navCount === 0, `found ${found.navCount} nav`);
  context.check(`${state} stays inside the viewport width at ${at}`, found.scrollWidth <= viewport.width + SPILL_SLACK_PX, `scrollWidth ${found.scrollWidth}`);
  context.check(`${state} hides no content in a sideways scroll box at ${at}`, found.clipped.length === 0, found.clipped.join(', '));
  contentChecks(context, state, found, at);
  await page.screenshot({ path: path.join(shotsDir(), `${state}-${viewport.name}-${viewport.width}.png`), fullPage: true });
  await page.close();
}

const SUITES = {
  async 'share-page-shots'(context) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    for (const viewport of VIEWPORTS) {
      for (const state of STATES) await shootState(context, viewport, state);
    }
    console.log(`share page shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES };
