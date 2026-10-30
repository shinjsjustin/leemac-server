const fs = require('fs');
const path = require('path');
const { LEEMAC } = require('./data');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const DOCS_CSS = fs.readFileSync(path.join(__dirname, 'docs.css'), 'utf8');
const LOGO_URI = `data:image/svg+xml;base64,${fs
    .readFileSync(path.join(__dirname, '../../client/src/Leemac-Logo.svg'))
    .toString('base64')}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FORM_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

const usd = (value) => '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const longDate = (value) => {
    if (!value) return '';
    const match = FORM_DATE.exec(value);
    if (!match || match[1] < 1 || match[1] > 12) return value;
    return `${MONTHS[match[1] - 1]} ${Number(match[2])}, ${match[3]}`;
};

const addDays = (value, days) => {
    const match = FORM_DATE.exec(value || '');
    if (!match) return '';
    const d = new Date(Date.UTC(match[3], match[1] - 1, match[2], 12));
    if (Number.isNaN(d.getTime())) return '';
    d.setUTCDate(d.getUTCDate() + days);
    const [y, m, day] = d.toISOString().slice(0, 10).split('-');
    return `${m}-${day}-${y}`;
};

const masthead = (title, noLabel, no) => `<header class="masthead">
  <div class="brand">
    <img src="${LOGO_URI}" alt="Leemac">
    <div>
      <div class="name">${escapeHtml(LEEMAC.name)}</div>
      <div class="contact">${escapeHtml(LEEMAC.street)}, ${escapeHtml(LEEMAC.city)}<br>
      ${escapeHtml(LEEMAC.phone)} &middot; Fax ${escapeHtml(LEEMAC.fax)} &middot; ${escapeHtml(LEEMAC.email)}</div>
    </div>
  </div>
  <div class="doc-title"><h1>${escapeHtml(title)}</h1><div class="doc-no"><span>${escapeHtml(noLabel)}</span>${escapeHtml(no)}</div></div>
</header>`;

const party = (label, company, attn) => `<div class="party">
  <div class="label">${escapeHtml(label)}</div>
  <div class="co">${escapeHtml(company.name)}</div>
  ${[company.line1, company.line2].filter(Boolean).map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
  ${attn ? `<div class="attn"><b>Attn</b> ${escapeHtml(attn)}</div>` : ''}
</div>`;

const headline = (label, big, sub) => `<div class="headline">
  <div class="label">${escapeHtml(label)}</div><div class="big">${escapeHtml(big)}</div>${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''}
</div>`;

// An empty value drops the whole fact, so a missing PO leaves no bare label.
const facts = (list) => `<section class="facts">${list
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="fact"><div class="label">${escapeHtml(k)}</div><div class="value">${escapeHtml(v)}</div></div>`)
    .join('')}</section>`;

const lines = (parts, { prices, qtyLabel = 'Qty' }) => `<table class="lines">
<thead><tr><th class="item">#</th><th class="part">Part</th><th class="rev">Rev</th><th>Description</th><th class="qty n">${escapeHtml(qtyLabel)}</th>${prices ? '<th class="unit n">Unit price</th><th class="ext n">Ext price</th>' : ''}</tr></thead>
<tbody>
${parts.map((p, i) => `<tr><td class="item">${i + 1}</td><td class="part">${escapeHtml(p.number)}</td><td class="rev">${escapeHtml(p.rev || '—')}</td>
<td>${escapeHtml(p.description)}${p.details ? `<div class="details">${escapeHtml(p.details)}</div>` : ''}</td>
<td class="qty n">${escapeHtml(p.quantity)}</td>${prices ? `<td class="unit n">${usd(p.price)}</td><td class="ext n">${usd(p.quantity * p.price)}</td>` : ''}</tr>`).join('\n')}
</tbody></table>`;

const totalsTable = (rows) => `<table class="totals">${rows
    .map(([k, v, grand]) => `<tr${grand ? ' class="grand"' : ''}><td>${escapeHtml(k)}</td><td class="n">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>`;

const note = (label, html) => `<div class="block"><div class="label">${escapeHtml(label)}</div>${html}</div>`;

const preparedBy = () => note('Prepared by', `${escapeHtml(LEEMAC.preparedBy)} &middot; Tel ${escapeHtml(LEEMAC.tel)} &middot; Cell ${escapeHtml(LEEMAC.cell)}`);

const docPage = (title, footer, body, cls = 'letter') => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
${footer ? `<meta name="doc-footer" content="${escapeHtml(footer)}">\n` : ''}<style>
${DOCS_CSS}</style>
</head><body class="${escapeHtml(cls)}">
${body}
</body></html>
`;

const TAX_MATCH_TOLERANCE = 0.005;

// A flat job tax overrides the percent, so the percent is named only when the amount still matches it.
const taxLabel = (tax, subtotal) => {
    const isPercentTax = tax.flag === 'Y' && tax.percent > 0
        && Math.abs(tax.amount - (subtotal * tax.percent) / 100) <= TAX_MATCH_TOLERANCE;
    return isPercentTax ? `Tax ${tax.percent}%` : 'Tax';
};

module.exports = {
    escapeHtml,
    usd, longDate, addDays, taxLabel, masthead, party, headline, facts, lines, totalsTable, note, preparedBy, docPage,
};
