const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// IDEA-0063 headless shots. SHOTS_DIR overrides where the PNGs go; SHOT_PREFIX tells before from after.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0063-shots');
const shotPrefix = () => process.env.SHOT_PREFIX || 'after';
const SETTLE_MS = 150;
const FILTER_TEXT = 'acme';
const CHOSEN_COMPANY_ID = '18';
const EMAIL_ROWS = 2;
const DARK_LUMINANCE_MAX = 0.3;
const EDGE_SLACK_PX = 1;
const MAX_DELETE_TO_OPEN_WIDTH = 2;
const STYLE_PROPS = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderTopLeftRadius', 'fontSize'];
const isAfter = () => shotPrefix() !== 'before';
const EMAIL_PAGES = [{ state: 'job-emails', route: '/job/100' }, { state: 'part-emails', route: '/part/9000' }];

// True when two rects share any area; touching edges don't count.
const rectsOverlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// Rects of the visible fixed bars that would land on the Emails card in a shot taken now.
const barsOverCard = (page) => page.evaluate(() => {
  const toRect = ({ left, top, right, bottom }) => ({ left, top, right, bottom });
  const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Emails');
  const card = toRect((heading.closest('section') || heading.parentElement).getBoundingClientRect());
  const bars = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  });
  return { card, bars: bars.map((el) => ({ name: `${el.tagName.toLowerCase()}.${el.className}`, rect: toRect(el.getBoundingClientRect()) })) };
});

const settle = (page) => page.evaluate((ms) => new Promise((r) => { setTimeout(r, ms); }), SETTLE_MS);

// A fullPage shot keeps fixed bars at the viewport's edges, so a bottom bar lands mid-page.
// Growing the viewport to the page height puts every fixed bar at the true page edges.
const MAX_GROW_TRIES = 3;
async function growToPage(page, viewport) {
  for (let i = 0; i < MAX_GROW_TRIES; i += 1) {
    const height = await page.evaluate(() => document.scrollingElement.scrollHeight);
    if (height <= page.viewport().height) return;
    await page.setViewport({ width: viewport.width, height });
    await settle(page);
  }
}

