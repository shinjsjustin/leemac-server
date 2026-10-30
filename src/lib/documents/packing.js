const { LEEMAC } = require('./data');
const { escapeHtml, page, header } = require('./layout');

const addressBlock = (label, c) =>
    `${label}:<br>${escapeHtml(c.name)}<br>${escapeHtml(c.line1)}<br>${escapeHtml(c.line2)}<br>Attn. ${escapeHtml(c.attention)}`;

// No partial shipments exist, so shipped always equals ordered and the balance is 0.
const partRow = (p) => `<tr>
<td>${p.item}</td><td>${escapeHtml(p.number)}</td><td>${escapeHtml(p.rev)}</td>
<td>${escapeHtml(p.description)}<br>${escapeHtml(p.details)}</td>
<td class="num">${escapeHtml(p.quantity)}</td><td class="num">${escapeHtml(p.quantity)}</td><td class="num">0</td>
</tr>`;

const packingHtml = (data) => {
    const body = `${header()}
<table class="meta"><tr>
<td>${addressBlock('Ship to', data.customer)}</td>
<td>${addressBlock('Sold to', data.customer)}</td>
<td>Ref # ${escapeHtml(data.reference)}<br>
Customer Order Number<br>PO ${escapeHtml(data.poNumber)}<br>
Invoice# ${escapeHtml(data.invoiceNumber)}<br>
SHIP DATE ${escapeHtml(data.dates.ship)}<br>
Terms ${escapeHtml(LEEMAC.paymentTerm)}<br>
Ship via ${escapeHtml(LEEMAC.shipVia)}</td>
</tr></table>
<table class="parts">
<thead><tr><th>Item</th><th>Part #</th><th>Rev</th><th>Description / Details</th><th>Qty Ordered</th><th>Qty Shipped</th><th>Qty Bal</th></tr></thead>
<tbody>
${data.parts.map(partRow).join('\n')}
</tbody>
</table>`;
    return page(`Packing List ${data.reference}`, body);
};

module.exports = { packingHtml };
