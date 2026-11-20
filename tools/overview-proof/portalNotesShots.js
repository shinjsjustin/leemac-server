const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// IDEA-0065 headless shots of the client portal note screens, logged in as a client. SHOTS_DIR overrides where the PNGs go.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0065-portal-shots');
const SETTLE_MS = 150;
const LOAD_TIMEOUT_MS = 10000;
const SPILL_SLACK_PX = 1;
const MIN_STEP_LINES = 3;
const PHONE_WIDTH_PX = 390;
const CLICK_FROM_TOP_PX = 150;
const PART_ID = 9000;
const PART_NUMBER = 'HSX-BRACKET-9000';
const NOTED_JOB = { id: 100, number: 'J-2026-13800-REV-B' };
const THREAD_JOB_ID = 101;
const NEW_NOTE_TEXT = 'Please ship by Friday.';
const PROCESS_STEPS = ['1. Saw bar stock to length', '2. Mill the pockets and drill the holes', '3. Deburr all edges', '4. Black anodize, Type II'];

const STATES = [
  {
    state: 'client-part',
    route: `/client-part/${PART_ID}`,
    ready: '.portal-part-steps-text',
    texts: ['Part messages', 'Hole spacing confirmed against the drawing.', 'Thanks, please start the run.', 'LEEMAC', 'Process Steps', ...PROCESS_STEPS],
  },
  {
    state: 'client-job',
    route: `/client-job/${THREAD_JOB_ID}`,
    ready: '.portal-job-notes .portal-pin-part-tag',
    texts: ['Notes on this job', `Part ${PART_NUMBER}`, 'Please check the hole spacing on this bracket.'],
  },
  {
    state: 'client-add-note',
    route: `/client-job/${NOTED_JOB.id}`,
    ready: '.portal-job-note-btn',
    open: `Notes on ${NOTED_JOB.number}`,
    texts: ['Thanks, confirmed.'],
    desktopTexts: [`Notes on ${NOTED_JOB.number}`, 'Cancel', 'Save'],
  },
  {
    state: 'qc-placed',
    route: `/client-part/${PART_ID}`,
    ready: '.portal-qc-view svg',
    place: true,
    texts: [],
    desktopTexts: ['Marking 1', 'Point'],
  },
];

const settle = (page) => page.evaluate((ms) => new Promise((r) => { setTimeout(r, ms); }), SETTLE_MS);

// Runs in the page before the app: the drawing file reply is JSON { content, mimetype }; turn it into real bytes.
// Note writes are recorded so the suite can see what Save sent.
function preparePage() {
  window.__noteWrites = [];
  const realFetch = window.fetch;
  window.fetch = async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    if (String(url).includes('/portal-notes') && method !== 'GET') {
      window.__noteWrites.push({ method, path: new URL(url).pathname, body: JSON.parse(init.body) });
    }
    const response = await realFetch(url, init);
    if (!/\/portal\/files\/\d+$/.test(String(url)) || !response.ok) return response;
    const { content, mimetype } = await response.json();
    const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': mimetype } });
  };
}

async function openPrepared({ openPage }, viewport, route) {
  const page = await openPage({ width: viewport.width, height: viewport.height }, route, 'client');
  await page.evaluateOnNewDocument(preparePage);
  await page.reload({ waitUntil: 'networkidle0' });
  return page;
}

async function waitFor(context, page, selector, name) {
  try {
    await page.waitForSelector(selector, { timeout: LOAD_TIMEOUT_MS });
  } catch (e) {
    context.check(name, false, e.message);
  }
}

const clickByLabel = (page, selector, label) => page.evaluate((sel, text) => {
  const button = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text || b.getAttribute('aria-label') === text);
  if (button) button.click();
  return Boolean(button);
}, selector, label);

const pageWidth = (page) => page.evaluate(() => document.scrollingElement.scrollWidth);

// Boxes that scroll or clip sideways hide content off-screen even when the page itself fits.
const NOTE_AREAS = '.portal-part-messages, .portal-part-steps, .portal-job-notes, .portal-note-form, .portal-qc-view';
const clippedBoxes = (page) => page.evaluate((areas) => [...document.querySelectorAll(areas)].flatMap((root) => [root, ...root.querySelectorAll('*')]).filter((el) => {
  const { overflowX } = getComputedStyle(el);
  return overflowX !== 'visible' && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
}).map((el) => `${el.tagName.toLowerCase()}.${el.className} ${el.scrollWidth}>${el.clientWidth}`), NOTE_AREAS);