async function shoot(page, state, viewport) {
  const file = path.join(shotsDir(), `${shotPrefix()}-${state}-${viewport.name}-${viewport.width}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

const optionLabels = (page) => page.$$eval('form select option', (els) => els.map((el) => el.textContent));

// Computed look of the Email input and the company select, plus how many choices the select lists and shows.
const measureInvite = (page, props) => page.evaluate((names) => {
  const pick = (el) => Object.fromEntries(names.map((n) => [n, getComputedStyle(el)[n]]));
  const select = document.querySelector('form select');
  return { input: pick(document.querySelector('form input[type="email"]')), select: pick(select), size: select.size, options: select.options.length };
}, props);

async function inviteStates({ openPage, check }, viewport) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, '/client-register');
  await settle(page);

  const labels = (await optionLabels(page)).slice(1);
  check(`invite select lists companies A-Z as Name (#id) at ${at}`, labels.join('|') === 'Acme (#7)|Acme Fasteners (#18)|Beta Tools (#4)|Cobalt Industries (#31)|Zenith Aerospace (#12)', labels.join('|'));
  check(`Send Invite starts disabled at ${at}`, await page.$eval('form button[type="submit"]', (b) => b.disabled));
  if (isAfter()) {
    const m = await measureInvite(page, STYLE_PROPS);
    const differing = STYLE_PROPS.filter((p) => m.input[p] !== m.select[p]);
    check(`company select matches the Email input's padding, border, radius and font size at ${at}`, differing.length === 0, differing.map((p) => `${p} ${m.select[p]} vs ${m.input[p]}`).join('; '));
    check(`company select shows every choice at ${at}`, m.size >= m.options, `size ${m.size} for ${m.options} options`);
  }
  await shoot(page, 'invite-list', viewport);

  await page.type('input[placeholder="Filter companies"]', FILTER_TEXT);
  await page.select('form select', CHOSEN_COMPANY_ID);
  await settle(page);
  const filtered = (await optionLabels(page)).slice(1);
  check(`filter narrows the select to the matches at ${at}`, filtered.join('|') === 'Acme (#7)|Acme Fasteners (#18)', filtered.join('|'));
  check(`Send Invite enabled once a company is chosen at ${at}`, await page.$eval('form button[type="submit"]', (b) => !b.disabled));
  await shoot(page, 'invite-chosen', viewport);
  await page.close();
}

// Reads the Emails card: subject colours, Open/Delete tops, every part against the card box, and the page and column edges.
const measureCard = (page) => page.evaluate(() => {
  const toRect = ({ left, top, right, bottom }) => ({ left, top, right, bottom });
  const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Emails');
  const card = heading.closest('section') || heading.parentElement;
  const box = toRect(card.getBoundingClientRect());
  const rows = [...card.querySelectorAll('li')];
  const side = card.closest('.jp-side');
  const root = document.scrollingElement;
  const channels = (el) => getComputedStyle(el).color.match(/[\d.]+/g).slice(0, 3).map(Number);
  const luminance = (el) => {
    const [r, g, b] = channels(el).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parts = card.querySelectorAll('li strong, li a, li button');
  return {
    box,
    isCardClass: card.classList.contains('em-card'),
    inSide: side ? side.contains(card) : false,
    clientWidth: document.documentElement.clientWidth,
    sideways: root.scrollWidth - root.clientWidth,
    luminances: rows.map((li) => luminance(li.querySelector('strong'))),
    rowTops: rows.map((li) => ({ open: li.querySelector('a').getBoundingClientRect().top, del: li.querySelector('button').getBoundingClientRect().top, openW: li.querySelector('a').getBoundingClientRect().width, delW: li.querySelector('button').getBoundingClientRect().width })),
    pairs: [...parts].map((el) => ({ rect: toRect(el.getBoundingClientRect()), box })),
  };
});

async function checkEmailCard({ check }, page, state, at, isJob) {
  const m = await measureCard(page);
  const outside = m.pairs.filter(({ rect, box }) => rect.left < box.left - EDGE_SLACK_PX || rect.right > box.right + EDGE_SLACK_PX || rect.top < box.top - EDGE_SLACK_PX || rect.bottom > box.bottom + EDGE_SLACK_PX).length;
  check(`${state} subjects are dark at ${at}`, m.luminances.length > 0 && m.luminances.every((l) => l < DARK_LUMINANCE_MAX), m.luminances.join(', '));
  check(`${state} Open and Delete share one top per row at ${at}`, m.rowTops.length > 0 && m.rowTops.every((t) => Math.abs(t.open - t.del) <= EDGE_SLACK_PX), JSON.stringify(m.rowTops));
  if (isAfter()) check(`${state} Delete is at most twice as wide as Open at ${at}`, m.rowTops.every((t) => t.delW <= MAX_DELETE_TO_OPEN_WIDTH * t.openW), JSON.stringify(m.rowTops));
  check(`${state} subjects, links and buttons sit inside the card at ${at}`, m.pairs.length > 0 && outside === 0, `${outside} outside`);
  if (isJob) {
    check(`${state} card sits inside the right column at ${at}`, m.inSide);
    check(`${state} page has no sideways scroll at ${at}`, m.sideways <= EDGE_SLACK_PX, `${m.sideways}px`);
  } else {
    check(`${state} card right edge is inside the viewport at ${at}`, m.box.right <= m.clientWidth + EDGE_SLACK_PX, `${m.box.right} of ${m.clientWidth}`);
  }
}

async function emailStates({ openPage, check }, viewport, { state, route }) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, route, 'admin');
  await settle(page);
  const rows = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Emails');
    if (!heading) return 0;
    heading.scrollIntoView();
    return (heading.closest('section') || heading.parentElement).querySelectorAll('li').length;
  });
  check(`${state} shows two email rows at ${at}`, rows === EMAIL_ROWS, `${rows} rows`);
  if (isAfter()) await checkEmailCard({ check }, page, state, at, state === 'job-emails');
  // Fixed bars draw at the page edges only from scroll 0 with the viewport grown to the page; otherwise they cross the card.
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  await growToPage(page, viewport);
  check(`${state} is scrolled to the top for the shot at ${at}`, (await page.evaluate(() => window.scrollY)) === 0);
  if (isAfter()) {
    const { card, bars } = await barsOverCard(page);
    const over = bars.filter((b) => rectsOverlap(b.rect, card));
    check(`${state} no fixed bar covers the Emails card in the shot at ${at}`, over.length === 0, over.map((b) => b.name).join(', '));
  }
  await shoot(page, state, viewport);
  await page.close();
}

const SUITES = {
  async 'invite-emails-shots'(context) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    for (const viewport of VIEWPORTS) {
      await inviteStates(context, viewport);
      for (const target of EMAIL_PAGES) await emailStates(context, viewport, target);
    }
    console.log(`invite and emails shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES, rectsOverlap };
