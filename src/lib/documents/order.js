const { LEEMAC } = require('./data');
const { escapeHtml, money, page, header, partsTable } = require('./layout');

const addressBlock = (label, c) =>
    `${label}:<br>${escapeHtml(c.name)}<br>${escapeHtml(c.line1)}<br>${escapeHtml(c.line2)}<br>Attn. ${escapeHtml(c.attention)}`;

const orderHtml = (data) => {
    const body = `${header()}
<table class="meta"><tr>
<td>${addressBlock('Ship to', data.customer)}</td>
<td>${addressBlock('Sold to', data.customer)}</td>
<td>Reference # ${escapeHtml(data.reference)}<br>
<span>Customer Order Number</span><br>${escapeHtml(data.poNumber)}<br>
P.O. Date ${escapeHtml(data.dates.po)}<br>
Delivery Date ${escapeHtml(data.dates.due)}<br>
<span>Tax</span> <b>${data.tax.flag}</b><br>
Ship via ${escapeHtml(LEEMAC.shipVia)}</td>
</tr></table>
${partsTable(data.parts)}
<div class="totals">Subtotal ${money(data.subtotal)}</div>`;
    return page(`Order ${data.reference}`, body);
};

module.exports = { orderHtml };