// The steps text must be read-only, show one rendered line per step, and the messages must sit below the drawing.
const measurePart = (page) => page.evaluate(() => {
  const steps = document.querySelector('.portal-part-steps');
  const text = steps.querySelector('.portal-part-steps-text');
  const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || parseFloat(getComputedStyle(text).fontSize) * 1.5;
  const drawings = document.querySelector('#qc-drawings').getBoundingClientRect();
  const messages = document.querySelector('.portal-part-messages');
  return {
    stepLines: Math.round(text.getBoundingClientRect().height / lineHeight),
    stepFields: steps.querySelectorAll('input, textarea, button').length,
    messagesBelowDrawing: messages.getBoundingClientRect().top >= drawings.bottom - 1,
    hasLeemacTag: [...messages.querySelectorAll('.portal-pin-note-tag--leemac')].some((el) => el.textContent === 'LEEMAC'),
    hasClientNote: [...messages.querySelectorAll('.portal-pin-note-tag:not(.portal-pin-note-tag--leemac)')].length > 0,
  };
});

const measureThread = (page) => page.evaluate(() => ({
  tags: [...document.querySelectorAll('.portal-job-notes .portal-pin-part-tag')].map((el) => el.textContent),
}));

// The phone job page hides the job-row Notes form (the client-notes suite asserts that), so its way to add a
// note is the Add note button, which focuses the job's reply box.
const NOTE_BOX = '.portal-note-form textarea, .portal-job-notes .portal-pin-reply textarea';
const measureForm = (page) => page.evaluate((boxSelector) => {
  const form = document.querySelector('.portal-note-form') || document.querySelector('.portal-job-notes');
  const rect = form.getBoundingClientRect();
  const box = form.querySelector('textarea');
  return { value: box.value, isFocused: document.activeElement === box, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight };
}, NOTE_BOX);

const measureQc = (page) => page.evaluate(() => {
  const card = document.querySelector('.portal-qc-card');
  const area = card && card.querySelector('textarea');
  const point = [...document.querySelectorAll('.qc-toolbar button')].find((b) => b.textContent.trim() === 'Point');
  const rect = card ? card.getBoundingClientRect() : null;
  return {
    hasCard: Boolean(card),
    isToolbarHidden: getComputedStyle(document.querySelector('.portal-qc-toolbar')).display === 'none',
    isFocused: Boolean(area) && document.activeElement === area,
    pointActive: Boolean(point) && point.getAttribute('aria-pressed') === 'true',
    marks: document.querySelectorAll('.portal-qc-mark').length,
    cardRight: rect ? rect.right : 0,
    cardLeft: rect ? rect.left : 0,
  };
});

async function placePoint(page) {
  const found = await clickByLabel(page, '.qc-toolbar button', 'Point');
  // The drawing can be taller than the window, so click near its top once that is in view.
  await page.$eval('.portal-qc-view svg', (el) => el.scrollIntoView({ block: 'start' }));
  const box = await (await page.$('.portal-qc-view svg')).boundingBox();
  const at = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, CLICK_FROM_TOP_PX) };
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  return found;
}

