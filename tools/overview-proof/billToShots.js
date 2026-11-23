const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { documentData } = require('../../src/lib/documents/data');
const { renderDocumentHtml } = require('../../src/lib/documents');
const { WD_BILL_TO, includeWdCompany } = require('./fixtures');

// IDEA-0066 headless shots of the Company page and the invoice with a bill-to. SHOTS_DIR overrides where the files go.
const VIEWPORTS = [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
const shotsDir = () => process.env.SHOTS_DIR || path.join(os.tmpdir(), 'idea-0066-shots');
const LOAD_TIMEOUT_MS = 10000;
const WIDTH_SLACK_PX = 1;
const COMPANY_ROUTE = '/company';

const NO_ATTN = 'Attn Accounts Payable';
const WD_LINES = Object.entries(WD_BILL_TO.columns).filter(([key]) => key !== 'bill_to_name').map(([, line]) => line);

const job = (overrides) => ({
  job_number: 13706, company_code: 'QWD', company_name: 'WD Media, Inc', address_line1: '1 Main St', address_line2: 'San Jose, CA 95131',
  attention: 'Bob', po_number: 'PO-9', invoice_number: '10796', created_at: new Date(2026, 0, 5), invoice_date: new Date(2026, 1, 3),
  invoice_clicked_at: new Date(2026, 1, 12), tax_code: 0, tax: 0, tax_percent: 0, ...overrides,
});
const PARTS = [{ number: 'P-1', rev: 'A', description: 'Bracket', details: '', quantity: 2, price: 5 }];
const invoiceHtml = (overrides) => renderDocumentHtml('invoice', documentData({ job: job(overrides), parts: PARTS }));

// Text between a party label and the next party block, so Bill to and Ship to are read apart.
const partyText = (label) => (page) => page.evaluate((name) => {
  const box = [...document.querySelectorAll('.party')].find((el) => el.querySelector('.label')?.textContent.trim() === name);
  return box ? box.innerText : '';
}, label);

const INVOICE_STATES = [
  {
    state: 'invoice-wd',
    html: invoiceHtml(WD_BILL_TO.columns),
    bill: { has: [WD_BILL_TO.columns.bill_to_name, ...WD_LINES], lacks: ['Attn'] },
    ship: { has: [WD_BILL_TO.companyName], lacks: [] },
    pdf: 'invoice-wd.pdf',
  },
  {
    state: 'invoice-plain',
    html: invoiceHtml({}),
    bill: { has: ['WD Media, Inc', NO_ATTN], lacks: [WD_BILL_TO.columns.bill_to_name] },
    ship: { has: ['WD Media, Inc'], lacks: [] },
  },
];

const screenshot = (page, state, viewport) => page.screenshot({ path: path.join(shotsDir(), `${state}-${viewport.name}-${viewport.width}.png`), fullPage: true });

function checkWidth(check, page, state, viewport) {
  return page.evaluate(() => document.scrollingElement.scrollWidth).then((width) => {
    check(`${state} page fits the viewport width at ${viewport.width}px`, width <= viewport.width + WIDTH_SLACK_PX, `page scroll width ${width}`);
  });
}

async function shootCompany({ openPage, check }, viewport) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, COMPANY_ROUTE);
  try {
    await page.waitForFunction(
      (name) => [...document.querySelectorAll('input')].some((i) => i.value === name),
      { timeout: LOAD_TIMEOUT_MS },
      WD_BILL_TO.companyName,
    );
  } catch (e) {
    check(`company-bill-to lists ${WD_BILL_TO.companyName} at ${at}`, false, e.message);
  }
  const values = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value));
  const expected = [WD_BILL_TO.companyName, ...Object.values(WD_BILL_TO.columns)];
  expected.forEach((value) => check(`company-bill-to shows "${value}" in an input at ${at}`, values.includes(value), values.join(' | ')));
  await checkWidth(check, page, 'company-bill-to', viewport);
  await screenshot(page, 'company-bill-to', viewport);
  await page.close();
}

async function shootInvoice({ openPage, check }, viewport, spec) {
  const at = `${viewport.width}px`;
  const page = await openPage({ width: viewport.width, height: viewport.height }, COMPANY_ROUTE);
  await page.setContent(spec.html, { waitUntil: 'load' });
  const [bill, ship] = await Promise.all([partyText('Bill to')(page), partyText('Ship to')(page)]);
  spec.bill.has.forEach((t) => check(`${spec.state} Bill to shows "${t}" at ${at}`, bill.includes(t), bill));
  spec.bill.lacks.forEach((t) => check(`${spec.state} Bill to omits "${t}" at ${at}`, !bill.includes(t), bill));
  spec.ship.has.forEach((t) => check(`${spec.state} Ship to shows "${t}" at ${at}`, ship.includes(t), ship));
  await checkWidth(check, page, spec.state, viewport);
  await screenshot(page, spec.state, viewport);
  if (spec.pdf && viewport.name === 'desktop') await page.pdf({ path: path.join(shotsDir(), spec.pdf), format: 'letter', printBackground: true });
  await page.close();
}

const SUITES = {
  async 'bill-to-shots'(context) {
    includeWdCompany();
    fs.mkdirSync(shotsDir(), { recursive: true });
    for (const viewport of VIEWPORTS) {
      await shootCompany(context, viewport);
      for (const spec of INVOICE_STATES) await shootInvoice(context, viewport, spec);
    }
    console.log(`bill-to shots in ${shotsDir()}`);
  },
};

module.exports = { SUITES };
