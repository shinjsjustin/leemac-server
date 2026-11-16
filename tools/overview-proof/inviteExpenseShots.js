const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { countOutside } = require('./checks');

// IDEA-0062 headless shots. SHOTS_DIR overrides where the PNGs go.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0062-shots');
const SETTLE_MS = 150;
const FILTER_TEXT = 'acme';
const CHOSEN_COMPANY_ID = '18';
const JOB_WITH_TOTAL = 100;
const JOB_WITHOUT_TOTAL = 101;

const settle = (page) => page.evaluate((ms) => new Promise((r) => { setTimeout(r, ms); }), SETTLE_MS);

// Counts selector matches that are rendered with a non-empty box.
const visibleCount = (page, selector) => page.$$eval(selector, (els) => els.filter((el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}).length);

// Pairs each matched control with its card box, so Node can judge whether any spills out of the card.
const controlsInCard = (page, cardSel, controlSel) => page.evaluate((card, controls) => {
  const toRect = ({ left, top, right, bottom }) => ({ left, top, right, bottom });
  const box = document.querySelector(card);
  if (!box) return [];
  return [...box.querySelectorAll(controls)].map((el) => ({ rect: toRect(el.getBoundingClientRect()), box: toRect(box.getBoundingClientRect()) }));
}, cardSel, controlSel);

async function shoot(page, state, viewport) {
  const file = path.join(shotsDir(), `${state}-${viewport.name}-${viewport.width}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

const optionLabels = (page) => page.$$eval('form select option', (els) => els.map((el) => el.textContent));

async function inviteStates({ openPage, check }, viewport) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, '/client-register');
  await settle(page);

  const labels = (await optionLabels(page)).slice(1);
  check(`invite select lists companies A-Z as Name (#id) at ${at}`, labels.join('|') === 'Acme (#7)|Acme Fasteners (#18)|Beta Tools (#4)|Cobalt Industries (#31)|Zenith Aerospace (#12)', labels.join('|'));
  check(`invite filter box and company select show at ${at}`, await visibleCount(page, 'input[placeholder="Filter companies"]') === 1 && await visibleCount(page, 'form select') === 1);
  check(`invite has no Company ID box at ${at}`, await visibleCount(page, 'input[placeholder*="Company ID"], input[type="number"]') === 0);
  check(`Send Invite starts disabled at ${at}`, await page.$eval('form button[type="submit"]', (b) => b.disabled));
  await shoot(page, 'invite-empty', viewport);

  await page.type('input[placeholder="Filter companies"]', FILTER_TEXT);
  await page.select('form select', CHOSEN_COMPANY_ID);
  await settle(page);
  const filtered = (await optionLabels(page)).slice(1);
  check(`filter narrows the select to the matches at ${at}`, filtered.join('|') === 'Acme (#7)|Acme Fasteners (#18)', filtered.join('|'));
  check(`Send Invite enabled once a company is chosen at ${at}`, await page.$eval('form button[type="submit"]', (b) => !b.disabled));
  await shoot(page, 'invite-chosen', viewport);
  await page.close();
}

async function expenseStates({ openPage, check }, viewport, jobId, state) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, `/job/${jobId}`);
  await settle(page);

  const rows = await visibleCount(page, '.jb-table tbody tr');
  check(`${state} expense rows show at ${at}`, rows === 2, `${rows} rows`);
  const inCard = '.jb-card:has(.jb-table)';
  const controls = await controlsInCard(page, inCard, '.jb-table input, .jb-table tfoot td, .jb-actions button');
  check(`${state} expense inputs, totals and buttons count inside the card at ${at}`, controls.length > 0);
  const actionRows = await page.$$eval('.jb-actions', (cells) => cells.map((c) => new Set([...c.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top))).size));
  check(`${state} PDF, Save and Delete share one row at ${at}`, actionRows.length === 2 && actionRows.every((n) => n === 1), actionRows.join(','));

  const net = await page.$$eval('.jb-table tfoot tr', (trs) => trs.map((tr) => tr.lastElementChild.textContent));
  if (jobId === JOB_WITHOUT_TOTAL) check(`net row shows a dash for a job with no total at ${at}`, net[1] === '—', net.join(' / '));
  else check(`net row shows money for a job with a total at ${at}`, net[1] === '$769.50', net.join(' / '));
  check(`totals row shows the expenses sum at ${at}`, net[0] === '$430.50', net.join(' / '));

  // Table cells may be scrolled out of the scroll box, so the card is judged by its scroll box, not by every cell.
  const boxes = await page.$eval('.jb-card:has(.jb-scroll)', (card) => {
    const toRect = ({ left, top, right, bottom }) => ({ left, top, right, bottom });
    const scroll = card.querySelector('.jb-scroll');
    // On a phone the layout turns the table itself into the scroller, so either element may scroll.
    const scrollers = [scroll, scroll.querySelector('.jb-table')];
    scrollers.forEach((el) => { el.scrollLeft = el.scrollWidth; });
    return { card: toRect(card.getBoundingClientRect()), scroll: toRect(scroll.getBoundingClientRect()), scrolled: Math.max(...scrollers.map((el) => el.scrollLeft)) };
  });
  check(`expense scroll box stays in the card at ${at}`, countOutside([{ rect: boxes.scroll, box: boxes.card }]) === 0);
  check(`expense card fits the page at ${at}`, boxes.card.right <= viewport.width, `${boxes.card.right}px`);
  check(`expense table scrolls sideways inside the card at ${at}`, boxes.scrolled > 0, `scrolled ${boxes.scrolled}px`);
  await shoot(page, `expenses-${state}`, viewport);
  await page.close();
}

const SUITES = {
  async 'invite-expense-shots'(context) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    for (const viewport of VIEWPORTS) {
      await inviteStates(context, viewport);
      await expenseStates(context, viewport, JOB_WITH_TOTAL, 'with-total');
      await expenseStates(context, viewport, JOB_WITHOUT_TOTAL, 'no-total');
    }
    console.log(`invite and expense shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES };
