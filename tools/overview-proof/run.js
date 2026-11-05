const os = require('node:os');
const path = require('node:path');
const { SUITES: ADMIN_SUITES } = require('./admin');
const { SUITES: CLIENT_SUITES } = require('./client');
const { startHarness } = require('./harness');

const OVERVIEW_ROUTE = '/starred-jobs';
const PAGE_HEIGHT_PX = 800;
const WIDTHS_PX = [1000, 768, 393];
const ROW_SELECTOR = '.ov-prow';

const SUITES = {
  ...ADMIN_SUITES,
  ...CLIENT_SUITES,
  async smoke({ openPage, check }) {
    for (const width of WIDTHS_PX) {
      const page = await openPage({ width, height: PAGE_HEIGHT_PX }, OVERVIEW_ROUTE);
      const rows = await page.$$eval(ROW_SELECTOR, (els) => els.length);
      check(`overview at ${width}px shows part rows`, rows > 0, `found ${rows}`);
      await page.screenshot({ path: path.join(os.tmpdir(), `overview-proof-${width}.png`) });
      await page.close();
    }
  },
};

async function main() {
  const suite = SUITES[process.argv[2]];
  if (!suite) {
    console.error(`usage: run.js <${Object.keys(SUITES).join('|')}>`);
    return 2;
  }
  const harness = await startHarness();
  const failed = [];
  const check = (name, isOk, detail = '') => {
    console.log(`${isOk ? 'pass' : 'FAIL'} ${name}`);
    if (!isOk) failed.push(detail ? `${name}: ${detail}` : name);
  };
  try {
    await suite({ ...harness, check });
  } catch (e) {
    failed.push(`suite crashed: ${e.message}`);
  } finally {
    await harness.close();
  }
  failed.push(...harness.failures);
  failed.forEach((f) => console.error(`FAILED ${f}`));
  console.log(`screenshots in ${os.tmpdir()}`);
  return failed.length ? 1 : 0;
}

main().then((code) => process.exit(code));
