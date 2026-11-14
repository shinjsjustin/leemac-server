const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { allowFinances } = require('./fixtures');
const { countOutside } = require('./checks');

// IDEA-0061 headless shots. SHOTS_DIR overrides where the PNGs go.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0061-shots');
const SETTLE_MS = 150;

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

const clickButton = (page, scope, text) => page.evaluate((sel, label) => {
  const target = [...document.querySelectorAll(`${sel} button`)].find((b) => b.textContent.trim().startsWith(label));
  if (target) target.click();
  return Boolean(target);
}, scope, text);

async function shoot(page, state, viewport) {
  const file = path.join(shotsDir(), `${state}-${viewport.name}-${viewport.width}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

async function financeStates({ openPage, check }, viewport) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, '/finances');
  await settle(page);

  check(`invoices receivables downloads at ${at}`, await visibleCount(page, '#invoices .fl-downloads button') === 4);
  check(`invoices header controls stay in the card at ${at}`, countOutside(await controlsInCard(page, '#invoices', '.fl-head button')) === 0);
  await shoot(page, 'finances-invoices', viewport);

  check(`expenses download at ${at}`, await visibleCount(page, '#expenses .fl-download button') === 2);
  await shoot(page, 'finances-expenses', viewport);

  check(`Paid tab opens at ${at}`, await clickButton(page, '#invoices .fl-tabs', 'Paid'));
  await settle(page);
  check(`paid date field per paid invoice at ${at}`, await visibleCount(page, '#invoices input[type="date"]') === 3);
  const paidControls = await controlsInCard(page, '#invoices', 'input[type="date"], .fl-actions button, .fl-tabs button');
  check(`paid rows stay in the card at ${at}`, paidControls.length > 0 && countOutside(paidControls) === 0, `${countOutside(paidControls)} outside`);
  const sideways = await page.$$eval('#invoices .fl-group', (els) => Math.max(0, ...els.map((el) => el.scrollWidth - el.clientWidth)));
  check(`paid rows fit without sideways scroll at ${at}`, sideways <= 1, `${sideways}px hidden`);
  await shoot(page, 'finances-paid', viewport);
  await page.close();
}

async function jobStates({ openPage, check }, viewport) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, '/joblist');
  check(`level 3 period select at ${at}`, await visibleCount(page, 'select[aria-label="Period"]') === 1);
  await page.select('select[aria-label="Period"]', '7');
  await page.waitForNetworkIdle();
  check(`level 3 ledger download after choosing a period at ${at}`, await visibleCount(page, '.fl-download button') === 2);
  await shoot(page, 'jobs-level3-period', viewport);
  await page.close();

  allowFinances(false);
  try {
    // Level 2 is the lowest level that opens /joblist; the finances routes refuse it.
    const low = await openPage({ width: viewport.width, height: viewport.height }, '/joblist', 'admin2');
    check(`level 2 jobs list renders at ${at}`, await visibleCount(low, '.requests-table') === 1);
    check(`level 2 has no period select at ${at}`, await visibleCount(low, 'select[aria-label="Period"]') === 0);
    check(`level 2 has no ledger download at ${at}`, await visibleCount(low, '.fl-download') === 0);
    await shoot(low, 'jobs-level2', viewport);
    await low.close();

    const denied = await openPage({ width: viewport.width, height: viewport.height }, '/joblist', 'admin1');
    check(`level 1 is refused the jobs list at ${at}`, denied.url().endsWith('/access-denied') && await visibleCount(denied, '.fl-download, .requests-table') === 0);
    await shoot(denied, 'jobs-level1', viewport);
    await denied.close();
  } finally {
    allowFinances(true);
  }
}

const SUITES = {
  async 'finance-shots'(context) {
    fs.mkdirSync(shotsDir(), { recursive: true });
    for (const viewport of VIEWPORTS) {
      await financeStates(context, viewport);
      await jobStates(context, viewport);
    }
    console.log(`finance shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES };
