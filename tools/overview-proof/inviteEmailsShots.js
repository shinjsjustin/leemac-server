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
const EMAIL_PAGES = [{ state: 'job-emails', route: '/job/100' }, { state: 'part-emails', route: '/part/9000' }];

const settle = (page) => page.evaluate((ms) => new Promise((r) => { setTimeout(r, ms); }), SETTLE_MS);

async function shoot(page, state, viewport) {
  const file = path.join(shotsDir(), `${shotPrefix()}-${state}-${viewport.name}-${viewport.width}.png`);
  await page.screenshot({ path: file, fullPage: true });
}

const optionLabels = (page) => page.$$eval('form select option', (els) => els.map((el) => el.textContent));

async function inviteStates({ openPage, check }, viewport) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, '/client-register');
  await settle(page);

  const labels = (await optionLabels(page)).slice(1);
  check(`invite select lists companies A-Z as Name (#id) at ${at}`, labels.join('|') === 'Acme (#7)|Acme Fasteners (#18)|Beta Tools (#4)|Cobalt Industries (#31)|Zenith Aerospace (#12)', labels.join('|'));
  check(`Send Invite starts disabled at ${at}`, await page.$eval('form button[type="submit"]', (b) => b.disabled));
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

async function emailStates({ openPage, check }, viewport, { state, route }) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, route, 'admin');
  await settle(page);
  const rows = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.trim() === 'Emails');
    if (!heading) return 0;
    heading.scrollIntoView();
    return heading.parentElement.querySelectorAll('li').length;
  });
  check(`${state} shows two email rows at ${at}`, rows === EMAIL_ROWS, `${rows} rows`);
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

module.exports = { SUITES };
