// Writes the v1 document designs (HTML) from invented sample data. Usage: node build.js
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'v1');
const LABEL_MAX_LINES = 8; // parts that fit on the 4x6 label before "+N more"
const TERMS_DAYS = 30;

const LEEMAC = {
    name: 'Leemac Manufacturing Inc.',
    street: '1980 Hartog Drive',
    city: 'San Jose, CA 95131',
    phone: '(408) 573-0130',
    fax: '(408) 573-0131',
    email: 'leemac@leemac.co',
    preparedBy: 'Justin Shin',
    tel: '408-717-6241',
    cell: '669-369-8895',
    terms: 'Net 30 days',
    shipVia: 'Leemac delivery',
};

// ---- invented sample job ----
const JOB = {
    reference: '13742QNO',
    company: { name: 'Northgate Optics, Inc.', line1: '455 Calloway Court, Suite 210', line2: 'Milpitas, CA 95035' },
    attention: 'Dana Whitfield',
    created: '2026-10-02',
    poNumber: '4500918273',
    poDate: '2026-10-06',
    due: '2026-10-30',
    invoiceNumber: '10831',
    invoiceDate: '2026-10-30',
    shipDate: '2026-10-30',
    leadtime: '3-4 weeks after PO',
    taxable: true,
    taxPercent: 9.375,
};

const PARTS_3 = [
    { number: 'NG-20417', rev: 'B', description: 'Lens mount bracket', details: '*AL6061-T6 *Black anodize', quantity: 24, price: 48.5 },
    { number: 'NG-20433', rev: 'A', description: 'Sensor housing cover, 0.125 plate with tapped M3 holes and relief pocket per sheet 2; break all edges', details: '*AL6061 *Clear chem film', quantity: 12, price: 132 },
    { number: '13742-03', rev: '', description: 'Spacer ring, 2.000 OD x 1.250 ID x 0.250', details: '*SST303 *Passivate', quantity: 50, price: 9.75 },
];

const KINDS = ['Mounting plate', 'Shaft collar', 'Bearing cap', 'Sensor bracket', 'Spacer', 'Clamp block', 'Cover plate', 'Adapter flange', 'Locating pin', 'Housing'];
const MATERIALS = ['*AL6061 *Clear anodize', '*SST303 *Passivate', '*AL6061 *Black anodize', '*1018 steel *Black oxide', '*Delrin', '*AL7075 *Hard anodize'];
const PARTS_25 = Array.from({ length: 25 }, (_, i) => ({
    number: `NG-${21000 + i * 7}`,
    rev: 'ABC'[i % 3],
    description: i % 6 === 4
        ? `${KINDS[i % KINDS.length]}, long description that wraps: counterbore both sides, 4x 10-32 tapped thru, flatness 0.001 over the sealing face`
        : `${KINDS[i % KINDS.length]}, ${(1 + (i % 4) * 0.5).toFixed(3)} x ${(0.25 + (i % 3) * 0.125).toFixed(3)}`,
    details: MATERIALS[i % MATERIALS.length],
    quantity: [10, 4, 25, 2, 100, 8][i % 6],
    price: [36, 118.5, 12.25, 245, 4.8, 67][i % 6],
}));

// ---- helpers ----
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ESC[c]);
const money = (v) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const addDays = (iso, days) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

const totals = (job, parts) => {
    const subtotal = parts.reduce((s, p) => s + p.quantity * p.price, 0);
    const tax = job.taxable ? Math.round(subtotal * job.taxPercent) / 100 : 0;
    return { subtotal, tax, total: subtotal + tax, pieces: parts.reduce((s, p) => s + p.quantity, 0) };
};

// ---- blocks ----
const masthead = (title, noLabel, no) => `<header class="masthead">
  <div class="brand">
    <img src="leemac-logo.svg" alt="Leemac">
    <div>
      <div class="name">${esc(LEEMAC.name)}</div>
      <div class="contact">${esc(LEEMAC.street)}, ${esc(LEEMAC.city)}<br>
      ${esc(LEEMAC.phone)} &middot; Fax ${esc(LEEMAC.fax)} &middot; ${esc(LEEMAC.email)}</div>
    </div>
  </div>
  <div class="doc-title"><h1>${esc(title)}</h1><div class="doc-no"><span>${esc(noLabel)}</span>${esc(no)}</div></div>
</header>`;

const party = (label, company, attn) => `<div class="party">
  <div class="label">${esc(label)}</div>
  <div class="co">${esc(company.name)}</div>
  ${[company.line1, company.line2].filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join('')}
  ${attn ? `<div class="attn"><b>Attn</b> ${esc(attn)}</div>` : ''}
</div>`;

const headline = (label, big, sub) => `<div class="headline">
  <div class="label">${esc(label)}</div><div class="big">${esc(big)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
</div>`;

// A fact with an empty value is dropped, so a missing PO or Attn leaves no bare label.
const facts = (list) => `<section class="facts">${list
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="fact"><div class="label">${esc(k)}</div><div class="value">${esc(v)}</div></div>`)
    .join('')}</section>`;

const lines = (parts, { prices, qtyLabel = 'Qty' }) => `<table class="lines">
<thead><tr><th class="item">#</th><th class="part">Part</th><th class="rev">Rev</th><th>Description</th><th class="qty n">${esc(qtyLabel)}</th>${prices ? '<th class="unit n">Unit price</th><th class="ext n">Ext price</th>' : ''}</tr></thead>
<tbody>
${parts.map((p, i) => `<tr><td class="item">${i + 1}</td><td class="part">${esc(p.number)}</td><td class="rev">${esc(p.rev || '—')}</td>
<td>${esc(p.description)}${p.details ? `<div class="details">${esc(p.details)}</div>` : ''}</td>
<td class="qty n">${p.quantity}</td>${prices ? `<td class="unit n">${money(p.price)}</td><td class="ext n">${money(p.quantity * p.price)}</td>` : ''}</tr>`).join('\n')}
</tbody></table>`;

const totalsTable = (rows) => `<table class="totals">${rows
    .map(([k, v, grand]) => `<tr${grand ? ' class="grand"' : ''}><td>${esc(k)}</td><td class="n">${esc(v)}</td></tr>`)
    .join('')}</table>`;

const note = (label, html) => `<div class="block"><div class="label">${esc(label)}</div>${html}</div>`;
const preparedBy = () => note('Prepared by', `${esc(LEEMAC.preparedBy)} &middot; Tel ${esc(LEEMAC.tel)} &middot; Cell ${esc(LEEMAC.cell)}`);
const taxRows = (job, t) => [
    ['Subtotal', money(t.subtotal)],
    [job.taxable ? `Tax ${job.taxPercent}%` : 'Tax', money(t.tax)],
];

const page = (title, footer, body, cls = 'letter') => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="doc-footer" content="${esc(footer)}">
<link rel="stylesheet" href="docs.css">
</head><body class="${cls}">
${body}
</body></html>
`;

// ---- the five documents ----
const quote = (job, parts) => {
    const t = totals(job, parts);
    return page(`Quote ${job.reference}`, `Quote ${job.reference}`, `${masthead('Quote', 'Quote #', job.reference)}
<section class="parties">${party('To', job.company, job.attention)}<div></div>${headline('Quote total', money(t.subtotal), `${parts.length} lines · ${t.pieces} pcs`)}</section>
${facts([['Date', date(job.created)], ['Quote #', job.reference], ['Leadtime', job.leadtime]])}
${lines(parts, { prices: true })}
<section class="close"><div class="notes">${preparedBy()}</div>${totalsTable([['Total', money(t.subtotal), true]])}</section>`);
};

const order = (job, parts) => {
    const t = totals(job, parts);
    return page(`Order ${job.reference}`, `Order ${job.reference} · PO ${job.poNumber}`, `${masthead('Order', 'Ref #', job.reference)}
<section class="parties">${party('To', job.company, job.attention)}<div></div>${headline('Order total', money(t.total), `Due ${date(job.due)}`)}</section>
${facts([['Date', date(job.poDate)], ['Reference #', job.reference], ['PO number', job.poNumber], ['Due date', date(job.due)], ['Tax code', job.taxable ? 'Y (taxable)' : 'N'],
        ['Leadtime', job.leadtime], ['Ship via', LEEMAC.shipVia]])}
${lines(parts, { prices: true })}
<section class="close"><div class="notes">${preparedBy()}</div>${totalsTable([...taxRows(job, t), ['Total', money(t.total), true]])}</section>`);
};

const packing = (job, parts) => {
    const t = totals(job, parts);
    return page(`Packing List ${job.reference}`, `Packing list ${job.reference} · Invoice ${job.invoiceNumber}`, `${masthead('Packing List', 'Ref #', job.reference)}
<section class="parties">${party('Ship to', job.company, job.attention)}<div></div>${headline('Shipped', `${parts.length} lines · ${t.pieces} pcs`)}</section>
${facts([['Ship date', date(job.shipDate)], ['Invoice #', job.invoiceNumber], ['Reference #', job.reference], ['PO number', job.poNumber], ['Ship via', LEEMAC.shipVia]])}
${lines(parts, { prices: false, qtyLabel: 'Qty shipped' })}
<section class="close"><div class="notes">${preparedBy()}</div></section>
<section class="signoff"><div><div class="line"></div><div class="label">Received by</div></div><div><div class="line"></div><div class="label">Date</div></div></section>`);
};

const invoice = (job, parts) => {
    const t = totals(job, parts);
    const payDue = date(addDays(job.invoiceDate, TERMS_DAYS));
    return page(`Invoice ${job.invoiceNumber}`, `Invoice ${job.invoiceNumber} · Ref ${job.reference}${job.poNumber ? ` · PO ${job.poNumber}` : ''}`, `${masthead('Invoice', 'Invoice #', job.invoiceNumber)}
<section class="parties">${party('Bill to', job.company, 'Accounts Payable')}${party('Ship to', job.company, job.attention)}${headline('Amount due', money(t.total), `Due ${payDue}`)}</section>
${facts([['Invoice date', date(job.invoiceDate)], ['Payment due', payDue], ['Terms', LEEMAC.terms], ['PO number', job.poNumber], ['Reference #', job.reference],
        ['Ship date', date(job.shipDate)], ['Delivery due', date(job.due)], ['Tax code', job.taxable ? 'Y (taxable)' : 'N'], ['Ship via', LEEMAC.shipVia]])}
${lines(parts, { prices: true })}
<section class="close"><div class="notes">
${note('Remit to', `${esc(LEEMAC.name)}, ${esc(LEEMAC.street)}, ${esc(LEEMAC.city)}<br>Checks payable to ${esc(LEEMAC.name)}`)}
${note('Payment terms', `${esc(LEEMAC.terms)} from invoice date. Please quote invoice # ${esc(job.invoiceNumber)} with payment.`)}
${note('Prepared by', `${esc(LEEMAC.preparedBy)} &middot; ${esc(LEEMAC.phone)} &middot; ${esc(LEEMAC.email)}`)}
</div>${totalsTable([...taxRows(job, t), ['Total due', money(t.total), true]])}</section>`);
};

const shipping = (job, parts) => {
    const t = totals(job, parts);
    const overflow = parts.length > LABEL_MAX_LINES;
    const shown = overflow ? parts.slice(0, LABEL_MAX_LINES - 1) : parts;
    const ref = (k, v) => (v ? `<div><div class="tag">${esc(k)}</div><div class="v">${esc(v)}</div></div>` : '');
    return page(`Shipping ${job.reference}`, '', `<div class="lbl">
<div class="from"><div><span class="tag">From</span><br><b>${esc(LEEMAC.name)}</b><br>${esc(LEEMAC.street)}, ${esc(LEEMAC.city)} &middot; ${esc(LEEMAC.phone)}</div></div>
<div class="shipto"><div class="tag">Ship to</div><div class="co">${esc(job.company.name)}</div>
<div class="addr">${[job.company.line1, job.company.line2].filter(Boolean).map(esc).join('<br>')}</div>
${job.attention ? `<div class="attn">Attn: ${esc(job.attention)}</div>` : ''}</div>
<div class="refs">${ref('PO', job.poNumber)}${ref('Invoice', job.invoiceNumber)}${ref('Ref', job.reference)}</div>
<div class="parts">${shown.map((p) => `<div class="prow"><span class="pn">${esc(p.number)}${p.rev ? ` rev ${esc(p.rev)}` : ''}</span><span class="pd">${esc(p.description)}</span><span class="pq">Qty ${p.quantity}</span></div>`).join('')}
${overflow ? `<div class="more">+${parts.length - shown.length} more, see packing list</div>` : ''}</div>
<div class="foot"><span>Ship date ${esc(date(job.shipDate))}</span><span>${parts.length} lines &middot; ${t.pieces} pcs</span></div>
</div>`, 'label-doc');
};

// Long variant: 25 lines, no Attn, to prove page flow and that missing fields leave no labels.
const LONG_JOB = { ...JOB, attention: '' };

const FILES = {
    'quote.html': quote(JOB, PARTS_3),
    'order.html': order(JOB, PARTS_3),
    'packing.html': packing(JOB, PARTS_3),
    'shipping.html': shipping(JOB, PARTS_3),
    'invoice.html': invoice(JOB, PARTS_3),
    'invoice-25.html': invoice(LONG_JOB, PARTS_25),
    'shipping-25.html': shipping(LONG_JOB, PARTS_25),
};

for (const [name, html] of Object.entries(FILES)) {
    fs.writeFileSync(path.join(OUT, name), html);
    console.log(path.join(OUT, name));
}