function stateChecks({ check }, state, found, at) {
  if (state === 'client-part') {
    check(`client-part shows one line per Process Step at ${at}`, found.stepLines >= MIN_STEP_LINES, `${found.stepLines} lines`);
    check(`client-part Process Steps are read-only at ${at}`, found.stepFields === 0, `${found.stepFields} fields`);
    check(`client-part Part messages sit under the drawing at ${at}`, found.messagesBelowDrawing, '');
    check(`client-part shows a Leemac and a client message at ${at}`, found.hasLeemacTag && found.hasClientNote, JSON.stringify(found));
  }
  if (state === 'client-job') {
    check(`client-job tags the part message "Part ${PART_NUMBER}" at ${at}`, found.tags.length === 1 && found.tags[0] === `Part ${PART_NUMBER}`, JSON.stringify(found.tags));
  }
  if (state === 'client-add-note') {
    check(`client-add-note form opens empty at ${at}`, found.value === '', `text "${found.value}"`);
    check(`client-add-note box has focus at ${at}`, found.isFocused, JSON.stringify(found));
    check(`client-add-note box is inside the window at ${at}`, found.left >= 0 && found.right <= found.width && found.top >= 0 && found.bottom <= found.height, JSON.stringify(found));
  }
  if (state === 'qc-placed' && at === `${PHONE_WIDTH_PX}px`) {
    // The phone drawing is view-only: its toolbar is hidden, so no mark can be placed there.
    check(`qc-placed hides the drawing toolbar and places nothing at ${at}`, found.isToolbarHidden && !found.hasCard && found.marks === 0, JSON.stringify(found));
    return;
  }
  if (state === 'qc-placed') {
    check(`qc-placed has one mark and its pinned card at ${at}`, found.marks === 1 && found.hasCard, JSON.stringify(found));
    check(`qc-placed card textarea has focus at ${at}`, found.isFocused, JSON.stringify(found));
    check(`qc-placed Point tool is still active at ${at}`, found.pointActive, JSON.stringify(found));
    check(`qc-placed card stays inside the window at ${at}`, found.cardLeft >= 0 && found.cardRight <= found.viewportWidth, JSON.stringify(found));
  }
}

async function measureState(page, state) {
  if (state === 'client-part') return measurePart(page);
  if (state === 'client-job') return measureThread(page);
  if (state === 'client-add-note') return measureForm(page);
  return { ...(await measureQc(page)), viewportWidth: page.viewport().width };
}

async function checkSave({ check }, page, at, isPhone) {
  await page.$eval(NOTE_BOX, (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, NEW_NOTE_TEXT);
  await page.$eval(isPhone ? '.portal-job-notes .portal-pin-reply button[type="submit"]' : '.portal-note-form button[type="submit"]', (el) => el.click());
  await page.waitForFunction(() => window.__noteWrites.length > 0, { timeout: LOAD_TIMEOUT_MS });
  const [written] = await page.evaluate(() => window.__noteWrites);
  const expected = { method: 'POST', path: '/api/portal-notes', body: { job_id: NOTED_JOB.id, content: NEW_NOTE_TEXT } };
  check(`client-add-note Save sends POST { job_id, content } at ${at}`, JSON.stringify(written) === JSON.stringify(expected), JSON.stringify(written));
}

async function shootState(context, viewport, { state, route, ready, open, place, texts, desktopTexts = [] }) {
  const at = `${viewport.width}px`;
  const isPhone = viewport.name === 'phone';
  const page = await openPrepared(context, viewport, route);
  await waitFor(context, page, ready, `${state} finishes loading at ${at}`);
  if (open) {
    const label = isPhone ? 'Add note' : open;
    context.check(`${state} has a "${label}" button at ${at}`, await clickByLabel(page, 'button', label), label);
    if (!isPhone) await waitFor(context, page, '.portal-note-form', `${state} opens the form at ${at}`);
  }
  if (place && !isPhone) context.check(`${state} has a Point tool at ${at}`, await placePoint(page), 'Point');
  await settle(page);
  const text = await page.evaluate(() => document.body.innerText);
  const inputs = await page.evaluate(() => [...document.querySelectorAll('textarea')].map((el) => el.value).join('\n'));
  (isPhone ? texts : [...texts, ...desktopTexts]).forEach((label) => context.check(`${state} shows "${label}" at ${at}`, text.toLowerCase().includes(label.toLowerCase()) || inputs.includes(label), text));
  stateChecks(context, state, await measureState(page, state), at);
  const scrollWidth = await pageWidth(page);
  context.check(`${state} whole page fits the viewport width at ${at}`, scrollWidth <= viewport.width + SPILL_SLACK_PX, `page scroll width ${scrollWidth}`);
  const clipped = await clippedBoxes(page);
  context.check(`${state} hides no content in a sideways scroll box at ${at}`, clipped.length === 0, clipped.join(', '));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(shotsDir(), `${state}-${viewport.name}-${viewport.width}.png`), fullPage: true });
  if (open) await checkSave(context, page, at, isPhone);
  await page.close();
}

const SUITES = {
  async 'portal-notes-shots'(context) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    for (const viewport of VIEWPORTS) {
      for (const state of STATES) await shootState(context, viewport, state);
    }
    console.log(`portal notes shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES };
