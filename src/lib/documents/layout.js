const { LEEMAC } = require('./data');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

const money = (value) => Number(value).toFixed(2);

const CSS = `
body { font-family: Arial, sans-serif; font-size: 11pt; margin: 0; }
h1 { font-size: 20pt; margin: 0; }
.header { text-align: center; margin-bottom: 12px; }
.meta { width: 100%; margin-bottom: 12px; }
.meta td { vertical-align: top; padding: 2px 6px; }
table.parts { width: 100%; border-collapse: collapse; }
table.parts th, table.parts td { border: 1px solid #000; padding: 3px 5px; text-align: left; }
table.parts td.num { text-align: right; }
.totals { margin-top: 8px; text-align: right; }
`;

const header = () => `<div class="header">
<h1>${escapeHtml(LEEMAC.name)}</h1>
<div>${escapeHtml(LEEMAC.address)}</div>
<div>Phone ${escapeHtml(LEEMAC.phone)} Fax ${escapeHtml(LEEMAC.fax)}</div>
</div>`;

const page = (title, body, { size = 'letter' } = {}) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${size}; margin: 0.5in; }${CSS}</style>
</head>
<body>
${body}
</body>
</html>`;

const partRow = (p) => `<tr>
<td>${p.item}</td><td>${escapeHtml(p.number)}</td><td>${escapeHtml(p.rev)}</td>
<td>${escapeHtml(p.description)}<br>${escapeHtml(p.details)}</td>
<td class="num">${escapeHtml(p.quantity)}</td><td class="num">${money(p.price)}</td><td class="num">${money(p.ext)}</td>
</tr>`;

const partsTable = (parts) => `<table class="parts">
<thead><tr><th>Item</th><th>Part #</th><th>Rev</th><th>Description / Details</th><th>Qty</th><th>Unit Price</th><th>Ext Price</th></tr></thead>
<tbody>
${parts.map(partRow).join('\n')}
</tbody>
</table>`;

module.exports = { escapeHtml, money, page, header, partsTable };
